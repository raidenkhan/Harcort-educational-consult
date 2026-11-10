"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Fields";
import { TutorAvatar } from "@/components/ui/TutorAvatar";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { blockAccount, unblockAccount, type ManageState } from "@/services/admin/manage";
import { ActionStatus, ConfirmAction } from "./ConfirmAction";
import { Pager, usePagination } from "./Pager";

export type DirectoryPerson = {
  id: string;
  name: string;
  role: "student" | "tutor";
  publicCode: string | null;
  email: string | null;
  /** Pre-formatted on the server (Accra time) so it never re-renders. */
  joinedLabel: string;
  isAdmin: boolean;
  tutorStatus: "pending" | "approved" | "rejected" | null;
  /** Blocked by an admin (0043): can't sign in, tutors hidden. */
  blocked: boolean;
};

type Show = "all" | "student" | "tutor" | "blocked";

const TUTOR_STATUS: Record<
  NonNullable<DirectoryPerson["tutorStatus"]>,
  { label: string; tone: "green" | "amber" | "red" }
> = {
  approved: { label: "Approved", tone: "green" },
  pending: { label: "Pending review", tone: "amber" },
  rejected: { label: "Rejected", tone: "red" },
};

/**
 * Everyone on the platform, filtered by a Show dropdown (all / students /
 * tutors) and a search over name, code and email. Filtering is client-side:
 * the list is small and already on the page.
 */
export function PeopleDirectory({ people }: { people: DirectoryPerson[] }) {
  const [show, setShow] = useState<Show>("all");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ManageState | null>(null);

  const counts = useMemo(
    () => ({
      all: people.length,
      student: people.filter((p) => p.role === "student").length,
      tutor: people.filter((p) => p.role === "tutor").length,
      blocked: people.filter((p) => p.blocked).length,
    }),
    [people],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((person) => {
      if (show === "blocked" ? !person.blocked : show !== "all" && person.role !== show) return false;
      if (!q) return true;
      return [person.name, person.publicCode, person.email].some((field) =>
        field?.toLowerCase().includes(q),
      );
    });
  }, [people, show, query]);
  // Back to page 1 whenever the filter or search changes.
  const paged = usePagination(visible, 10, `${show}|${query}`);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Show
          <Select
            value={show}
            onChange={(e) => setShow(e.target.value as Show)}
            className="h-10 w-auto min-w-44"
            aria-label="Which people to show"
          >
            <option value="all">All ({counts.all})</option>
            <option value="student">Students ({counts.student})</option>
            <option value="tutor">Tutors ({counts.tutor})</option>
            <option value="blocked">Blocked ({counts.blocked})</option>
          </Select>
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, code or email"
            aria-label="Search people"
            className="h-10 pl-9"
          />
        </div>
      </div>

      {result && (
        <div className="mt-3">
          <ActionStatus result={result} />
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500" aria-live="polite">
        {visible.length} of {counts[show]} {show === "all" ? "people" : show === "blocked" ? "blocked" : `${show}s`}
      </p>

      {visible.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          {people.length === 0
            ? "No students or tutors have signed up yet."
            : "Nobody matches that search."}
        </div>
      ) : (
        <Card padded={false} className="mt-3 divide-y divide-slate-100 overflow-hidden">
          {paged.slice.map((person) => (
            <div
              key={person.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
            >
              <TutorAvatar name={person.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <span className="truncate">{person.name}</span>
                  {person.isAdmin && <VerifiedBadge />}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {person.publicCode && (
                    <span className="mr-2 font-mono text-slate-400">
                      {person.publicCode}
                    </span>
                  )}
                  {person.email ?? "No email"} · joined {person.joinedLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={person.role === "tutor" ? "petrol" : "neutral"}>
                  {person.role === "tutor" ? "Tutor" : "Student"}
                </Badge>
                {person.role === "tutor" && person.tutorStatus && (
                  <Badge tone={TUTOR_STATUS[person.tutorStatus].tone}>
                    {TUTOR_STATUS[person.tutorStatus].label}
                  </Badge>
                )}
                {person.role === "tutor" && !person.tutorStatus && (
                  <Badge tone="neutral">No profile yet</Badge>
                )}
                {person.blocked && <Badge tone="red">Blocked</Badge>}
                {/* Admins are staff and can't be blocked (the server refuses too). */}
                {!person.isAdmin &&
                  (person.blocked ? (
                    <ConfirmAction
                      label="Unblock"
                      confirmLabel="Unblock"
                      tone="neutral"
                      run={() => unblockAccount(person.id)}
                      onResult={setResult}
                    />
                  ) : (
                    <ConfirmAction
                      label="Block"
                      confirmLabel="Block & sign out"
                      title="They can't sign in until unblocked; tutors leave the directory. Nothing is deleted."
                      run={() => blockAccount(person.id)}
                      onResult={setResult}
                    />
                  ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* 10 per page so the People tab stays a reasonable length. */}
      <div className="mt-3">
        <Pager
          page={paged.page}
          pages={paged.pages}
          from={paged.from}
          to={paged.to}
          total={paged.total}
          onPage={paged.setPage}
        />
      </div>
    </div>
  );
}
