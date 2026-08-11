/**
 * Session time helpers.
 *
 * All meeting times are formatted in Accra time (Africa/Accra — GMT, no
 * daylight saving), so the strings are IDENTICAL whether rendered on the
 * server or the client. That avoids both the server-timezone bug (a server
 * in another region showing wrong meeting times to Ghanaian students) and
 * React hydration mismatches.
 */

const TIMEZONE = "Africa/Accra";

function formatInTz(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    ...options,
  }).format(date);
}

/** "Mon 14 Aug" style day label plus a "14" / "Aug" split for the tile. */
export function sessionDateTile(date: Date): { month: string; day: string } {
  return {
    month: formatInTz(date, { month: "short" }),
    day: formatInTz(date, { day: "numeric" }),
  };
}

/** "Mon 14 Aug · 14:00–15:00" — the full when-line for a session card. */
export function sessionWhen(date: Date, durationMinutes: number): string {
  const end = new Date(date.getTime() + durationMinutes * 60_000);
  const day = formatInTz(date, { weekday: "short", month: "short", day: "numeric" });
  const startTime = formatInTz(date, { hour: "numeric", minute: "2-digit" });
  const endTime = formatInTz(end, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${startTime}–${endTime}`;
}

/** "14:05" — Accra time inside a message bubble. */
export function chatTime(date: Date): string {
  return formatInTz(date, { hour: "numeric", minute: "2-digit" });
}

/** "Mon 14 Aug · 14:05" — timestamp for the conversation list. */
export function chatTimestamp(date: Date): string {
  const day = formatInTz(date, { weekday: "short", day: "numeric", month: "short" });
  const time = formatInTz(date, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/** "2026-08-11" (Accra) — used to group chat messages into days. */
export function chatDayKey(ts: number): string {
  return formatInTz(new Date(ts), { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** "Today" / "Yesterday" / "14 Aug" — WhatsApp-style day separator for chat threads. */
export function chatDay(ts: number, now: number): string {
  const today = chatDayKey(now);
  if (chatDayKey(ts) === today) return "Today";
  if (chatDayKey(ts) === chatDayKey(now - 86_400_000)) return "Yesterday";
  return formatInTz(new Date(ts), { day: "numeric", month: "short" });
}
