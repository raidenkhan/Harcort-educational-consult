"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import {
  createTutorAccount,
  deleteTutorAccount,
  hideTutor,
  restoreTutor,
  type ManageState,
} from "@/services/admin/manage";
import type { AdminTutorRow } from "@/services/admin/queries";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Fields";
import { ActionStatus, ConfirmAction } from "./ConfirmAction";

const STATUS: Record<NonNullable<AdminTutorRow["status"]>, { label: string; tone: "green" | "amber" | "red" }> = {
  approved: { label: "In directory", tone: "green" },
  pending: { label: "Awaiting review", tone: "amber" },
  rejected: { label: "Hidden", tone: "red" },
};

/** Admin → People → Add tutor: creates an approved tutor account. */
function AddTutorForm() {
  const [state, formAction, pending] = useActionState<ManageState, FormData>(createTutorAccount, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <UserPlus className="h-4 w-4 text-brand-600" aria-hidden="true" /> Add a tutor
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Creates their account, already approved. Share the email and password
        with them — they sign in and add their bio and courses from Settings.
      </p>
      <form ref={formRef} action={formAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Full name</span>
          <Input name="fullName" required autoComplete="off" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Email</span>
          <Input name="email" type="email" required autoComplete="off" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Starting password</span>
          <Input name="password" type="text" minLength={8} required autoComplete="new-password" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Phone <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <Input name="phone" type="tel" placeholder="0241234567" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add tutor"}
          </Button>
        </div>
      </form>
      <div className="mt-3">
        <ActionStatus result={state} />
      </div>
    </Card>
  );
}

/**
 * Admin → People → Tutors: add a tutor, and delete or hide existing ones.
 * Delete is offered only to tutors with no bookings (it would erase
 * students' payment records otherwise — the server re-checks); a tutor with
 * bookings can be removed from the directory and restored later.
 */
export function TutorManager({ tutors }: { tutors: (AdminTutorRow & { joinedLabel: string })[] }) {
  const [result, setResult] = useState<ManageState | null>(null);

  return (
    <div className="space-y-4">
      <AddTutorForm />

      <ActionStatus result={result} />

      {tutors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          No tutor accounts yet.
        </div>
      ) : (
        <Card padded={false} className="divide-y divide-slate-100 overflow-hidden">
          {tutors.map((t) => {
            const status = t.status ? STATUS[t.status] : null;
            return (
              <div key={t.profileId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                    {t.name}
                    {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="neutral">No profile yet</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {t.email ?? "No email"} · {t.services} course{t.services === 1 ? "" : "s"} ·{" "}
                    {t.bookings} booking{t.bookings === 1 ? "" : "s"} · joined {t.joinedLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.status === "approved" && (
                    <ConfirmAction
                      label="Remove from directory"
                      confirmLabel="Remove"
                      tone="neutral"
                      run={() => hideTutor(t.profileId)}
                      onResult={setResult}
                    />
                  )}
                  {t.status === "rejected" && (
                    <ConfirmAction
                      label="Restore"
                      confirmLabel="Restore to directory"
                      tone="neutral"
                      run={() => restoreTutor(t.profileId)}
                      onResult={setResult}
                    />
                  )}
                  <ConfirmAction
                    label="Delete"
                    confirmLabel="Delete permanently"
                    disabled={t.bookings > 0}
                    title={
                      t.bookings > 0
                        ? "Has bookings — deleting would erase payment records. Remove from the directory instead."
                        : "Deletes the account, profile and course offers"
                    }
                    run={() => deleteTutorAccount(t.profileId)}
                    onResult={setResult}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
