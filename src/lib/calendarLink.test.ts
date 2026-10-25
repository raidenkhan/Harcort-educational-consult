import { describe, expect, it } from "vitest";
import { formatCalendarDate, googleCalendarUrl } from "./calendarLink";

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
