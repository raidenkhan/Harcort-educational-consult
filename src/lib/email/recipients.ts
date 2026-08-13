import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email recipient lookups.
 *
 * Emails live ONLY in `credentials` (the self-hosted auth table — profiles
 * has no email column). All lookups run on the service-role client.
 */

/** Map of profile_id → email for the given profile ids. */
export async function emailsForProfiles(
  profileIds: string[],
): Promise<Map<string, string>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("credentials")
    .select("profile_id, email")
    .in("profile_id", profileIds);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.profile_id as string, row.email as string);
  }
  return map;
}

/** Emails of every admin (is_admin flag OR legacy role='admin'). */
export async function adminEmails(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .or("is_admin.eq.true,role.eq.admin");
  if (!admins || admins.length === 0) return [];

  const emails = await emailsForProfiles(admins.map((a) => a.id as string));
  return [...emails.values()];
}
