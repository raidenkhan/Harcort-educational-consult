import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/services/auth/queries";
import type { Profile, StudyGroupMessage, StudyGroupRole } from "@/types";

/**
 * Study-group queries (0023) — the /groups page's data layer.
 *
 * These run on the service-role client (RLS bypassed), so every read is
 * explicitly scoped to the signed-in user: a caller only ever sees a group
 * they are a member of (checked via `getGroupMembership`).
 */

export interface GroupListItem {
  id: string;
  name: string;
  courseName: string | null;
  role: StudyGroupRole;
  memberCount: number;
  isArchived: boolean;
  createdAt: string;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
}

export interface GroupMeta {
  id: string;
  name: string;
  description: string | null;
  joinCode: string;
  courseName: string | null;
  isOwner: boolean;
  isArchived: boolean;
  memberCount: number;
}

export interface GroupMemberView {
  profileId: string;
  name: string;
  role: StudyGroupRole;
}

type GroupJoinRow = {
  id: string;
  name: string;
  is_archived: boolean;
  created_at: string;
  /** Embedded relation — PostgREST reports it as an array. */
  courses: { name: string }[] | null;
};

/** Read the embedded course name (PostgREST gives a single-element array). */
function courseName(courses: { name: string }[] | null): string | null {
  return courses?.[0]?.name ?? null;
}

/** The caller's membership row in a group, or null when they aren't in it. */
export async function getGroupMembership(
  groupId: string,
  profileId: string,
): Promise<{ role: StudyGroupRole } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("study_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return null;
  return { role: (data as { role: StudyGroupRole }).role };
}

/** The signed-in user's groups, newest first, with course name, member count
 *  and a last-message preview for the list. */
export async function listMyGroupsForUser(): Promise<GroupListItem[]> {
  const current = await getCurrentProfile();
  if (!current) return [];

  const supabase = createAdminClient();

  const { data: membershipRows } = await supabase
    .from("study_group_members")
    .select("group_id, role")
    .eq("profile_id", current.id);

  const memberships = (membershipRows ?? []) as {
    group_id: string;
    role: StudyGroupRole;
  }[];
  if (memberships.length === 0) return [];

  const roleByGroup = new Map(memberships.map((m) => [m.group_id, m.role]));
  const ids = memberships.map((m) => m.group_id);

  const { data: groupRows } = await supabase
    .from("study_groups")
    .select("id, name, is_archived, created_at, courses(name)")
    .in("id", ids)
    .order("created_at", { ascending: false });

  const groups = (groupRows ?? []) as unknown as GroupJoinRow[];
  if (groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);

  const [{ data: allMemberRows }, { data: messageRows }] = await Promise.all([
    supabase.from("study_group_members").select("group_id").in("group_id", groupIds),
    supabase
      .from("study_group_messages")
      .select("group_id, body, sender_id, created_at")
      .in("group_id", groupIds)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const countByGroup = new Map<string, number>();
  for (const row of (allMemberRows ?? []) as { group_id: string }[]) {
    countByGroup.set(row.group_id, (countByGroup.get(row.group_id) ?? 0) + 1);
  }

  // Newest-first + capped: the FIRST row per group is its last message.
  const lastByGroup = new Map<string, StudyGroupMessage>();
  for (const m of (messageRows ?? []) as StudyGroupMessage[]) {
    if (!lastByGroup.has(m.group_id)) lastByGroup.set(m.group_id, m);
  }

  return groups.map((g) => {
    const last = lastByGroup.get(g.id);
    return {
      id: g.id,
      name: g.name,
      courseName: courseName(g.courses),
      role: roleByGroup.get(g.id) ?? "member",
      memberCount: countByGroup.get(g.id) ?? 0,
      isArchived: g.is_archived,
      createdAt: g.created_at,
      lastMessage: last
        ? { body: last.body, senderId: last.sender_id, createdAt: last.created_at }
        : null,
    };
  });
}

/** Header info for the active group — membership-checked. */
export async function getGroupMeta(
  groupId: string,
  profile: Profile,
): Promise<GroupMeta | null> {
  const supabase = createAdminClient();

  const membership = await getGroupMembership(groupId, profile.id);
  if (!membership) return null;

  const { data: group } = await supabase
    .from("study_groups")
    .select("id, name, description, join_code, is_archived, courses(name)")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return null;

  const { count } = await supabase
    .from("study_group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);

  const g = group as unknown as {
    id: string;
    name: string;
    description: string | null;
    join_code: string;
    is_archived: boolean;
    courses: { name: string }[] | null;
  };

  return {
    id: g.id,
    name: g.name,
    description: g.description,
    joinCode: g.join_code,
    courseName: courseName(g.courses),
    isOwner: membership.role === "owner",
    isArchived: g.is_archived,
    memberCount: count ?? 0,
  };
}

/** Full message feed for one group, oldest first. Null when the group doesn't
 *  exist or the caller isn't a member. */
export async function listGroupMessages(
  groupId: string,
  profile: Profile,
): Promise<StudyGroupMessage[] | null> {
  const supabase = createAdminClient();

  if (!(await getGroupMembership(groupId, profile.id))) return null;

  const { data } = await supabase
    .from("study_group_messages")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  return (data as StudyGroupMessage[]) ?? [];
}

/** Members of a group, owner first. Null when the caller isn't a member. */
export async function listGroupMembers(
  groupId: string,
  profile: Profile,
): Promise<GroupMemberView[] | null> {
  const supabase = createAdminClient();

  if (!(await getGroupMembership(groupId, profile.id))) return null;

  const { data } = await supabase
    .from("study_group_members")
    .select("profile_id, role, profiles(full_name)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  const rows = (data ?? []) as unknown as {
    profile_id: string;
    role: StudyGroupRole;
    profiles: { full_name: string }[] | null;
  }[];

  return rows
    .map((row) => ({
      profileId: row.profile_id,
      name: row.profiles?.[0]?.full_name ?? "Member",
      role: row.role,
    }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));
}
