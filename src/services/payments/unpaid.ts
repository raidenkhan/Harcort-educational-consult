/**
 * Who has registered but not paid (pure, unit-tested) — the admin's
 * Payments → Unpaid list and the payment-reminder action share this rule, so
 * the page and the server action can never disagree about who is eligible.
 *
 *   unpaid      a student with NO money on any agreement (any status). A
 *               student who has paid even part of one course is on the Paid
 *               list instead — they're a plan to manage, not a nudge to send.
 *   selections  what they picked but didn't pay for: live unpaid agreements
 *               plus pending tutor requests, de-duplicated by tutor + course.
 */

export interface UnpaidStudent {
  id: string;
  name: string;
  firstName: string;
  publicCode: string | null;
  email: string | null;
  phone: string | null;
  joinedAt: string;
  selections: { courseTitle: string; tutorName: string }[];
}

export function listUnpaidStudents(input: {
  students: {
    id: string;
    name: string;
    publicCode: string | null;
    email: string | null;
    phone: string | null;
    joinedAt: string;
  }[];
  engagements: {
    studentId: string;
    status: string;
    paidPesewas: bigint;
    courseTitle: string;
    tutorName: string;
  }[];
  pendingRequests: {
    studentId: string;
    courseTitle: string;
    tutorName: string;
  }[];
}): { picked: UnpaidStudent[]; notPicked: UnpaidStudent[] } {
  const paid = new Set(
    input.engagements
      .filter((e) => e.paidPesewas > BigInt(0))
      .map((e) => e.studentId),
  );

  const selections = new Map<string, Map<string, { courseTitle: string; tutorName: string }>>();
  const add = (studentId: string, courseTitle: string, tutorName: string) => {
    const key = `${tutorName.toLowerCase()}|${courseTitle.toLowerCase()}`;
    const forStudent = selections.get(studentId) ?? new Map();
    if (!forStudent.has(key)) forStudent.set(key, { courseTitle, tutorName });
    selections.set(studentId, forStudent);
  };
  for (const e of input.engagements) {
    if (e.status === "cancelled" || paid.has(e.studentId)) continue;
    add(e.studentId, e.courseTitle || "a course", e.tutorName || "a tutor");
  }
  for (const r of input.pendingRequests) {
    if (paid.has(r.studentId)) continue;
    add(r.studentId, r.courseTitle || "a course", r.tutorName || "a tutor");
  }

  const picked: UnpaidStudent[] = [];
  const notPicked: UnpaidStudent[] = [];
  for (const s of input.students) {
    if (paid.has(s.id)) continue;
    const chosen = [...(selections.get(s.id)?.values() ?? [])];
    const row: UnpaidStudent = {
      ...s,
      firstName: s.name.trim().split(/\s+/)[0] ?? "",
      selections: chosen,
    };
    (chosen.length > 0 ? picked : notPicked).push(row);
  }

  // Newest sign-ups first — the freshest leads are the likeliest to convert.
  const newestFirst = (a: UnpaidStudent, b: UnpaidStudent) =>
    b.joinedAt.localeCompare(a.joinedAt);
  return { picked: picked.sort(newestFirst), notPicked: notPicked.sort(newestFirst) };
}
