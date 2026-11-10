"use client";

import { useRouter } from "next/navigation";

/**
 * The student Courses page's semester filter, as a dropdown. It changes the
 * URL (?semester=) and keeps the chosen year, so the page stays server-
 * rendered and a filtered view can be bookmarked or shared.
 */
export function SemesterFilterSelect({
  year,
  semester,
}: {
  year: number | null;
  semester: number | null;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Filter by semester"
      value={semester ? String(semester) : ""}
      onChange={(event) => {
        const params = new URLSearchParams();
        if (year) params.set("year", String(year));
        if (event.target.value) params.set("semester", event.target.value);
        const q = params.toString();
        router.push(q ? `/dashboard/courses?${q}` : "/dashboard/courses");
      }}
      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
    >
      <option value="">Both semesters</option>
      <option value="1">Semester 1</option>
      <option value="2">Semester 2</option>
    </select>
  );
}
