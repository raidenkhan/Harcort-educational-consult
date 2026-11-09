"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/services/auth/queries";
import { loadUnpaidStudents } from "@/services/admin/queries";
import { notifyPaymentReminders } from "@/lib/email/notify";
import { insertNotifications, lastRemindersFor } from "./store";
import { paymentReminderCopy, reminderCoolingDown } from "./text";

const reminderSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(500),
});

export type ReminderResult = { error?: string; message?: string };

/**
 * Admin → "Send reminder" on Payments → Unpaid. Sends each chosen student an
 * in-app notification AND the same message by email, worded for their situation (picked a course → pay for
 * it; picked nothing → choose a course).
 *
 * Eligibility is re-checked HERE, not trusted from the page: a student who
 * paid since the page loaded, or who was reminded in the last 24 hours, is
 * skipped and counted, so a stale tab or a double click can't spam anyone.
 */
export async function sendPaymentReminders(studentIds: string[]): Promise<ReminderResult> {
  const admin = await requireRole("admin");
  const parsed = reminderSchema.safeParse({ studentIds });
  if (!parsed.success) return { error: "Choose at least one student to remind." };

  const { picked, notPicked } = await loadUnpaidStudents();
  const unpaid = new Map([...picked, ...notPicked].map((s) => [s.id, s]));
  const last = await lastRemindersFor(parsed.data.studentIds);
  const now = Date.now();

  const targets = parsed.data.studentIds
    .map((id) => unpaid.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .filter((s) => !reminderCoolingDown(last.get(s.id) ?? null, now));

  const skipped = parsed.data.studentIds.length - targets.length;
  if (targets.length === 0) {
    return {
      error:
        skipped === 1
          ? "That student was reminded in the last 24 hours, or has paid since this page loaded."
          : "Everyone selected was reminded in the last 24 hours, or has paid since this page loaded.",
    };
  }

  const reminders = targets.map((s) => ({
    student: s,
    copy: paymentReminderCopy(s.firstName, s.selections),
  }));
  const result = await insertNotifications(
    reminders.map(({ student, copy }) => ({
      ...copy,
      recipientId: student.id,
      kind: "payment.reminder",
      createdBy: admin.id,
    })),
  );

  if (!result.ok) {
    return {
      error:
        result.reason === "missing_table"
          ? "Notifications aren't set up yet — apply migration 0042 in Supabase, then try again."
          : "Couldn't send the reminders. Please try again.",
    };
  }

  // The same message by email, after the response (best-effort). Only sent
  // once the in-app row exists, so the 24h cool-down covers email too.
  notifyPaymentReminders(
    reminders.map(({ student, copy }) => ({
      profileId: student.id,
      title: copy.title,
      body: copy.body ?? "",
      link: copy.link,
      hasSelection: student.selections.length > 0,
    })),
  );

  revalidatePath("/admin/payments/unpaid");
  const sent = `Reminder sent to ${targets.length} student${targets.length === 1 ? "" : "s"} (in-app and by email).`;
  return {
    message: skipped > 0 ? `${sent} ${skipped} skipped (reminded recently or already paid).` : sent,
  };
}
