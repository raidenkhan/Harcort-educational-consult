import { readFileSync } from "node:fs";

// Times the Supabase REST calls /chat makes, so the page's latency can be
// argued with numbers instead of guesses. Run from the project root:
//   node scripts/bench-chat.mjs
// It reports the OLD serial chain (what the page used to do) and the NEW
// single-round shape side by side.
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
const DEAD_HASH = "0".repeat(64); // never matches — measures query latency only

async function timeIt(label, path) {
  const t = performance.now();
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: H });
  const text = await res.text();
  const ms = performance.now() - t;
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not json */
  }
  const rows = Array.isArray(body)
    ? body.length
    : body && typeof body === "object"
      ? 1
      : 0;
  if (!res.ok) {
    console.log(
      `${ms.toFixed(0).padStart(6)}ms   ${label}   HTTP ${res.status}: ${text.slice(0, 160)}`,
    );
  } else {
    console.log(`${ms.toFixed(0).padStart(6)}ms   ${label}   (${rows} rows)`);
  }
  return { ms, body: res.ok ? body : null };
}

console.log(
  `\n=== /chat data cost — Supabase REST measured from this machine ===\n`,
);
await fetch(`${BASE}/rest/v1/`, { headers: H }).catch(() => {}); // warm TLS

// Discover a real conversation (and therefore a real participant).
const found = await fetch(
  `${BASE}/rest/v1/conversations?select=id,student_id,tutor_profile_id,admin_id&order=created_at.desc&limit=3`,
  { headers: H },
).then((r) => r.json());

if (!Array.isArray(found) || found.length === 0) {
  console.log(
    "No conversations in the database — cannot measure the thread path.",
  );
  process.exit(0);
}
const conv = found[0];
const ME = conv.student_id ?? conv.admin_id ?? conv.tutor_profile_id;
const ACTIVE = conv.id;
console.log(`me = ${ME}\nactive conversation = ${ACTIVE}\n`);

const sessionPath = `sessions?select=profiles(*)&token_hash=eq.${DEAD_HASH}&revoked_at=is.null&expires_at=gt.${new Date().toISOString()}&limit=1`;
const tutorPath = `tutor_profiles?select=id&profile_id=eq.${ME}`;
const listPath = `conversations?select=*,student:profiles!student_id(full_name),tutor_profile:tutor_profiles(id,profiles(full_name)),admin:profiles!admin_id(full_name)&or=(student_id.eq.${ME},admin_id.eq.${ME})&order=created_at.desc&limit=50`;

// --- OLD shape: three serial rounds, session read twice, row read twice ---
console.log("-- OLD round 1 (session ‖ tutor_profiles ‖ conversations) --");
const [session, tutorP, list] = await Promise.all([
  timeIt("session lookup (ran TWICE in code: layout + page)", sessionPath),
  timeIt("tutor_profiles?select=id (membership filter)", tutorPath),
  timeIt("conversations?select=… 3 joins, .or(), limit 50", listPath),
]);

const convIds = (list.body ?? []).map((c) => c.id);
console.log(
  `         (this user has ${convIds.length} conversation${convIds.length === 1 ? "" : "s"})`,
);

if (convIds.length > 0) {
  console.log("\n-- OLD round 2 (waits for round 1) --");
  const [preview, row1] = await Promise.all([
    timeIt(
      "messages preview (.in ids, desc, limit 300)",
      `messages?select=conversation_id,body,sender_id,created_at&conversation_id=in.(${convIds.join(",")})&order=created_at.desc&limit=300`,
    ),
    timeIt(
      "conversations row #1 (thread membership check)",
      `conversations?select=student_id,tutor_profile_id,admin_id&id=eq.${ACTIVE}&limit=1`,
    ),
  ]);

  console.log("\n-- OLD round 3 (waits for round 2) --");
  const [threadMsgs, row2] = await Promise.all([
    timeIt(
      "messages?select=* (the thread)",
      `messages?select=*&conversation_id=eq.${ACTIVE}&order=created_at.asc`,
    ),
    timeIt(
      "conversations row #2 + joins (meta — SAME row again)",
      `conversations?select=student_id,tutor_profile_id,admin_id,status,student:profiles!student_id(full_name),tutor_profile:tutor_profiles(id,profiles(full_name)),admin:profiles!admin_id(full_name)&id=eq.${ACTIVE}&limit=1`,
    ),
  ]);

  // --- NEW shape: one round; ?c= names the thread so it starts with the list ---
  console.log("\n-- NEW round 1 (what the page does now, with ?c=) --");
  const [s2, t2, l2, thread2, meta2] = await Promise.all([
    timeIt("session lookup (×1 — profile passed to the queries)", sessionPath),
    timeIt("tutor_profiles?select=id", tutorPath),
    timeIt("conversations?select=… (list)", listPath),
    timeIt(
      "messages (thread)",
      `messages?select=*&conversation_id=eq.${ACTIVE}&order=created_at.asc`,
    ),
    timeIt(
      "conversations row + joins (meta, merged with membership)",
      `conversations?select=student_id,tutor_profile_id,admin_id,status,student:profiles!student_id(full_name),tutor_profile:tutor_profiles(id,profiles(full_name)),admin:profiles!admin_id(full_name)&id=eq.${ACTIVE}&limit=1`,
    ),
  ]);

  const oldTotal =
    session.ms +
    preview.ms +
    row1.ms +
    threadMsgs.ms +
    row2.ms +
    Math.max(tutorP.ms + list.ms, 0);
  const newTotal = s2.ms + Math.max(t2.ms + l2.ms, thread2.ms, meta2.ms);

  console.log("\n=== Totals (data fetching only — before a byte is rendered) ===");
  console.log(
    `OLD  serial: session×2 + (tutor‖list) + (preview‖row) + (msgs‖meta) : ${oldTotal.toFixed(0)}ms`,
  );
  console.log(
    `NEW  one round: session ‖ (tutor ‖ list ‖ thread ‖ meta)            : ${newTotal.toFixed(0)}ms`,
  );
  console.log(
    `saving ≈ ${(oldTotal - newTotal).toFixed(0)}ms per navigation to /chat`,
  );
}
console.log("");
