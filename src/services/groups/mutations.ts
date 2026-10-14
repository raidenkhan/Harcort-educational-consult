"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyGroupMessage } from "@/lib/email/notify";
import { optionalText } from "@/lib/forms";
import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import { getGroupMembership } from "./queries";
import {
  createGroupSchema,
  groupIdSchema,
  joinGroupSchema,
  sendGroupMessageSchema,
} from "./schemas";

/**
 * Study-group mutations (0023).
 * The acting user is derived from the session cookie on every call; the
 * service-role client bypasses RLS, so authorization (tutor-or-admin create,
 * member-only send/read) is enforced here explicitly.
 */

export type GroupFormState = {
  ok?: boolean;
  groupId?: string;
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
