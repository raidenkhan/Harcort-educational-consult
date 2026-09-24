import { CheckCheck } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import { listSessionsForAdmin, type SessionView } from "@/services/sessions/queries";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { sessionWhen } from "@/lib/time";

/** Attendance tab — the dual-tick tracker: did every scheduled session happen? */
export default async function AdminAttendancePage() {
  await requireRole("admin");

  const sessions = await listSessionsForAdmin();

  const scheduled = sessions.filter((s) => s.status === "scheduled");
  const cancelledCount = sessions.length - scheduled.length;
  const fullyConfirmed = scheduled.filter(
    (s) => s.tutor_confirmed_at && s.student_confirmed_at,
  ).length;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
            Attendance tracker
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Every session needs a tick from both sides. Anything confirmed by
            the tutor but not the student is worth a follow-up.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone="petrol">{scheduled.length} active</Badge>
          <Badge tone="green">{fullyConfirmed} confirmed</Badge>
          {cancelledCount > 0 && (
            <Badge tone="red">{cancelledCount} cancelled</Badge>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
          <p className="text-sm text-slate-500">
            No sessions scheduled yet. Sessions appear here once tutors start
            using their timetables.
          </p>
        </div>
      ) : (
        <Card padded={false} className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3.5 font-semibold">When</th>
                <th className="px-5 py-3.5 font-semibold">Student</th>
                <th className="px-5 py-3.5 font-semibold">Tutor</th>
                <th className="px-5 py-3.5 font-semibold">Topic</th>
                <th className="px-5 py-3.5 text-center font-semibold">Tutor tick</th>
                <th className="px-5 py-3.5 text-center font-semibold">Student tick</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((session) => {
                const status = sessionStatus(session);
                return (
                  <tr key={session.id} className="transition hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-3.5 text-slate-700">
                      {sessionWhen(
                        new Date(session.scheduled_at),
                        session.duration_minutes,
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {session.student_name}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">
                      {session.tutor_name}
                    </td>
                    <td className="max-w-[180px] truncate px-5 py-3.5 text-slate-600">
                      {session.topic || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <TickCell confirmed={Boolean(session.tutor_confirmed_at)} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <TickCell confirmed={Boolean(session.student_confirmed_at)} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {session.status === "cancelled" && (
                        <p className="mt-1 text-xs text-slate-400">
                          by {session.cancelled_by_name || "unknown"}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

function TickCell({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
      <CheckCheck className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      —
    </span>
  );
}

function sessionStatus(session: SessionView): {
  label: string;
  tone: "green" | "amber" | "petrol" | "red" | "neutral";
} {
  if (session.status === "cancelled") {
    return { label: "Cancelled", tone: "red" };
  }

  const both =
    session.tutor_confirmed_at && session.student_confirmed_at;
  if (both) return { label: "Confirmed", tone: "green" };
  if (session.tutor_confirmed_at) return { label: "Tutor only", tone: "amber" };
  if (session.student_confirmed_at) return { label: "Student only", tone: "petrol" };

  const ended =
    new Date(session.scheduled_at).getTime() + session.duration_minutes * 60_000 <
    Date.now();
  return ended ? { label: "Missed", tone: "red" } : { label: "Scheduled", tone: "neutral" };
}
