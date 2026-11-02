"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { Select } from "@/components/ui/Fields";

/**
 * Payment agreements, ONE student at a time.
 *
 * The old console stacked every student's agreements into a single endless
 * list — plan queue, forms and all (user report). Now the admin picks a
 * student and only that student's cards render (the others aren't in the
 * DOM at all, so a long roster stays cheap).
 *
 * The cards are rendered SERVER-side by `AdminPaymentsConsole` and passed as
 * a flat array of `<li data-student="…">` — each card declares its own
 * student, so filtering needs no index alignment with the `students` picker
 * list and the money forms keep their server-rendered context. Only the
 * selection itself is client state. The first student is the default; the
 * console orders the picker so a student who still owes comes first.
 */
export function AdminAgreementsByStudent({
  students,
  children,
}: {
  students: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(students[0]?.id ?? "");
  // If the prop list ever changes under a mounted picker (revalidation),
  // fall back to the first student rather than rendering a blank panel.
  const activeId = students.some((student) => student.id === selectedId)
    ? selectedId
    : (students[0]?.id ?? "");

  const panels = Children.toArray(children).filter((child) => {
    if (!isValidElement(child)) return false;
    const props = child.props as { "data-student"?: string };
    return props["data-student"] === activeId;
  });

  return (
    <div className="mt-4">
      <label
        htmlFor="agreement-student"
        className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
      >
        Student
      </label>
      <Select
        id="agreement-student"
        value={activeId}
        onChange={(event) => setSelectedId(event.target.value)}
        className="mt-1 max-w-lg"
      >
        {students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.label}
          </option>
        ))}
      </Select>
      <ul className="mt-3 space-y-3">{panels}</ul>
    </div>
  );
}
