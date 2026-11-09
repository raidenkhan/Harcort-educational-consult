import { requireRole } from "@/services/auth/queries";
import { loadUnpaidStudents } from "@/services/admin/queries";
import { lastRemindersFor } from "@/services/notifications/store";
import { relativeTime, reminderCoolingDown } from "@/services/notifications/text";
import type { UnpaidStudent } from "@/services/payments/unpaid";
import { UnpaidGroup, type UnpaidRow } from "@/components/payments/UnpaidStudents";
import { accraDate } from "@/lib/time";

/** Module-level (react-hooks/purity): the clock is read once, here. */
function toRows(students: UnpaidStudent[], last: Map<string, string>): UnpaidRow[] {
  const now = Date.now();
  return students.map((s) => {
    const reminded = last.get(s.id) ?? null;
    return {
      id: s.id,
      name: s.name,
      publicCode: s.publicCode,
      email: s.email,
      phone: s.phone,
      joinedLabel: accraDate(new Date(s.joinedAt)),
      selections: s.selections,
      remindedLabel: reminded ? relativeTime(reminded, now) : null,
      coolingDown: reminderCoolingDown(reminded, now),
    };
  });
}

/**
 * Payments → Unpaid: everyone who registered as a student and has paid
 * nothing yet, split by whether they picked a course. Each can be sent an
 * in-app payment reminder (at most one per 24 hours).
 */
export default async function AdminUnpaidPage() {
  await requireRole("admin");
  const { picked, notPicked } = await loadUnpaidStudents();
  const last = await lastRemindersFor([...picked, ...notPicked].map((s) => s.id));

  return (
    <div>
      <UnpaidGroup
        title="Picked a course, not paid"
        description="They chose a tutor and course but haven't paid. The reminder names what's waiting and links straight to payment."
        rows={toRows(picked, last)}
        empty="Nobody is waiting on payment for a course they picked."
      />
      <UnpaidGroup
        title="Registered, nothing picked yet"
        description="Signed up but haven't chosen a course. The reminder nudges them to pick a course and tutor."
        rows={toRows(notPicked, last)}
        empty="Every registered student has picked a course."
      />
    </div>
  );
}
