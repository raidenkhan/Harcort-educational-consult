"use client";

import { useState, useTransition } from "react";
import { BellRing, Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { sendPaymentReminders, type ReminderResult } from "@/services/notifications/reminders";
import { cn } from "@/lib/cn";

export type UnpaidRow = {
  id: string;
  name: string;
  publicCode: string | null;
  email: string | null;
  phone: string | null;
  joinedLabel: string;
  selections: { courseTitle: string; tutorName: string }[];
  /** "Reminded 3h ago" — null when never reminded. */
  remindedLabel: string | null;
  /** Reminded in the last 24 hours: the button is disabled. */
  coolingDown: boolean;
};

/**
 * One group on Payments → Unpaid ("picked a course" or "picked nothing"),
 * with a per-student Send reminder button and a Remind-all for the group.
 * The server action re-checks eligibility, so the buttons are a convenience,
 * not the guard.
 */
export function UnpaidGroup({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: UnpaidRow[];
  empty: string;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<ReminderResult | null>(null);
  // Students reminded from this page since it loaded — their buttons flip to
  // "Reminded" immediately, before the revalidated page arrives.
  const [justSent, setJustSent] = useState<Set<string>>(new Set());

  const eligible = rows.filter((r) => !r.coolingDown && !justSent.has(r.id));

  function send(ids: string[], busy: string) {
    setBusyId(busy);
    setResult(null);
    startTransition(async () => {
      const res = await sendPaymentReminders(ids);
      setResult(res);
      if (!res.error) setJustSent((prev) => new Set([...prev, ...ids]));
      setBusyId(null);
    });
  }

  return (
    <section className="mt-10 first:mt-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
            {title}{" "}
            <span className="text-base font-semibold text-slate-400">({rows.length})</span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            disabled={pending || eligible.length === 0}
            onClick={() => send(eligible.map((r) => r.id), "all")}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-petrol-900 px-3.5 text-sm font-semibold text-white shadow-xs transition hover:bg-petrol-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BellRing className="h-4 w-4" aria-hidden="true" />
            {busyId === "all"
              ? "Sending…"
              : eligible.length === 0
                ? "Everyone reminded"
                : `Remind all (${eligible.length})`}
          </button>
        )}
      </div>

      {result && (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-md px-3 py-2 text-sm",
            result.error
              ? "border border-red-200 bg-red-50 text-red-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {result.error ?? result.message}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          {empty}
        </div>
      ) : (
        <Card padded={false} className="mt-4 divide-y divide-slate-100 overflow-hidden">
          {rows.map((row) => {
            const sent = justSent.has(row.id);
            const disabled = pending || row.coolingDown || sent;
            return (
              <div key={row.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.name}
                    {row.publicCode && (
                      <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                        {row.publicCode}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {[row.email, row.phone].filter(Boolean).join(" · ") || "No contact details"} ·
                    joined {row.joinedLabel}
                  </p>
                  {row.selections.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {row.selections.map((s) => (
                        <li key={`${s.tutorName}|${s.courseTitle}`}>
                          <Badge tone="neutral">
                            {s.courseTitle} · {s.tutorName}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => send([row.id], row.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sent ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Reminded
                      </>
                    ) : busyId === row.id ? (
                      "Sending…"
                    ) : (
                      <>
                        <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> Send reminder
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-slate-400">
                    {sent
                      ? "Just now"
                      : row.remindedLabel
                        ? `Reminded ${row.remindedLabel}`
                        : "Never reminded"}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
