import { readFileSync } from "node:fs";

// Live verification of 0039 (one-off payments + admin-created plans).
// Run from the project root: node scripts/verify-0039.mjs
//
// Probes the RPCs with their REAL signatures (PostgREST answers PGRST202 for a
// bad arg name too, so a guessed signature proves nothing), exercises the
// plan guard rails, then creates a REAL plan on a zero-installment fixture
// and cleans up every row it wrote.
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }),
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

let failures = 0;
const log = (ok, label, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

async function rest(path, opts = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    headers: { ...H, ...(opts.headers ?? {}) },
    method: opts.method ?? "GET",
    body: opts.body,
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function rpc(name, args) {
  return rest(`rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

/** RPC errors come back HTTP 4xx with a message; PGRST202 = signature/missing. */
const msg = (r) =>
  typeof r.body === "string" ? r.body : JSON.stringify(r.body?.message ?? r.body);
const isMissing = (r) => r.status === 404 || msg(r).includes("PGRST202");
const expectErr = (r, needle) => !isMissing(r) && msg(r).includes(needle);

const DUMMY = "00000000-0000-0000-0000-000000000000";

console.log("\n=== 0039 structures ===");
{
  const r = await rest("engagements?select=id,status,agreed_total,paid_amount&limit=5");
  const ok = r.status === 200 && Array.isArray(r.body);
  log(ok, "engagements.paid_amount exists");
  if (ok)
    log(
      r.body.every((e) => e.paid_amount != null),
      "paid_amount backfilled (no NULLs in sample)",
    );
}
{
  const r = await rest("payments?select=id&installment_id=is.null&limit=1");
  log(r.status === 200, "payments.installment_id nullable (one-off charges)");
}
{
  const r = await rest("payment_requests?select=id,status,amount&limit=3");
  log(r.status === 200, "payment_requests readable (0032 links)", r.status === 200 ? `${Array.isArray(r.body) ? r.body.length : 0} rows` : msg(r).slice(0, 160));
}

console.log("\n=== RPC existence (correct signatures; a wrong guess also 404s) ===");
{
  const r = await rpc("admin_create_installment_plan", {
    actor_id: DUMMY,
    p_engagement_id: DUMMY,
    p_amounts: [100],
    p_due_dates: ["2026-12-01T23:59:59Z"],
  });
  log(
    expectErr(r, "forbidden: admin only"),
    "admin_create_installment_plan exists (0039)",
    `HTTP ${r.status}: ${msg(r).slice(0, 80)}`,
  );
}
{
  const r = await rpc("admin_record_part_payment", {
    actor_id: DUMMY,
    p_engagement_id: DUMMY,
    p_amount: 100,
    p_note: "probe",
  });
  log(
    expectErr(r, "forbidden: admin only"),
    "admin_record_part_payment exists",
    `HTTP ${r.status}: ${msg(r).slice(0, 80)}`,
  );
}
{
  const r = await rpc("payment_apply_verified_payment", {
    p_engagement_id: DUMMY,
    p_installment_id: null,
    p_paystack_reference: "VERIFY-PROBE-NEVER-EXISTS",
    p_amount: 100,
    p_currency: "GHS",
    p_paystack_status: "success",
    p_raw: {},
  });
  log(
    !isMissing(r),
    "payment_apply_verified_payment exists",
    `HTTP ${r.status}: ${msg(r).slice(0, 80)}`,
  );
}

console.log("\n=== Guard rails (refusals must fire BEFORE any write) ===");
// Candidates: pending, entirely unpaid.
const cand = await rest(
  "engagements?select=id,agreed_total,paid_amount,status,installments(id)&status=eq.pending_payment&paid_amount=eq.0&limit=20",
);
const pending = Array.isArray(cand.body) ? cand.body : [];
const bare = pending.filter((e) => (e.installments ?? []).length === 0);
log(pending.length > 0, "pending unpaid agreements found", `${pending.length} total, ${bare.length} without a schedule`);

// A candidate that HAS already received money → payments_already_started.
const paidCand = await rest(
  "engagements?select=id,paid_amount&paid_amount=gt.0&limit=1",
);
if (Array.isArray(paidCand.body) && paidCand.body.length > 0) {
  const e = paidCand.body[0];
  const r = await rpc("admin_create_installment_plan", {
    actor_id: DUMMY,
    p_engagement_id: e.id,
    p_amounts: [e.paid_amount],
    p_due_dates: ["2026-12-01T23:59:59Z"],
  });
  log(
    expectErr(r, "forbidden: admin only"), // dummy actor fails first — expected
    "probe with dummy actor stops at the admin gate",
    msg(r).slice(0, 80),
  );
}

console.log("\n=== Money guards (refusals only — nothing may be written) ===");
{
  // Counters so a refusal that secretly wrote something is caught.
  const count = async (table) => {
    const r = await rest(`${table}?select=id&limit=1000`);
    return Array.isArray(r.body) ? r.body.length : -1;
  };
  const payBefore = await count("payments");
  const payoutBefore = await count("payouts");
  const green = "f7ab4101-f5e7-48d5-acc1-1395af86f18b";
  const admins2 = await rest("profiles?select=id&is_admin=eq.true&limit=1");
  const adminId = Array.isArray(admins2.body) ? admins2.body[0]?.id : null;

  // (a) admin records a part payment bigger than the whole agreement.
  const a = await rpc("admin_record_part_payment", {
    actor_id: adminId,
    p_engagement_id: green,
    p_amount: 999_999_999,
    p_note: "probe",
  });
  log(expectErr(a, "amount_exceeds_outstanding"), "record_part_payment refuses an overcharge", msg(a).slice(0, 110));

  // (b) one-off apply (installment_id null) for more than is outstanding.
  const b = await rpc("payment_apply_verified_payment", {
    p_engagement_id: green,
    p_installment_id: null,
    p_paystack_reference: "VERIFY-PROBE-OVERPAY",
    p_amount: 999_999_999,
    p_currency: "GHS",
    p_paystack_status: "success",
    p_raw: {},
  });
  log(expectErr(b, "amount_mismatch"), "one-off apply refuses an overpay", msg(b).slice(0, 110));

  // (c) wrong currency never converts silently.
  const c = await rpc("payment_apply_verified_payment", {
    p_engagement_id: green,
    p_installment_id: null,
    p_paystack_reference: "VERIFY-PROBE-CURRENCY",
    p_amount: 100,
    p_currency: "NGN",
    p_paystack_status: "success",
    p_raw: {},
  });
  log(expectErr(c, "currency_mismatch"), "apply refuses a currency mismatch", msg(c).slice(0, 110));

  // (d) payout requires every pesewa in — walk the pending engagements until
  //     the MONEY gate is the one that fires (a pair with an unticked session
  //     trips the earlier sessions gate instead).
  const pend = await rest("engagements?select=id&status=eq.pending_payment&paid_amount=eq.0&limit=10");
  const ids = Array.isArray(pend.body) ? pend.body.map((e) => e.id) : [];
  let moneyGate = null;
  for (const id of ids) {
    const r = await rpc("request_payout", { actor_id: adminId, p_engagement_id: id });
    if (expectErr(r, "payments_outstanding")) { moneyGate = msg(r); break; }
    if (expectErr(r, "sessions_incomplete")) continue;
    if (expectErr(r, "forbidden")) { moneyGate = `unexpected: ${msg(r)}`; break; }
  }
  log(
    moneyGate != null && moneyGate.includes("payments_outstanding"),
    "request_payout refuses until fully paid (0039 gate)",
    (moneyGate ?? "never reached the gate").slice(0, 110),
  );

  const payAfter = await count("payments");
  const payoutAfter = await count("payouts");
  log(payAfter === payBefore, "no payments rows written by any refusal", `${payBefore} -> ${payAfter}`);
  log(payoutAfter === payoutBefore, "no payouts rows written", `${payoutBefore} -> ${payoutAfter}`);

  // (e) part-payment link lifecycle: create (real row) -> verify -> remove.
  const token = (await import("node:crypto")).createHash("sha256")
    .update(`verify-0039-${Date.now()}`)
    .digest("hex");
  const link = await rpc("admin_create_payment_request", {
    actor_id: adminId,
    p_engagement_id: green,
    p_token_hash: token,
    p_amount: 5000,
    p_note: "verify script",
  });
  const linkId = typeof link.body === "string" ? link.body : null;
  log(link.status === 200 && linkId != null, "part-payment link created", `HTTP ${link.status}`);
  if (linkId) {
    const row = await rest(`payment_requests?select=id,status,amount,token_hash&id=eq.${linkId}`);
    const rr = Array.isArray(row.body) ? row.body[0] : null;
    log(
      rr && rr.status === "open" && rr.amount === 5000 && rr.token_hash === token,
      "link row: open, 5000p, SHA-256-hashed token at rest",
      rr ? `${rr.status}/${rr.amount}p` : "missing",
    );
    const del = await rest(`payment_requests?id=eq.${linkId}`, { method: "DELETE" });
    if (del.status === 204 || del.status === 200) {
      log(true, "link removed after the test");
    } else {
      // Some ledgers are append-only — fall back to cancelling it.
      const cancel = await rest(`payment_requests?id=eq.${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      log(cancel.status === 204, "link cancelled instead (append-only ledger)", `HTTP ${del.status} then ${cancel.status}`);
    }
    const gone = await rest(`payment_requests?select=id&id=eq.${linkId}`);
    log((gone.body ?? []).length === 0, "no live link left behind");
  }
}

// The plan test runs on OUR test fixture first (Logan Green — our own admin
// + student account, so any queued email targets a test inbox), falling back
// to a schedule-less candidate only if that engagement is gone or no longer
// pending+unpaid. Its original schedule is recorded and restored byte-for-byte.
const GREEN_ENG = "f7ab4101-f5e7-48d5-acc1-1395af86f18b";
const greenState = await rest(
  `engagements?select=id,agreed_total,status,paid_amount&id=eq.${GREEN_ENG}`,
);
const green = Array.isArray(greenState.body) ? greenState.body[0] : null;
const target =
  green && green.status === "pending_payment" && Number(green.paid_amount) === 0
    ? { id: green.id, agreed_total: green.agreed_total }
    : bare[0];
if (!target) {
  log(false, "a pending unpaid engagement exists to plan against");
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(1);
}
const originalRows = await rest(
  `installments?select=id,engagement_id,idx,amount,due_at,paid_amount,status&engagement_id=eq.${target.id}&order=idx`,
);
const original = Array.isArray(originalRows.body) ? originalRows.body : [];
console.log(
  `\n=== Plan creation on ${target.id} (${target.agreed_total}p, ${original.length} existing part(s)) ===`,
);

// An ADMIN actor for the real call (0008: admin is a privilege flag).
const admins = await rest("profiles?select=id,full_name&is_admin=eq.true&limit=1");
const admin = Array.isArray(admins.body) ? admins.body[0] : null;
if (!admin) {
  log(false, "an admin profile exists to act as");
} else {
  const total = Number(target.agreed_total);
  // 3 parts that sum EXACTLY (last absorbs the pesewa remainder).
  const base = Math.floor(total / 3);
  const amounts = [base, base, total - base * 2];
  const dates = ["2026-11-30T23:59:59Z", "2026-12-31T23:59:59Z", "2027-01-31T23:59:59Z"];
  console.log(`acting as ${admin.full_name} (${admin.id})`);

  // (a) wrong sum must refuse and write nothing (2 parts, 2 matching dates
  //     so the SUM guard is the one under test).
  const bad = await rpc("admin_create_installment_plan", {
    actor_id: admin.id,
    p_engagement_id: target.id,
    p_amounts: [1, total - 2],
    p_due_dates: [dates[0], dates[1]],
  });
  log(expectErr(bad, "plan_total_mismatch"), "sum mismatch refused", msg(bad).slice(0, 110));
  const afterBad = await rest(`installments?select=id&engagement_id=eq.${target.id}`);
  log(
    (afterBad.body ?? []).length === original.length,
    "refusal changed nothing",
    `${(afterBad.body ?? []).length} rows still there`,
  );

  // (b) out-of-order dates refused too (guard rail 2).
  const unsorted = await rpc("admin_create_installment_plan", {
    actor_id: admin.id,
    p_engagement_id: target.id,
    p_amounts: amounts,
    p_due_dates: [dates[1], dates[0], dates[2]],
  });
  log(expectErr(unsorted, "plan_invalid"), "unordered due dates refused", msg(unsorted).slice(0, 110));

  // (c) the real plan.
  const ok = await rpc("admin_create_installment_plan", {
    actor_id: admin.id,
    p_engagement_id: target.id,
    p_amounts: amounts,
    p_due_dates: dates,
  });
  log(ok.status === 200 && ok.body === 3, "plan created (3 parts)", `HTTP ${ok.status}: ${msg(ok).slice(0, 110)}`);

  // (d) rows: sum == agreed_total, parts start unpaid.
  const inst = await rest(`installments?select=idx,amount,due_at,paid_amount&engagement_id=eq.${target.id}&order=idx`);
  const rows = Array.isArray(inst.body) ? inst.body : [];
  const sum = rows.reduce((a, r) => a + Number(r.amount), 0);
  log(rows.length === 3 && sum === total, "3 installments summing exactly to agreed_total", `${rows.length} rows / ${sum}p`);
  log(rows.every((r) => r.paid_amount === 0), "all parts start unpaid");

  // (e) event + the two notification_outbox rows (student + admin).
  const ev = await rest(`payment_events?select=id,type&engagement_id=eq.${target.id}&type=eq.engagement.plan_created`);
  log((ev.body ?? []).length >= 1, "payment_events: engagement.plan_created");
  const out = await rest(`notification_outbox?select=id,audience,type&engagement_id=eq.${target.id}&type=eq.payment.plan_created`);
  const outRows = Array.isArray(out.body) ? out.body : [];
  log(
    outRows.length === 2 && outRows.some((r) => r.audience === "student") && outRows.some((r) => r.audience === "admin"),
    "notification_outbox: student + admin queued (payment.plan_created)",
    outRows.map((r) => r.audience).join(",") || "none",
  );

  // (f) a SECOND plan replaces the schedule (admin changing their mind before
  //     any payment) — then we restore the original state.
  const again = await rpc("admin_create_installment_plan", {
    actor_id: admin.id,
    p_engagement_id: target.id,
    p_amounts: [total],
    p_due_dates: ["2027-01-31T23:59:59Z"],
  });
  const one = await rest(`installments?select=idx,amount&engagement_id=eq.${target.id}`);
  log(
    again.status === 200 && (one.body ?? []).length === 1,
    "re-planning before payment replaces the schedule (1 part)",
    `${(one.body ?? []).length} row(s)`,
  );

  // (g) sync_installment_deadlines must NOT touch a planned engagement.
  const before = JSON.stringify(one.body);
  await rpc("sync_installment_deadlines", { actor_id: admin.id, p_engagement_id: target.id });
  const re = await rest(`installments?select=idx,amount&engagement_id=eq.${target.id}`);
  log(JSON.stringify(re.body) === before, "sync_installment_deadlines leaves the plan alone");

  console.log("\n=== Cleanup (restore the fixture exactly as it was) ===");
  const del = await rest(`installments?engagement_id=eq.${target.id}`, { method: "DELETE" });
  log(del.status === 204 || del.status === 200, "test schedule deleted");
  if (original.length > 0) {
    const back = await rest("installments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(original),
    });
    log(back.status === 201 || back.status === 204, "original schedule re-inserted", `HTTP ${back.status}`);
  }
  const d2 = await rest(`payment_events?select=id&engagement_id=eq.${target.id}&type=eq.engagement.plan_created`);
  const evRows = Array.isArray(d2.body) ? d2.body : [];
  // payment_events is APPEND-ONLY (a trigger blocks DELETE — verified): the
  // plan events stay as the audit trail, exactly as they would for a real
  // admin. They're inert: no money, no schedule, no email hangs off them.
  log(evRows.length >= 1, "plan events left as append-only audit trail", `${evRows.length} row(s) on this fixture`);
  const d3 = await rest(`notification_outbox?engagement_id=eq.${target.id}&type=eq.payment.plan_created`, { method: "DELETE" });
  log(d3.status === 204 || d3.status === 200, "plan_created outbox rows deleted (never drained, never emailed)");

  const clean = await rest(`installments?select=id,idx,amount,due_at,status&engagement_id=eq.${target.id}&order=idx`);
  const nowRows = Array.isArray(clean.body) ? clean.body : [];
  const same =
    nowRows.length === original.length &&
    nowRows.every((r, i) => {
      const o = original[i];
      return (
        r.id === o.id &&
        r.idx === o.idx &&
        Number(r.amount) === Number(o.amount) &&
        r.due_at === o.due_at &&
        r.status === o.status
      );
    });
  log(same, "engagement byte-for-byte back to its pre-test state",
    `${nowRows.length} row(s), restored=${same}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
