import { Clock, GraduationCap, Inbox } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import { listTutorInbox } from "@/services/requests/queries";
import { dueDateLabel } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RespondRequestButtons } from "./RespondRequestButtons";

/**
 * Tutor requests inbox — "Tutoring requests" on the tutor page.
 *
 * Pending requests land here with the student's note and course; Accept
 * unlocks the student's Pay 50% path, Decline closes it. Pending first.
 */

const STATUS_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" }
> = {
  pending: { label: "New request", tone: "amber" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export async function TutorRequestsInbox() {
  const profile = await requireRole("tutor");
  const inbox = await listTutorInbox(profile);
  const pending = inbox.filter((r) => r.status === "pending");
  const answered = inbox.filter((r) => r.status !== "pending");

  return (
    <section aria-label="Tutoring requests" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Requests
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
            Tutoring requests
            {pending.length > 0 ? ` (${pending.length})` : ""}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Students who asked for your help. Accepting unlocks their payment
            button; you schedule sessions once the first 50% lands.
          </p>
        </div>
      </div>

      {inbox.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          <Inbox className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3">
            No requests yet. Students find you in the directory and tap
            “Request” on a course — requests appear here.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <ul className="space-y-4">
          {pending.map((request) => (
            <li key={request.id}>
              <Card className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0 max-w-xl flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {request.studentName || "Student"}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Code {request.studentPublicCode ?? "—"}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                    <GraduationCap className="h-4 w-4 text-slate-400" />
                    {request.courseName ?? "Course to decide together"}
                  </p>
                  {request.message && (
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                      “{request.message}”
                    </p>
                  )}
                  <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3 w-3" />
                    Sent {dueDateLabel(new Date(request.createdAt)).replace("Due ", "")}
                  </p>
                </div>
                <RespondRequestButtons requestId={request.id} />
              </Card>
            </li>
          ))}
        </ul>
      )}

      {answered.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-slate-900">Answered</h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {answered.map((request) => {
              const badge = STATUS_BADGE[request.status] ?? {
                label: request.status,
                tone: "neutral" as const,
              };
              return (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span className="text-slate-700">
                    {request.studentName || "Student"} ·{" "}
                    {request.courseName ?? "Course"} ·{" "}
                    {dueDateLabel(new Date(request.createdAt)).replace("Due ", "")}
                  </span>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
