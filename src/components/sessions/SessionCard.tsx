"use client";

import { useActionState } from "react";
import { Check, Clock, MapPin, X } from "lucide-react";
import {
  cancelSession,
  confirmSessionAttendance,
  type SessionFormState,
} from "@/services/sessions/mutations";
import type { SessionView } from "@/services/sessions/queries";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { sessionDateTile, sessionWhen } from "@/lib/time";

/** Matches the server: a session can be ticked 15 min before start. */
const GRACE_MS = 15 * 60 * 1000;

export function SessionCard({
  session,
  role,
  now,
}: {
  session: SessionView;
  role: "tutor" | "student";
  /** Wall-clock snapshot passed from the server page (keeps render pure). */
  now: number;
}) {
  const [confirmState, confirmAction, confirmPending] =
    useActionState<SessionFormState, FormData>(confirmSessionAttendance, {});
  const [cancelState, cancelAction, cancelPending] =
    useActionState<SessionFormState, FormData>(cancelSession, {});

  const start = new Date(session.scheduled_at);
  const end = new Date(start.getTime() + session.duration_minutes * 60_000);
  const isDue = start.getTime() <= now + GRACE_MS;
  const isUpcoming = start.getTime() > now + GRACE_MS;
  const ended = end.getTime() < now;

  const myConfirmed =
    role === "tutor" ? session.tutor_confirmed_at : session.student_confirmed_at;
  const theirConfirmed =
    role === "tutor" ? session.student_confirmed_at : session.tutor_confirmed_at;
  const otherName = role === "tutor" ? session.student_name : session.tutor_name;

  const { month, day } = sessionDateTile(start);

  return (
    <Card className="sm:flex sm:items-start sm:gap-5">
      {/* Date tile + details share one line; on mobile the details get the
          full remaining width instead of being squeezed next to the actions. */}
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
        {/* Date tile (Accra time, deterministic server/client) */}
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 sm:h-16 sm:w-16">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {month}
          </span>
          <span className="font-display text-xl font-bold leading-tight text-slate-900">
            {day}
          </span>
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">
            {session.topic || "Tutoring session"}
          </h3>
          <Badge tone={ended ? "neutral" : isUpcoming ? "petrol" : "amber"}>
            {ended ? "Ended" : isUpcoming ? "Upcoming" : "In progress"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          with <span className="font-medium text-slate-900">{otherName}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {sessionWhen(start, session.duration_minutes)}
          </span>
          {session.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {session.location}
            </span>
          )}
          <span>{session.duration_minutes} min</span>
        </div>

        {/* Both sides' ticks */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {myConfirmed ? (
            <Badge tone="green">
              <Check className="h-3 w-3" /> You attended
            </Badge>
          ) : (
            <Badge tone="neutral">Your tick: pending</Badge>
          )}
          {theirConfirmed ? (
            <Badge tone="petrol">
              <Check className="h-3 w-3" />
              {role === "tutor" ? "Student" : "Tutor"} attended
            </Badge>
          ) : (
            <Badge tone="neutral">
              {role === "tutor" ? "Student" : "Tutor"} tick: pending
            </Badge>
          )}
        </div>

        {/* Feedback from the last action */}
        {(confirmState?.message || confirmState?.error || cancelState?.message || cancelState?.error) && (
          <p
            className={
              confirmState?.error || cancelState?.error
                ? "mt-2 text-xs font-medium text-red-600"
                : "mt-2 text-xs font-medium text-emerald-600"
            }
          >
            {confirmState?.error || cancelState?.error || confirmState?.message || cancelState?.message}
          </p>
        )}
        </div>
      </div>

      {/* Actions — full-width stacked buttons on mobile (easy thumb targets),
          compact 160px column beside the details on sm+. */}
      <div className="mt-4 flex shrink-0 flex-col gap-2 sm:mt-0 sm:w-40">
        {isDue && !myConfirmed ? (
          <form action={confirmAction}>
            <input type="hidden" name="sessionId" value={session.id} />
            <Button
              type="submit"
              size="sm"
              disabled={confirmPending}
              className="w-full"
            >
              <Check className="h-3.5 w-3.5" />
              {confirmPending ? "Confirming…" : "Mark as attended"}
            </Button>
          </form>
        ) : (
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Ticked on your side
          </p>
        )}

        {session.status !== "cancelled" && isUpcoming && !myConfirmed && (
          <form action={cancelAction}>
            <input type="hidden" name="sessionId" value={session.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={cancelPending}
              className="w-full text-red-600 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5" />
              {cancelPending
                ? "Cancelling…"
                : role === "tutor"
                  ? "Cancel session"
                  : "Decline session"}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
