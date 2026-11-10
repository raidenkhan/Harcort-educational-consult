"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Shuffle, TicketPercent } from "lucide-react";
import {
  createDiscountCode,
  revokeDiscountCode,
  type DiscountFormState,
} from "@/services/discounts/actions";
import type { AdminDiscountRow, DiscountStudentOption } from "@/services/discounts/store";
import { generateDiscountCode } from "@/services/discounts/codes";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { ActionStatus, ConfirmAction } from "./ConfirmAction";
import { Pager, usePagination } from "./Pager";

const STATUS: Record<AdminDiscountRow["status"], { label: string; tone: "green" | "neutral" | "red" | "amber" }> = {
  active: { label: "Active", tone: "green" },
  used: { label: "Used", tone: "neutral" },
  revoked: { label: "Revoked", tone: "red" },
  expired: { label: "Expired", tone: "amber" },
};

const label = "mb-1 block text-sm font-medium text-slate-700";

/** The Create form, mounted fresh per open. */
function CreateCodeForm({
  students,
  onCreated,
}: {
  students: DiscountStudentOption[];
  onCreated: (result: DiscountFormState) => void;
}) {
  const [state, formAction, pending] = useActionState<DiscountFormState, FormData>(createDiscountCode, {});
  const [studentId, setStudentId] = useState("");
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (state.message) onCreated(state);
  }, [state, onCreated]);

  const student = students.find((s) => s.id === studentId) ?? null;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? students.filter((s) => `${s.name} ${s.publicCode ?? ""} ${s.programme ?? ""}`.toLowerCase().includes(q))
      : students;
  }, [students, search]);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <span className={label}>Student</span>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code or programme"
          aria-label="Search students"
          className="mb-2"
        />
        <Select
          name="studentId"
          required
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          aria-label="Student"
        >
          <option value="" disabled>
            Choose the student ({matches.length})
          </option>
          {matches.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.programme ? ` · ${s.programme}` : ""}
              {s.year ? ` · Year ${s.year}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Discount (%)</span>
          <Input name="percent" type="number" min={1} max={100} required placeholder="e.g. 15" />
        </label>
        <label className="block">
          <span className={label}>
            Expires <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <Input name="expiresAt" type="date" />
        </label>
      </div>

      <div>
        <span className={label}>Code</span>
        <div className="flex gap-2">
          <Input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            placeholder="Type a code, or generate one"
            className="font-mono"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!student}
            title={student ? "Generate from the student's name, programme and year" : "Choose a student first"}
            onClick={() =>
              student &&
              setCode(generateDiscountCode({ name: student.name, programme: student.programme, year: student.year }))
            }
          >
            <Shuffle className="h-4 w-4" aria-hidden="true" /> Generate
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Generated codes combine the student&apos;s name, programme and year with
          a random block (e.g. AMA-ME2-K7QX9P), so they can&apos;t be guessed. Each
          code works once, only for that student.
        </p>
      </div>

      <label className="block">
        <span className={label}>
          Note <span className="font-normal text-slate-400">(optional, admins only)</span>
        </span>
        <Textarea name="note" rows={2} maxLength={300} placeholder="Why this student gets a discount" />
      </label>

      {state.error && <ActionStatus result={{ error: state.error }} />}

      <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end border-t border-slate-100 bg-white px-6 py-4">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          <TicketPercent className="h-4 w-4" aria-hidden="true" />
          {pending ? "Creating…" : "Create code"}
        </Button>
      </div>
    </form>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked — the code is visible to copy by hand.
        }
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      aria-label={`Copy ${code}`}
    >
      <Copy className="h-3 w-3" aria-hidden="true" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Admin → Discount codes: create personal, single-use percentage codes for a
 * student (typed or generated), and see / revoke existing ones. Harcourt
 * absorbs every discount — tutors are paid their normal share.
 */
export function DiscountCodesManager({
  codes,
  students,
  dateLabels,
}: {
  codes: AdminDiscountRow[];
  students: DiscountStudentOption[];
  /** Pre-formatted dates (server, Accra) keyed by code id. */
  dateLabels: Record<string, { created: string; expires: string | null; used: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<DiscountFormState | null>(null);
  const [show, setShow] = useState<"all" | AdminDiscountRow["status"]>("all");
  const visible = useMemo(() => (show === "all" ? codes : codes.filter((c) => c.status === show)), [codes, show]);
  const paged = usePagination(visible, 10, show);

  const handleCreated = useCallback((r: DiscountFormState) => {
    setOpen(false);
    setResult(r);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={show}
          onChange={(e) => setShow(e.target.value as typeof show)}
          aria-label="Which codes to show"
          className="h-10 w-auto min-w-40"
        >
          <option value="all">All codes ({codes.length})</option>
          <option value="active">Active</option>
          <option value="used">Used</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </Select>
        <Button
          type="button"
          onClick={() => {
            setAttempt((n) => n + 1);
            setOpen(true);
          }}
        >
          <TicketPercent className="h-4 w-4" aria-hidden="true" />
          Create code
        </Button>
      </div>

      <ActionStatus result={result} />

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          {codes.length === 0 ? "No discount codes yet. Create one for a student." : "No codes match."}
        </div>
      ) : (
        <Card padded={false} className="divide-y divide-slate-100 overflow-hidden">
          {paged.slice.map((c) => {
            const d = dateLabels[c.id];
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold text-slate-900">{c.code}</span>
                    <CopyCode code={c.code} />
                    <Badge tone="brand">{c.percent}% off</Badge>
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    For <span className="font-medium text-slate-700">{c.studentName}</span>
                    {c.studentCode ? ` (${c.studentCode})` : ""} · created {d?.created}
                    {d?.expires ? ` · expires ${d.expires}` : ""}
                    {d?.used ? ` · used ${d.used}` : ""}
                    {c.note ? ` · ${c.note}` : ""}
                  </p>
                </div>
                {c.status === "active" && (
                  <ConfirmAction
                    label="Revoke"
                    confirmLabel="Revoke code"
                    run={() => revokeDiscountCode(c.id)}
                    onResult={setResult}
                  />
                )}
              </div>
            );
          })}
        </Card>
      )}

      <Pager {...paged} onPage={paged.setPage} noun="codes" />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a discount code"
        description="A percentage off one student's next booking. Harcourt covers the discount — the tutor is paid their normal share."
        className="max-w-xl"
      >
        {open && <CreateCodeForm key={attempt} students={students} onCreated={handleCreated} />}
      </Modal>
    </div>
  );
}
