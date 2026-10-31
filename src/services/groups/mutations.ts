"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyGroupAdded, notifyGroupMessage } from "@/lib/email/notify";
import { formText, optionalText } from "@/lib/forms";
import { siteUrl } from "@/lib/site";
import { notifySmsToProfiles } from "@/lib/sms";
import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import { listTutorRoster } from "@/services/tutors/roster";
import { getGroupMembership, listJoinableGroupsForStudent } from "./queries";
import {
  addGroupMembersSchema,
  createGroupSchema,
  groupIdSchema,
  joinGroupSchema,
  sendGroupMessageSchema,
} from "./schemas";

/**
 * Study-group mutations (0023 + 0036).
 * The acting user is derived from the session cookie on every call; the
 * service-role client bypasses RLS, so authorization (tutor-or-admin create,
 * owner-only add/archive, member-only send/read) is enforced here explicitly.
 */

export type GroupFormState = {
  ok?: boolean;
  groupId?: string;
  /** How many students a tutor just added (addGroupMembers). */
  added?: number;
  error?: string;
};

/** Unambiguous alphabet — no I/O/0/1, so a shared code is easy to type. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newJoinCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Tutor (or admin) creates a group; they become its owner. */
export async function createGroup(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const profile = await requireProfile();
  if (profile.role !== "tutor" && !profileIsAdmin(profile)) {
    return { error: "Only tutors can create study groups." };
  }

  const parsed = createGroupSchema.safeParse({
    name: formData.get("name"),
    courseId: optionalText(formData.get("courseId")),
    description: optionalText(formData.get("description")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { name, courseId, description } = parsed.data;

  const supabase = createAdminClient();

  // Insert the group, retrying the (rare) join-code collision.
  let groupId: string | null = null;
  for (let attempt = 0; attempt < 5 && !groupId; attempt++) {
    const { data, error } = await supabase
      .from("study_groups")
      .insert({
        name,
        course_id: courseId ?? null,
        description: description ?? null,
        join_code: newJoinCode(),
        created_by: profile.id,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") continue;
      return { error: error.message };
    }
    groupId = (data as { id: string }).id;
  }
  if (!groupId) return { error: "Couldn't create the group — try again." };

  const { error: memberError } = await supabase
    .from("study_group_members")
    .insert({ group_id: groupId, profile_id: profile.id, role: "owner" });
  if (memberError) return { error: memberError.message };

  revalidatePath("/groups");
  return { ok: true, groupId };
}

/** Any signed-in user joins a group by its shared code (idempotent). */
export async function joinGroup(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const profile = await requireProfile();

  const parsed = joinGroupSchema.safeParse({
    joinCode: formData.get("joinCode"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a code." };
  }
  const joinCode = parsed.data.joinCode;

  const supabase = createAdminClient();

  const { data: group } = await supabase
    .from("study_groups")
    .select("id, is_archived")
    .eq("join_code", joinCode)
    .maybeSingle();
  if (!group) return { error: "No group matches that code." };

  const g = group as { id: string; is_archived: boolean };
  if (g.is_archived) return { error: "That group has been archived." };

  const existing = await getGroupMembership(g.id, profile.id);
  if (!existing) {
    const { error } = await supabase
      .from("study_group_members")
      .insert({ group_id: g.id, profile_id: profile.id, role: "member" });
    if (error && error.code !== "23505") return { error: error.message };
  }

  revalidatePath("/groups");
  return { ok: true, groupId: g.id };
}

/**
 * The owner (or an admin) adds students to a group.
 *
 * This is the answer to "how do the students get the group": before 0036 the
 * only way in was a join code the student had to be told out-of-band. The
 * tutor picks from their own roster (accepted requests, engagements or
 * sessions — `listTutorRoster`), and every newly-added student gets an email
 * and a text with a link straight into the group.
 *
 * Idempotent: a student already in the group is skipped, so re-submitting the
 * picker (or two tutors adding the same person) never duplicates a membership
 * or re-sends a notification.
 */
export async function addGroupMembers(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const profile = await requireProfile();

  const parsed = addGroupMembersSchema.safeParse({
    groupId: formText(formData.get("groupId")),
    profileIds: formData.getAll("studentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pick a student." };
  }
  const { groupId, profileIds } = parsed.data;

  const supabase = createAdminClient();

  const isAdmin = profileIsAdmin(profile);
  const membership = await getGroupMembership(groupId, profile.id);
  if (!isAdmin && membership?.role !== "owner") {
    return { error: "Only the group's tutor can add students." };
  }

  const { data: group } = await supabase
    .from("study_groups")
    .select("name, is_archived, courses(name)")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { error: "Group not found." };
  const g = group as unknown as {
    name: string;
    is_archived: boolean;
    courses: { name: string }[] | null;
  };
  if (g.is_archived) return { error: "This group has been archived." };

  // A tutor may only add students they actually work with. Admins may add
  // anyone (they run the platform and may need to repair a group).
  if (!isAdmin) {
    const roster = await listTutorRoster(profile);
    const rosterIds = new Set(roster.map((entry) => entry.studentId));
    if (profileIds.some((id) => !rosterIds.has(id))) {
      return {
        error: "You can only add students you're already working with.",
      };
    }
  }

  // Names for the "added you" system message, and a reality check that every
  // id exists (a stale roster entry must not abort the whole add).
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", profileIds);
  const nameById = new Map(
    ((profileRows ?? []) as { id: string; full_name: string }[]).map((row) => [
      row.id,
      row.full_name || "a student",
    ]),
  );
  const validIds = profileIds.filter((id) => nameById.has(id));
  if (validIds.length === 0) return { error: "Those students no longer exist." };

  const { data: existingRows } = await supabase
    .from("study_group_members")
    .select("profile_id")
    .eq("group_id", groupId)
    .in("profile_id", validIds);
  const alreadyIn = new Set(
    ((existingRows ?? []) as { profile_id: string }[]).map((row) => row.profile_id),
  );
  const toAdd = validIds.filter((id) => !alreadyIn.has(id));
  if (toAdd.length === 0) return { ok: true, groupId, added: 0 };

  const { error } = await supabase.from("study_group_members").upsert(
    toAdd.map((id) => ({ group_id: groupId, profile_id: id, role: "member" })),
    { onConflict: "group_id,profile_id", ignoreDuplicates: true },
  );
  if (error) return { error: error.message };

  // A visible trace in the feed — a student opening the group sees why they
  // are there, and the rest of the group sees who joined. Inserted AFTER the
  // memberships, so `last_read_at` (default now()) leaves it unread for the
  // students who were just added.
  const actorName = profile.full_name || "Your tutor";
  const addedNames = toAdd.map((id) => nameById.get(id) ?? "a student");
  const body =
    addedNames.length === 1
      ? `${actorName} added ${addedNames[0]} to the group.`
      : `${actorName} added ${addedNames.length} students to the group.`;
  await supabase.from("study_group_messages").insert({
    group_id: groupId,
    sender_id: profile.id,
    body,
  });

  const courseName = g.courses?.[0]?.name ?? null;
  notifyGroupAdded({
    recipientProfileIds: toAdd,
    tutorName: actorName,
    groupName: g.name,
    courseName,
    groupId,
  });
  notifySmsToProfiles(
    toAdd,
    `Harcourt: ${actorName} added you to the study group "${g.name}"${courseName ? ` for ${courseName}` : ""}. Open it here: ${siteUrl(`/groups?g=${groupId}`)}`,
    "group_added",
    `group-added:${groupId}`,
  );

  revalidatePath("/groups");
  return { ok: true, groupId, added: toAdd.length };
}

/**
 * One-tap join for a student who is already eligible: a group run by a tutor
 * they have an accepted request with, or attached to a course they've booked.
 * Eligibility is re-checked here against `listJoinableGroupsForStudent` — the
 * same function that rendered the suggestion — so a crafted post cannot join
 * a group the student has no relationship with.
 */
export async function joinGroupById(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const profile = await requireProfile();

  const parsed = groupIdSchema.safeParse({
    groupId: formText(formData.get("groupId")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Missing group." };
  }
  const { groupId } = parsed.data;

  const joinable = await listJoinableGroupsForStudent(profile);
  if (!joinable.some((group) => group.id === groupId)) {
    return { error: "This group isn't open to you yet." };
  }

  const supabase = createAdminClient();
  const existing = await getGroupMembership(groupId, profile.id);
  if (!existing) {
    const { error } = await supabase
      .from("study_group_members")
      .insert({ group_id: groupId, profile_id: profile.id, role: "member" });
    if (error && error.code !== "23505") return { error: error.message };
  }

  revalidatePath("/groups");
  return { ok: true, groupId };
}

/** Send a message into a group the caller belongs to. */
export async function sendGroupMessage(
  formData: FormData,
): Promise<GroupFormState> {
  const profile = await requireProfile();

  const parsed = sendGroupMessageSchema.safeParse({
    groupId: formData.get("groupId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Type a message first." };
  }
  const { groupId, body } = parsed.data;

  const supabase = createAdminClient();

  if (!(await getGroupMembership(groupId, profile.id))) {
    return { error: "You're not a member of this group." };
  }

  const { data: group } = await supabase
    .from("study_groups")
    .select("name, is_archived")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { error: "Group not found." };
  const g = group as { name: string; is_archived: boolean };
  if (g.is_archived) return { error: "This group has been archived." };

  const { error } = await supabase.from("study_group_messages").insert({
    group_id: groupId,
    sender_id: profile.id,
    body,
  });
  if (error) return { error: error.message };

  // Email the other members — best-effort, sent after the response.
  const { data: memberRows } = await supabase
    .from("study_group_members")
    .select("profile_id")
    .eq("group_id", groupId);
  const recipients = ((memberRows ?? []) as { profile_id: string }[])
    .map((m) => m.profile_id)
    .filter((id) => id !== profile.id);
  if (recipients.length > 0) {
    notifyGroupMessage({
      recipientProfileIds: recipients,
      senderName: profile.full_name || "Someone",
      groupName: g.name,
      body,
      groupId,
    });
  }

  revalidatePath("/groups");
  return { ok: true };
}

/** A member leaves a group (the owner can't leave their own group). */
export async function leaveGroup(formData: FormData): Promise<void> {
  const profile = await requireProfile();

  const parsed = groupIdSchema.safeParse({ groupId: formData.get("groupId") });
  if (!parsed.success) return;

  const membership = await getGroupMembership(parsed.data.groupId, profile.id);
  if (!membership || membership.role === "owner") return;

  const supabase = createAdminClient();
  await supabase
    .from("study_group_members")
    .delete()
    .eq("group_id", parsed.data.groupId)
    .eq("profile_id", profile.id);

  revalidatePath("/groups");
}

/**
 * Stamp the caller's read watermark (0036). Called by the workspace when a
 * group is opened, so the unread pill clears and the nav badge drops. The
 * client refreshes afterwards — this is a write, not a read.
 */
export async function markGroupRead(groupId: string): Promise<void> {
  const profile = await requireProfile();

  const parsed = groupIdSchema.safeParse({ groupId });
  if (!parsed.success) return;

  const membership = await getGroupMembership(parsed.data.groupId, profile.id);
  if (!membership) return;

  const supabase = createAdminClient();
  await supabase
    .from("study_group_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("group_id", parsed.data.groupId)
    .eq("profile_id", profile.id);
}

/** The owner archives a group (soft-delete — messages are kept). */
export async function archiveGroup(formData: FormData): Promise<void> {
  const profile = await requireProfile();

  const parsed = groupIdSchema.safeParse({ groupId: formData.get("groupId") });
  if (!parsed.success) return;

  const membership = await getGroupMembership(parsed.data.groupId, profile.id);
  if (!membership || membership.role !== "owner") return;

  const supabase = createAdminClient();
  await supabase
    .from("study_groups")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.groupId);

  revalidatePath("/groups");
}
