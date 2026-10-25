import { describe, expect, it } from "vitest";
import { formatCalendarDate, googleCalendarUrl, sessionIcs } from "./calendarLink";

describe("formatCalendarDate", () => {
  it("formats a Date as the UTC YYYYMMDDTHHMMSSZ form", () => {
    expect(formatCalendarDate(new Date("2026-08-14T14:00:00Z"))).toBe(
      "20260814T140000Z",
    );
    expect(formatCalendarDate(new Date("2026-12-31T23:59:59.000Z"))).toBe(
      "20261231T235959Z",
    );
  });
});

describe("googleCalendarUrl", () => {
  const start = new Date("2026-08-14T14:00:00Z");
  const end = new Date("2026-08-14T15:00:00Z");

  it("builds a TEMPLATE url with title, dates, location and details", () => {
    const url = googleCalendarUrl({
      title: "Tutoring with Ama — Mechanics",
      start,
      end,
      location: "KNUST Library",
      details: "Scheduled on Harcourt.",
    });

    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260814T140000Z%2F20260814T150000Z");
    expect(url).toContain("location=KNUST+Library");
    expect(url).toContain("details=Scheduled+on+Harcourt.");
  });

  it("omits location and details when they are absent", () => {
    const url = googleCalendarUrl({ title: "Tutoring", start, end });
    expect(url).not.toContain("location=");
    expect(url).not.toContain("details=");
  });
});

describe("sessionIcs", () => {
  it("produces a valid VEVENT with CRLF lines and UTC times", () => {
    const ics = sessionIcs({
      title: "Tutoring with Ama — Mechanics",
      start: new Date("2026-08-14T14:00:00Z"),
      end: new Date("2026-08-14T15:00:00Z"),
      location: "KNUST Library",
      description: "Scheduled on Harcourt.",
      uid: "abc-123@harcourtinstitute.com",
      now: new Date("2026-08-13T10:00:00Z"),
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:abc-123@harcourtinstitute.com");
    expect(ics).toContain("DTSTAMP:20260813T100000Z");
    expect(ics).toContain("DTSTART:20260814T140000Z");
    expect(ics).toContain("DTEND:20260814T150000Z");
    expect(ics).toContain("SUMMARY:Tutoring with Ama — Mechanics");
    expect(ics).toContain("LOCATION:KNUST Library");
    expect(ics).toContain("DESCRIPTION:Scheduled on Harcourt.");
    // CRLF-terminated lines, per RFC 5545.
    expect(ics).toContain("\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("escapes commas and semicolons in free text", () => {
    const ics = sessionIcs({
      title: "Lab; Group A, B",
      start: new Date("2026-08-14T14:00:00Z"),
      end: new Date("2026-08-14T15:00:00Z"),
      uid: "x@harcourtinstitute.com",
      now: new Date("2026-08-13T10:00:00Z"),
    });
    expect(ics).toContain("SUMMARY:Lab\\; Group A\\, B");
  });
});
