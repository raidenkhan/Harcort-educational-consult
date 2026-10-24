import { ExternalLink, FolderOpen, Video } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CourseMaterialsEntry } from "@/services/library/courseMaterials";
import { Badge } from "@/components/ui/Badge";

/**
 * A course's study materials on Google Drive.
 *
 * This block used to live on its own `/library` page, one click away from the
 * course it belonged to. It now sits ON the course page, next to the tutors —
 * a student picks a course and immediately sees its notes folder and video
 * playlists, instead of having to know that a second browsing tree existed.
 *
 * Purely presentational: `findCourseMaterials` does the lookup server-side,
 * and every link opens Drive in a new tab (the folder is the source of truth
 * for the files, so nothing is copied into the app).
 */
export function DriveMaterials({
  entry,
  courseName,
}: {
  entry: CourseMaterialsEntry;
  courseName: string;
}) {
  const hasVideos = entry.videos.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Study materials
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-[0.01em] text-slate-900">
            Notes and tutorial videos
          </h2>
        </div>
        <Badge tone="brand">
          {entry.yearTitle} · {entry.termTitle}
        </Badge>
      </div>

      <div
        className={cn(
          "mt-6 grid gap-4",
          hasVideos && "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        <a
          href={entry.driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "group flex h-full flex-col justify-between rounded-lg border border-slate-200 bg-white p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
            hasVideos && "sm:col-span-2",
          )}
        >
          <span className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
              <FolderOpen className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {entry.code} · Google Drive
              </span>
              <span className="mt-1 block font-display text-lg font-semibold leading-snug text-slate-900">
                {courseName} folder
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-slate-600">
                Lecture notes, slides and past questions, filed by the Harcourt
                team.
              </span>
            </span>
          </span>
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            Open the folder
            <ExternalLink className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </span>
        </a>

        {hasVideos && (
          <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Tutorial playlists
              </p>
            </div>
            <ul className="mt-3 space-y-2">
              {entry.videos.map((video) => (
                <li key={video.url}>
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start justify-between gap-2 rounded-md px-1 py-1.5 text-sm font-medium leading-snug text-slate-700 transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    {video.title}
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-500">
        Folders open in Google Drive.{" "}
        <a
          href={entry.yearUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand-600 transition hover:text-brand-700"
        >
          Open the whole {entry.yearTitle} folder
        </a>{" "}
        for every course in {entry.programName}.
      </p>
    </div>
  );
}
