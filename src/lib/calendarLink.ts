/**
 * Calendar integration — the "Add to Google Calendar" link in session emails.
 *
 * When a session is scheduled, the email should let the student drop the
 * meeting straight into their calendar. Google Calendar accepts a templated
 * URL (`/calendar/render?action=TEMPLATE&text=…&dates=…`) with the event's
 * title, UTC start/end, location and details — no OAuth or API key involved;
 * clicking just opens the user's calendar with the event pre-filled.
 *
 * Kept pure (no env, no DB) so the URL builder is unit-testable.
 *
 * NOTE: named `calendarLink`, not `calendar` — `lib/calendar.ts` is the
 * timetable's date-math helper (accraDayKey, monthMatrix, …), a different
 * concern.
 */

/** "20261026T160000Z" — the all-numeric UTC form Google Calendar's `dates`
 *  parameter expects. Accra is GMT (no DST), so UTC equals the time already
 *  shown to the student; Google converts it to their own timezone on open. */
export function formatCalendarDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** A Google Calendar "create event" link for a timed meeting. */
export function googleCalendarUrl(input: {
  title: string;
  start: Date;
  end: Date;
  location?: string;
  details?: string;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${formatCalendarDate(input.start)}/${formatCalendarDate(input.end)}`,
  });
  if (input.location) params.set("location", input.location);
  if (input.details) params.set("details", input.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape a free-text value for a single iCalendar property line (RFC 5545). */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * A minimal, valid `.ics` (iCalendar) file for a timed meeting. Attaching this
 * to the session email lets ANY calendar client import it — Apple Calendar and
 * Outlook (which the Google-Calandar-only link misses), and Google too. Lines
 * are CRLF-terminated per the spec, and free-text fields are escaped.
 */
export function sessionIcs(input: {
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  /** Globally-unique event id, e.g. `<uuid>@harcourtinstitute.com`. */
  uid: string;
  /** Creation stamp — pass `new Date()` in; kept a param so this stays pure. */
  now: Date;
}): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Harcourt Educational Consult//Tutoring//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(input.uid)}`,
    `DTSTAMP:${formatCalendarDate(input.now)}`,
    `DTSTART:${formatCalendarDate(input.start)}`,
    `DTEND:${formatCalendarDate(input.end)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${icsEscape(input.description)}`] : []),
    ...(input.location ? [`LOCATION:${icsEscape(input.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
