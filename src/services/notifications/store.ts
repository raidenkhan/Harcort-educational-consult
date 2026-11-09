import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/postgres";
import type { NotificationCopy } from "./text";

/**
 * In-app notifications (0042) — the bell next to the cart.
 *
 * Writes are BEST-EFFORT, exactly like email: a notification must never fail
 * or slow the action that caused it. `notifyInApp` runs after the response;
 * `insertNotifications` is the awaited form for callers that need to report
 * success (the admin reminder button). A database without 0042 degrades to
 * "no notifications" rather than an error.
 */

export interface NewNotification extends NotificationCopy {
  recipientId: string;
  kind: string;
  /** Dedupe claim — the same key never notifies twice (see 0042). */
  sourceKey?: string | null;
  createdBy?: string | null;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export type InsertResult = { ok: true; count: number } | { ok: false; reason: "missing_table" | "error"; message: string };

export async function insertNotifications(rows: NewNotification[]): Promise<InsertResult> {
  const valid = rows.filter((r) => r.recipientId && r.title);
  if (valid.length === 0) return { ok: true, count: 0 };

  const supabase = createAdminClient();
  const payload = valid.map((r) => ({
    recipient_id: r.recipientId,
    kind: r.kind,
    title: r.title.slice(0, 200),
    body: r.body ? r.body.slice(0, 1000) : null,
    link: r.link ? r.link.slice(0, 500) : null,
    source_key: r.sourceKey ?? null,
    created_by: r.createdBy ?? null,
  }));

  // Keyed rows go through an upsert that ignores duplicates (the unique
  // source_key is the atomic claim); un-keyed rows are plain inserts.
  const keyed = payload.filter((p) => p.source_key);
  const plain = payload.filter((p) => !p.source_key);
  const results = await Promise.all([
    keyed.length
      ? supabase
          .from("notifications")
          .upsert(keyed, { onConflict: "source_key", ignoreDuplicates: true })
      : Promise.resolve({ error: null }),
    plain.length
      ? supabase.from("notifications").insert(plain)
      : Promise.resolve({ error: null }),
  ]);

  const error = results.find((r) => r.error)?.error;
  if (error) {
    if (isMissingTable(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    console.error(`[notifications] insert failed: ${error.message}`);
    return { ok: false, reason: "error", message: error.message };
  }
  return { ok: true, count: valid.length };
}

/** Fire-and-forget form: runs after the response, never throws. */
export function notifyInApp(rows: NewNotification[]): void {
  if (rows.length === 0) return;
  const run = () => {
    void insertNotifications(rows).catch((err) => {
      console.error("[notifications] notifyInApp failed", err);
    });
  };
  try {
    after(run);
  } catch {
    // Outside a request scope `after` throws — fall back to fire-and-forget.
    run();
  }
}

/** The bell's data: newest notifications and the unread count. Null when the
 *  table doesn't exist yet (0042 not applied) so the bell can hide itself. */
export async function listNotificationsFor(
  profileId: string,
  limit = 20,
): Promise<{ items: NotificationItem[]; unread: number } | null> {
  const supabase = createAdminClient();
  const [list, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("recipient_id", profileId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", profileId)
      .is("read_at", null),
  ]);

  const error = list.error ?? unread.error;
  if (error) {
    if (!isMissingTable(error)) {
      console.error(`[notifications] list failed: ${error.message}`);
    }
    return null;
  }

  return {
    items: (list.data ?? []).map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      title: row.title as string,
      body: (row.body as string | null) ?? null,
      link: (row.link as string | null) ?? null,
      read: row.read_at !== null,
      createdAt: row.created_at as string,
    })),
    unread: unread.count ?? 0,
  };
}

/** Mark one notification (or, with no id, all of them) read — always scoped
 *  to the session profile, so nobody can mark someone else's. */
export async function markNotificationsRead(profileId: string, id?: string): Promise<void> {
  const supabase = createAdminClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profileId)
    .is("read_at", null);
  if (id) query = query.eq("id", id);
  const { error } = await query;
  if (error && !isMissingTable(error)) {
    console.error(`[notifications] mark read failed: ${error.message}`);
  }
}

/** When each student was last sent an admin payment reminder. */
export async function lastRemindersFor(studentIds: string[]): Promise<Map<string, string>> {
  const last = new Map<string, string>();
  if (studentIds.length === 0) return last;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("recipient_id, created_at")
    .eq("kind", "payment.reminder")
    .in("recipient_id", studentIds)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (!isMissingTable(error)) {
      console.error(`[notifications] reminder lookup failed: ${error.message}`);
    }
    return last;
  }
  for (const row of data ?? []) {
    const id = row.recipient_id as string;
    if (!last.has(id)) last.set(id, row.created_at as string);
  }
  return last;
}
