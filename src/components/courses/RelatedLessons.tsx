import Image from "next/image";
import { ArrowUpRight, Play } from "lucide-react";
import { LESSONS } from "@/components/home/HarcourtUniversity";
import { LESSON_FIELDS } from "@/components/home/courseTaxonomy";

/**
 * RelatedLessons — free lessons from the Harcourt University library that
 * belong to the same field as this course.
 *
 * Why it exists: a course page must never be an empty shell. Before an admin
 * has attached course-specific videos, the field's public lessons still give
 * a visitor something to watch. They open on YouTube rather than playing
 * inline, so this stays a server component with no player JS.
 *
 * Returns null when the field has no lessons — the section is simply absent
 * rather than showing an empty heading.
 */
export function RelatedLessons({
  field,
  excludeVideoIds = [],
}: {
  /** The course's field (the `subject` column). */
  field: string;
  /** Course-attached video ids, so a lesson isn't listed twice. */
  excludeVideoIds?: string[];
}) {
  const lessons = LESSONS.filter(
    (lesson) =>
      (LESSON_FIELDS[lesson.id] ?? []).includes(field) &&
      !excludeVideoIds.includes(lesson.id),
  ).slice(0, 3);

  if (lessons.length === 0) return null;

  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {lessons.map((lesson) => (
        <li key={lesson.id}>
          <a
            href={`https://www.youtube.com/watch?v=${lesson.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span className="relative block aspect-video overflow-hidden bg-petrol-950">
              <Image
                src={`https://i.ytimg.com/vi/${lesson.id}/hq720.jpg`}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover opacity-90 transition duration-300 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.03] group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white/95 text-petrol-900 transition duration-200 [transition-timing-function:var(--ease-out)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                  <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />
                </span>
              </span>
              <span className="absolute bottom-2 right-2 rounded-md bg-petrol-950/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                {lesson.length}
              </span>
            </span>
            <span className="block p-4">
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-brand-600">
                {lesson.topic}
              </span>
              <span className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold leading-snug text-slate-900">
                {lesson.title}
                <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
