import { describe, expect, it } from "vitest";
import {
  accraDay,
  daysUntilPromise,
  planProgress,
  planState,
  promiseState,
  summarizePlans,
} from "./plan";

/** 24 Oct 2026, 12:00 Accra (GMT). */
const NOW = Date.parse("2026-10-24T12:00:00Z");

describe("planState", () => {
  it("is unpaid until the first cedi lands", () => {
    expect(planState(BigInt(0), BigInt(120_000))).toBe("unpaid");
  });

  it("is part-paid while money is owed", () => {
    expect(planState(BigInt(60_000), BigInt(120_000))).toBe("part");
  });

  it("is paid once the balance is covered", () => {
    expect(planState(BigInt(120_000), BigInt(120_000))).toBe("paid");
    expect(planState(BigInt(150_000), BigInt(120_000))).toBe("paid");
  });

  it("treats a zero total as settled, not as an unpayable plan", () => {
    expect(planState(BigInt(0), BigInt(0))).toBe("paid");
  });
});

describe("planProgress", () => {
  it("reports a fraction between 0 and 1", () => {
    expect(planProgress(BigInt(30_000), BigInt(120_000))).toBe(0.25);
    expect(planProgress(BigInt(0), BigInt(120_000))).toBe(0);
    expect(planProgress(BigInt(120_000), BigInt(120_000))).toBe(1);
  });

  it("never exceeds 1 on an overpayment and handles a zero total", () => {
    expect(planProgress(BigInt(200_000), BigInt(120_000))).toBe(1);
    expect(planProgress(BigInt(0), BigInt(0))).toBe(1);
  });
});

describe("summarizePlans", () => {
  it("counts STUDENTS, not agreements", () => {
    const summary = summarizePlans([
      { studentId: "a", paidPesewas: BigInt(100), remainingPesewas: BigInt(0), status: "active" },
      { studentId: "a", paidPesewas: BigInt(50), remainingPesewas: BigInt(50), status: "active" },
      { studentId: "b", paidPesewas: BigInt(0), remainingPesewas: BigInt(80), status: "pending_payment" },
    ]);

    expect(summary.students).toBe(2);
    // "a" still owes on one course, so they are part-paid, not paid in full.
    expect(summary.partPaid).toBe(1);
    expect(summary.unpaid).toBe(1);
    expect(summary.paidInFull).toBe(0);
  });

  it("calls a student paid in full only when every agreement is settled", () => {
    const summary = summarizePlans([
      { studentId: "a", paidPesewas: BigInt(100), remainingPesewas: BigInt(0), status: "active" },
      { studentId: "a", paidPesewas: BigInt(50), remainingPesewas: BigInt(0), status: "completed" },
    ]);
    expect(summary.paidInFull).toBe(1);
    expect(summary.outstanding).toBe(BigInt(0));
  });

  it("ignores cancelled agreements entirely", () => {
    const summary = summarizePlans([
      { studentId: "a", paidPesewas: BigInt(0), remainingPesewas: BigInt(100), status: "cancelled" },
    ]);
    expect(summary.students).toBe(0);
    expect(summary.outstanding).toBe(BigInt(0));
  });

  it("totals collected and outstanding across students", () => {
    const summary = summarizePlans([
      { studentId: "a", paidPesewas: BigInt(40), remainingPesewas: BigInt(60), status: "active" },
      { studentId: "b", paidPesewas: BigInt(100), remainingPesewas: BigInt(0), status: "active" },
    ]);
    expect(summary.collected).toBe(BigInt(140));
    expect(summary.outstanding).toBe(BigInt(60));
  });

  it("returns zeros for no plans", () => {
    expect(summarizePlans([])).toEqual({
      students: 0,
      paidInFull: 0,
      partPaid: 0,
      unpaid: 0,
      collected: BigInt(0),
      outstanding: BigInt(0),
    });
  });
});

describe("accraDay", () => {
  it("formats as YYYY-MM-DD so dates compare correctly as strings", () => {
    expect(accraDay(NOW)).toBe("2026-10-24");
  });

  it("rolls over at Accra midnight, not the server's", () => {
    // 23:30 UTC is still the 24th in Accra (GMT).
    expect(accraDay(Date.parse("2026-10-24T23:30:00Z"))).toBe("2026-10-24");
    expect(accraDay(Date.parse("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
  });
});

describe("promiseState", () => {
  const owed = BigInt(50_000);

  it("is 'none' when no date was agreed", () => {
    expect(promiseState(null, owed, NOW)).toBe("none");
    expect(promiseState(undefined, owed, NOW)).toBe("none");
  });

  it("is 'none' once the plan is settled — the date stops mattering", () => {
    expect(promiseState("2026-01-01", BigInt(0), NOW)).toBe("none");
  });

  it("flags a passed date as overdue", () => {
    expect(promiseState("2026-10-23", owed, NOW)).toBe("overdue");
  });

  it("is 'due' on the agreed day", () => {
    expect(promiseState("2026-10-24", owed, NOW)).toBe("due");
  });

  it("is 'upcoming' for a future date", () => {
    expect(promiseState("2026-11-30", owed, NOW)).toBe("upcoming");
  });

  it("does not misread a year boundary as overdue", () => {
    // 31 Dec 2026 vs 1 Jan 2027: a DD/MM string compare would say overdue.
    const newYear = Date.parse("2027-01-01T09:00:00Z");
    expect(promiseState("2026-12-31", owed, newYear)).toBe("overdue");
    expect(promiseState("2027-01-02", owed, newYear)).toBe("upcoming");
  });

  it("ignores a time component on a timestamp", () => {
    expect(promiseState("2026-10-24T15:00:00Z", owed, NOW)).toBe("due");
  });
});

describe("daysUntilPromise", () => {
  it("counts forward and backward in whole days", () => {
    expect(daysUntilPromise("2026-10-31", NOW)).toBe(7);
    expect(daysUntilPromise("2026-10-20", NOW)).toBe(-4);
    expect(daysUntilPromise("2026-10-24", NOW)).toBe(0);
  });
});
