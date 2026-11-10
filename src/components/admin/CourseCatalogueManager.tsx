"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { BookPlus, Search } from "lucide-react";
import { createCourse, deleteCourse, type ManageState } from "@/services/admin/manage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Fields";
import { ActionStatus, ConfirmAction } from "./ConfirmAction";

export type CatalogueCourse = {
  id: string;
  subject: string;
  code: string | null;
  name: string;
  credits: number | null;
  year: number | null;
  semester: number | null;
  offers: number;
  bookings: number;
};

/** Admin → Courses → Add a course: published to the programme immediately. */
function AddCourseForm({ programmes, defaultProgramme }: { programmes: string[]; defaultProgramme: string }) {
  const [state, formAction, pending] = useActionState<ManageState, FormData>(createCourse, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <BookPlus className="h-4 w-4 text-brand-600" aria-hidden="true" /> Add a course
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Published straight away: students of that programme see it on their
        Courses page, and tutors can offer it.
      </p>
      <form ref={formRef} action={formAction} className="mt-4 grid gap-3 sm:grid-cols-6">
        <label className="text-sm sm:col-span-3">
          <span className="mb-1 block font-medium text-slate-700">Programme</span>
          <Select name="subject" defaultValue={defaultProgramme} required>
            {programmes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm sm:col-span-1">
          <span className="mb-1 block font-medium text-slate-700">Code</span>
          <Input name="code" placeholder="ME 261" required autoComplete="off" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Course name</span>
          <Input name="name" required autoComplete="off" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Credit hours</span>
          <Input name="credits" type="number" min={0} max={12} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Year</span>
          <Select name="year" defaultValue="">
            <option value="">Any year</option>
            {[1, 2, 3, 4].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Semester</span>
          <Select name="semester" defaultValue="">
            <option value="">Both / not set</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </Select>
        </label>
        <label className="text-sm sm:col-span-6">
          <span className="mb-1 block font-medium text-slate-700">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <Input name="description" maxLength={500} />
        </label>
        <div className="sm:col-span-6">
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add course"}
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
 * Admin → Courses → Catalogue: add a course to any programme and delete
 * courses. Filter by programme, search by code or name. Delete is blocked
 * while a booking uses the course (the server and database both refuse);
 * the confirm step says how many tutor offers go with it.
 */
export function CourseCatalogueManager({
  courses,
  programmes,
}: {
  courses: CatalogueCourse[];
  programmes: string[];
}) {
  const [programme, setProgramme] = useState(programmes[0] ?? "");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ManageState | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses
      .filter((c) => c.subject === programme)
      .filter((c) => !q || `${c.code ?? ""} ${c.name}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (a.year ?? 9) - (b.year ?? 9) ||
          (a.semester ?? 9) - (b.semester ?? 9) ||
          (a.code ?? a.name).localeCompare(b.code ?? b.name),
      );
  }, [courses, programme, query]);

  return (
    <div className="space-y-4">
      <AddCourseForm programmes={programmes} defaultProgramme={programme} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          value={programme}
          onChange={(e) => setProgramme(e.target.value)}
          aria-label="Programme"
          className="h-10 sm:max-w-xs"
        >
          {programmes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code or name"
            aria-label="Search courses"
            className="h-10 pl-9"
          />
        </div>
      </div>

      <ActionStatus result={result} />

      <p className="text-xs text-slate-500">
        {visible.length} course{visible.length === 1 ? "" : "s"} in {programme}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          No courses match.
        </div>
      ) : (
        <Card padded={false} className="divide-y divide-slate-100 overflow-hidden">
          {visible.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {c.code && (
                    <span className="mr-1.5 rounded-[2px] bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand-800">
                      {c.code}
                    </span>
                  )}
                  {c.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[
                    c.year ? `Year ${c.year}` : "Any year",
                    c.semester ? `Semester ${c.semester}` : null,
                    c.credits != null ? `${c.credits} cr` : null,
                    `${c.offers} tutor${c.offers === 1 ? "" : "s"}`,
                    `${c.bookings} booking${c.bookings === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ConfirmAction
                label="Delete"
                confirmLabel={c.offers > 0 ? `Delete (removes ${c.offers} tutor offer${c.offers === 1 ? "" : "s"})` : "Delete permanently"}
                disabled={c.bookings > 0}
                title={c.bookings > 0 ? "Has bookings — can't be deleted" : undefined}
                run={() => deleteCourse(c.id)}
                onResult={setResult}
              />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
