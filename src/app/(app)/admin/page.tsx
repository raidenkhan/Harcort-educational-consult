import {
  CalendarClock,
  CalendarX2,
  CheckCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import {
  listApprovedTutorsForAdmin,
  listPendingTutors,
} from "@/services/admin/queries";
import { listSessionsForAdmin } from "@/services/sessions/queries";
import { approveTutor, rejectTutor } from "@/services/admin/mutations";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Input } from "@/components/ui/Fields";
import { cn } from "@/lib/cn";
import { sessionWhen } from "@/lib/time";
import type { SessionView } from "@/services/sessions/queries";

export default async function AdminPage() {
  await requireRole("admin");

  const [pending, approvedCount, sessions] = await Promise.all([
    listPendingTutors(),
    listApprovedTutorsForAdmin(),
    listSessionsForAdmin(),
  ]);

  const scheduled = sessions.filter((s) => s.status === "scheduled");
  const cancelledCount = sessions.length - scheduled.length;
  const fullyConfirmed = scheduled.filter(
    (s) => s.tutor_confirmed_at && s.student_confirmed_at,
  ).length;

  const stats = [
    { label: "Pending applications", value: pending.length, icon: Users, tint: "bg-amber-50 text-amber-700" },
    { label: "Approved tutors", value: approvedCount, icon: UserCheck, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Sessions scheduled", value: scheduled.length, icon: CalendarClock, tint: "bg-petrol-50 text-petrol-700" },
    { label: "Fully confirmed", value: fullyConfirmed, icon: CheckCheck, tint: "bg-slate-100 text-slate-700" },
    { label: "Cancelled", value: cancelledCount, icon: CalendarX2, tint: "bg-red-50 text-red-700" },
  ];

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Admin console
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">
          Platform overview
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Approve tutors and verify that scheduled sessions actually happen —
          every meeting needs a tick from both the tutor and the student.
        </p>

        {/* ── Bento stat row ───────────────────────────────────────── */}
        <div className="mt-8 grid gap-4 grid-cols-2 lg:grid-cols-5">
          {stats.map((stat, i) => (
            <Card
              key={stat.label}
              className={cn(
                "flex items-center gap-4",
                // Fifth card spans the full row on 2-col breakpoints (no orphan).
                i === 4 && "col-span-2 lg:col-span-1",
              )}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${stat.tint}`}
              >
                <stat.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold text-slate-900">
                  {stat.value}
                </p>
                <p className="truncate text-xs font-medium text-slate-500">
                  {stat.label}
                </p>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Tutor applications ───────────────────────────────────── */}
        <section className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
              Tutor applications
            </h2>
            <div className="flex gap-2">
              <Badge tone="amber">{pending.length} pending</Badge>
              <Badge tone="green">{approvedCount} approved</Badge>
            </div>
          </div>

          {pending.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
              <p className="text-sm text-slate-500">
                No pending applications. New tutor sign-ups will appear here
                for review.
              </p>
            </div>
          ) : (
            <ul className="mt-6 space-y-4">
              {pending.map((tutor) => (
                <li key={tutor.id}>
                  <Card className="flex flex-wrap items-start justify-between gap-6">
                    <div className="min-w-0 max-w-xl flex-1">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {tutor.full_name || "Unnamed tutor"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Applied {new Date(tutor.created_at).toLocaleDateString()} ·{" "}
                        {tutor.rate_per_hour != null
                          ? `GH₵${tutor.rate_per_hour.toLocaleString()}/hr`
                          : "No rate set"}
                      </p>
                      {tutor.bio && (
                        <p className="mt-3 text-sm leading-relaxed text-slate-600">
                          {tutor.bio}
                        </p>
                      )}
                    </div>

                    <div className="w-full max-w-xs space-y-3 sm:w-72">
                      <form action={approveTutor} className="space-y-2">
                        <input
                          type="hidden"
                          name="tutorProfileId"
                          value={tutor.id}
                        />
                        <Input
                          name="note"
                          type="text"
                          placeholder="Note (optional, shown to tutor)"
                        />
                        <button
                          type="submit"
                          className="h-10 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700"
                        >
                          Approve tutor
                        </button>
                      </form>
                      <form action={rejectTutor} className="space-y-2">
                        <input
                          type="hidden"
                          name="tutorProfileId"
                          value={tutor.id}
                        />
                        <Input
                          name="note"
                          type="text"
                          required
                          placeholder="Reason for rejection (required)"
                          className="focus:border-red-400 focus:ring-red-100"
                        />
                        <button
                          type="submit"
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        >
                          Reject tutor
                        </button>
                      </form>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Attendance tracker ───────────────────────────────────── */}
        <section className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
                Attendance tracker
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Every session needs a tick from both sides. Anything confirmed
                by the tutor but not the student is worth a follow-up.
              </p>
            </div>
            <div className="flex gap-2">
              <Badge tone="petrol">{scheduled.length} active</Badge>
              {cancelledCount > 0 && (
                <Badge tone="red">{cancelledCount} cancelled</Badge>
              )}
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
              <p className="text-sm text-slate-500">
                No sessions scheduled yet. Sessions appear here once tutors
                start using their timetables.
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
                    <th className="px-5 py-3.5 text-center font-semibold">
                      Tutor tick
                    </th>
                    <th className="px-5 py-3.5 text-center font-semibold">
                      Student tick
                    </th>
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
      </Container>
    </div>
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
