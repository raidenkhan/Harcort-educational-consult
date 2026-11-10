"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { BookPlus, Search } from "lucide-react";
import { createCourse, deleteCourse, type ManageState } from "@/services/admin/manage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Fields";
import { ActionStatus, ConfirmAction } from "./ConfirmAction";
import { Pager, usePagination } from "./Pager";

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

/** The Add-course form, shown inside the modal. Mounted fresh each time the
 *  modal opens, so a previous attempt's values and errors never linger. */
function AddCourseFormBody({
  programmes,
  defaultProgramme,
  onAdded,
}: {
  programmes: string[];
  defaultProgramme: string;
  onAdded: (result: ManageState) => void;
}) {
  const [state, formAction, pending] = useActionState<ManageState, FormData>(createCourse, {});
  useEffect(() => {
    if (state.message) onAdded(state);
  }, [state, onAdded]);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-6">
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
      {state.error && (
        <div className="sm:col-span-6">
          <ActionStatus result={{ error: state.error }} />
        </div>
      )}
      <div className="sm:col-span-6">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Adding…" : "Add course"}
        </Button>
      </div>
    </form>
  );
}

/** Admin → Courses → "Add course" button: opens the form in a modal so the
 *  page stays short. On success the modal closes and the catalogue's status
 *  line reports it. */
function AddCourseButton({
  programmes,
  defaultProgramme,
  onAdded,
}: {
  programmes: string[];
  defaultProgramme: string;
  onAdded: (result: ManageState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const handleAdded = useCallback(
    (result: ManageState) => {
      setOpen(false);
      onAdded(result);
    },
    [onAdded],
  );

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setAttempt((n) => n + 1);
          setOpen(true);
        }}
      >
        <BookPlus className="h-4 w-4" aria-hidden="true" />
        Add course
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a course"
        description="Published straight away: students of that programme see it on their Courses page, and tutors can offer it."
        className="max-w-2xl"
      >
        <div className="mt-4">
          {open && (
            <AddCourseFormBody
              key={attempt}
              programmes={programmes}
              defaultProgramme={defaultProgramme}
              onAdded={handleAdded}
            />
          )}
        </div>
      </Modal>
    </>
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
  // 10 per page; back to page 1 whenever the programme or search changes.
  const paged = usePagination(visible, 10, `${programme}|${query}`);

  return (
    <div className="space-y-4">
      {/* Same pattern as Add tutor: one button, the form opens in a modal. */}
      <div className="flex justify-end">
        <AddCourseButton
          programmes={programmes}
          defaultProgramme={programme}
          onAdded={setResult}
        />
      </div>

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
          {paged.slice.map((c) => (
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

      <Pager
        page={paged.page}
        pages={paged.pages}
        from={paged.from}
        to={paged.to}
        total={paged.total}
        onPage={paged.setPage}
        noun="courses"
      />
    </div>
  );
}
