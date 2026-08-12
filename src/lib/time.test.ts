import { describe, expect, it } from "vitest";
import {
  chatDay,
  chatDayKey,
  chatTime,
  chatTimestamp,
  sessionDateTile,
  sessionWhen,
} from "./time";

/**
 * Time helpers render in Africa/Accra (GMT, no DST), so UTC instants map
 * 1:1 — the tests can assert exact strings from fixed instants.
 */
describe("time helpers (Africa/Accra)", () => {
  it("sessionDateTile splits month and day", () => {
    const { month, day } = sessionDateTile(new Date("2026-08-14T12:00:00Z"));
    expect(month).toBe("Aug");
    expect(day).toBe("14");
  });

  it("sessionWhen renders the full when-line with end time", () => {
    const when = sessionWhen(new Date("2026-08-14T14:00:00Z"), 60);
    expect(when).toBe("Fri 14 Aug · 14:00–15:00");
  });

  it("chatTime renders HH:MM", () => {
    // hour is formatted with hour:'numeric', so 09:05 renders as "9:05".
    expect(chatTime(new Date("2026-08-14T09:05:00Z"))).toBe("9:05");
    expect(chatTime(new Date("2026-08-14T14:05:00Z"))).toBe("14:05");
  });

  it("chatTimestamp renders day + time", () => {
    expect(chatTimestamp(new Date("2026-08-14T09:05:00Z"))).toBe("Fri 14 Aug · 9:05");
  });

  it("chatDayKey is a stable Accra date key", () => {
    expect(chatDayKey(Date.UTC(2026, 7, 14, 23, 30))).toBe("14/08/2026");
  });

  it("chatDay labels Today, Yesterday, then the date", () => {
    const now = Date.UTC(2026, 7, 14, 12, 0); // Fri 14 Aug, noon Accra

    expect(chatDay(Date.UTC(2026, 7, 14, 8, 0), now)).toBe("Today");
    expect(chatDay(Date.UTC(2026, 7, 13, 8, 0), now)).toBe("Yesterday");
    expect(chatDay(Date.UTC(2026, 7, 12, 8, 0), now)).toBe("12 Aug");
  });

  it("chatDay is timezone-correct near midnight (UTC evening = Accra same day)", () => {
    const now = Date.UTC(2026, 7, 14, 23, 0); // 23:00 UTC = 23:00 Accra
    expect(chatDay(Date.UTC(2026, 7, 14, 22, 0), now)).toBe("Today");
  });
});
