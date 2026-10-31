import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/services/auth/queries";
import type { Profile, StudyGroupMessage, StudyGroupRole } from "@/types";

/**
 * Study-group queries (0023 + 0036) — the /groups page's data layer.
 *
 * These run on the service-role client (RLS bypassed), so every read is
 * explicitly scoped to the signed-in user: a caller only ever sees a group
 * they are a member of (checked via `getGroupMembership`).
 *
 * 0036 added `study_group_members.last_read_at`. Everything the page needs to
 * feel like a messaging app — an unread count per group, the sender's name on
 * the last-message preview, and the groups a student is eligible to join —
 * is derived here in one pass so the list, the thread header and the nav
 * badge can never disagree.
 */

export interface GroupListItem {
  id: string;
  name: string;
  courseName: string | null;
  role: StudyGroupRole;
  memberCount: number;
  isArchived: boolean;
  createdAt: string;
  /** Messages newer than this member's watermark, excluding their own. */
  unreadCount: number;
  lastMessage: {
    body: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
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

/** A group the student is entitled to join without typing a code. */
export interface JoinableGroup {
  id: string;
  name: string;
  courseName: string | null;
  ownerName: string;
  memberCount: number;
}

type GroupJoinRow = {
  id: string;
  name: string;
  is_archived: boolean;
  created_at: string;
  /** Embedded relation — PostgREST reports it as an array. */
  courses: { name: string }[] | null;
};

type MembershipRow = {
  group_id: string;
  role: StudyGroupRole;
  last_read_at: string;
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

/**
 * The caller's membership rows, tolerating a database that hasn't run 0036
 * yet. The whole /groups page reads through this: if `last_read_at` is
 * missing, the select errors and a naive reader would return no groups at
 * all — the page would look empty until the migration is applied. The
 * fallback treats every message as already read, which is the pre-0036
 * behaviour (no unread badges) rather than a blank screen.
 */
async function readMemberships(
  supabase: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<MembershipRow[]> {
  const withRead = await supabase
    .from("study_group_members")
    .select("group_id, role, last_read_at")
    .eq("profile_id", profileId);
  if (!withRead.error) return (withRead.data ?? []) as MembershipRow[];

  const legacy = await supabase
    .from("study_group_members")
    .select("group_id, role")
    .eq("profile_id", profileId);
  return ((legacy.data ?? []) as { group_id: string; role: StudyGroupRole }[]).map(
    (row) => ({ ...row, last_read_at: new Date().toISOString() }),
  );
}

/**
 * Unread counts for a set of memberships.
 *
 * One query covers every group: fetch the messages newer than the OLDEST
 * watermark, then compare each row against its own group's watermark. The
 * cap only bites after 2,000 unread messages across all of a member's groups,
 * which is far past the point where the exact number matters.
 */
async function unreadByGroup(
  profileId: string,
  memberships: MembershipRow[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (memberships.length === 0) return counts;

  const supabase = createAdminClient();
  const groupIds = memberships.map((m) => m.group_id);
  const oldest = memberships.reduce(
    (min, m) => (m.last_read_at < min ? m.last_read_at : min),
    memberships[0].last_read_at,
  );
  const readAt = new Map(
    memberships.map((m) => [m.group_id, new Date(m.last_read_at).getTime()]),
  );

  const { data } = await supabase
    .from("study_group_messages")
    .select("group_id, sender_id, created_at")
    .in("group_id", groupIds)
    .gt("created_at", oldest)
    .neq("sender_id", profileId)
    .order("created_at", { ascending: false })
    .limit(2000);

  for (const row of (data ?? []) as {
    group_id: string;
    sender_id: string;
    created_at: string;
  }[]) {
    const watermark = readAt.get(row.group_id);
    if (watermark === undefined) continue;
    if (new Date(row.created_at).getTime() <= watermark) continue;
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  return counts;
}

/** The signed-in user's groups, most recently active first, with course name,
 *  member count, unread count and a last-message preview for the list. */
export async function listMyGroupsForUser(): Promise<GroupListItem[]> {
  const current = await getCurrentProfile();
  if (!current) return [];

  const supabase = createAdminClient();

  const memberships = await readMemberships(supabase, current.id);
  if (memberships.length === 0) return [];

  const roleByGroup = new Map(memberships.map((m) => [m.group_id, m.role]));
  const ids = memberships.map((m) => m.group_id);

  const [{ data: groupRows }, { data: messageRows }, unread] = await Promise.all([
    supabase
      .from("study_groups")
      .select("id, name, is_archived, created_at, courses(name)")
      .in("id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("study_group_messages")
      .select("group_id, body, sender_id, created_at, profiles(full_name)")
      .in("group_id", ids)
      .order("created_at", { ascending: false })
      .limit(500),
    unreadByGroup(current.id, memberships),
  ]);

  const groups = (groupRows ?? []) as unknown as GroupJoinRow[];
  if (groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);

  const { data: allMemberRows } = await supabase
    .from("study_group_members")
    .select("group_id")
    .in("group_id", groupIds);

  const countByGroup = new Map<string, number>();
  for (const row of (allMemberRows ?? []) as { group_id: string }[]) {
    countByGroup.set(row.group_id, (countByGroup.get(row.group_id) ?? 0) + 1);
  }

  // Newest-first + capped: the FIRST row per group is its last message.
  const lastByGroup = new Map<
    string,
    {
      body: string;
      sender_id: string;
      created_at: string;
      profiles: { full_name: string }[] | null;
    }
  >();
  for (const m of (messageRows ?? []) as unknown as {
    group_id: string;
    body: string;
    sender_id: string;
    created_at: string;
    profiles: { full_name: string }[] | null;
  }[]) {
    if (!lastByGroup.has(m.group_id)) lastByGroup.set(m.group_id, m);
  }

  const items = groups.map((g) => {
    const last = lastByGroup.get(g.id);
    return {
      id: g.id,
      name: g.name,
      courseName: courseName(g.courses),
      role: roleByGroup.get(g.id) ?? "member",
      memberCount: countByGroup.get(g.id) ?? 0,
      isArchived: g.is_archived,
      createdAt: g.created_at,
      unreadCount: unread.get(g.id) ?? 0,
      lastMessage: last
        ? {
            body: last.body,
            senderId: last.sender_id,
            senderName: last.profiles?.[0]?.full_name ?? "Member",
            createdAt: last.created_at,
          }
        : null,
    };
  });

  // WhatsApp ordering: a group with a fresh message floats above one whose
  // last activity is older, regardless of when the group was created.
  return items.sort((a, b) => {
    const aAt = a.lastMessage?.createdAt ?? a.createdAt;
    const bAt = b.lastMessage?.createdAt ?? b.createdAt;
    return bAt.localeCompare(aAt);
  });
}

/** Total unread group messages for the nav badge. Accepts the already-loaded
 *  profile so the app shell doesn't hit `profiles` a second time per request. */
export async function countUnreadGroupMessages(
  profile?: Profile | null,
): Promise<number> {
  const current = profile ?? (await getCurrentProfile());
  if (!current) return 0;

  const supabase = createAdminClient();
  const memberships = await readMemberships(supabase, current.id);
  if (memberships.length === 0) return 0;

  const unread = await unreadByGroup(current.id, memberships);
  let total = 0;
  for (const count of unread.values()) total += count;
  return total;
}

/**
 * Groups a student can join in one tap: run by a tutor they have an accepted
 * request with, or attached to a course they've already booked. This is the
 * "how do I see myself in a group" path — the code still works, but a student
 * who is already working with a tutor doesn't have to ask for it.
 */
export async function listJoinableGroupsForStudent(
  profile: Profile,
): Promise<JoinableGroup[]> {
  if (profile.role !== "student") return [];

  const supabase = createAdminClient();

  const [{ data: requestRows }, { data: membershipRows }] = await Promise.all([
    supabase
      .from("tutor_requests")
      .select("tutor_profile_id, course_id")
      .eq("student_id", profile.id)
      .eq("status", "accepted"),
    supabase
      .from("study_group_members")
      .select("group_id")
      .eq("profile_id", profile.id),
  ]);

  const requests = (requestRows ?? []) as {
    tutor_profile_id: string;
    course_id: string | null;
  }[];
  const tutorProfileIds = [
    ...new Set(requests.map((r) => r.tutor_profile_id)),
  ];
  const courseIds = [
    ...new Set(
      requests
        .map((r) => r.course_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (tutorProfileIds.length === 0 && courseIds.length === 0) return [];

  // tutor_profiles.id → the tutor's PROFILE id (study_groups.created_by).
  const { data: tutorRows } =
    tutorProfileIds.length > 0
      ? await supabase
          .from("tutor_profiles")
          .select("id, profile_id")
          .in("id", tutorProfileIds)
      : { data: [] };
  const creatorIds = [
    ...new Set(
      ((tutorRows ?? []) as { id: string; profile_id: string }[]).map(
        (t) => t.profile_id,
      ),
    ),
  ];

  const filters: string[] = [];
  if (creatorIds.length > 0) {
    filters.push(`created_by.in.(${creatorIds.join(",")})`);
  }
  if (courseIds.length > 0) {
    filters.push(`course_id.in.(${courseIds.join(",")})`);
  }

  const { data: groupRows } = await supabase
    .from("study_groups")
    .select(
      "id, name, created_at, courses(name), profiles!study_groups_created_by_fkey(full_name)",
    )
    .eq("is_archived", false)
    .or(filters.join(","))
    .order("created_at", { ascending: false });

  const memberGroupIds = new Set(
    ((membershipRows ?? []) as { group_id: string }[]).map((m) => m.group_id),
  );

  const rows = ((groupRows ?? []) as unknown as {
    id: string;
    name: string;
    courses: { name: string }[] | null;
    profiles: { full_name: string }[] | null;
  }[]).filter((g) => !memberGroupIds.has(g.id));
  if (rows.length === 0) return [];

  const ids = rows.map((g) => g.id);
  const { data: memberRows } = await supabase
    .from("study_group_members")
    .select("group_id")
    .in("group_id", ids);

  const countByGroup = new Map<string, number>();
  for (const row of (memberRows ?? []) as { group_id: string }[]) {
    countByGroup.set(row.group_id, (countByGroup.get(row.group_id) ?? 0) + 1);
  }

  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    courseName: courseName(g.courses),
    ownerName: g.profiles?.[0]?.full_name ?? "Your tutor",
    memberCount: countByGroup.get(g.id) ?? 0,
  }));
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
