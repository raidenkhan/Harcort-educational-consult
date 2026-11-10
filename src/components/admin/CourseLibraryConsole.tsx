"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { FileText, Plus, Trash2, Video } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import {
  addCourseMaterial,
  addCourseVideo,
  deleteCourseMaterial,
  deleteCourseVideo,
  type CourseLibraryFormState,
} from "@/services/courses/mutations";
import { FILE_FORMATS, MATERIAL_CATEGORIES } from "@/services/courses/schemas";
import { semesterLabel } from "@/services/courses/semesters";
import type { CourseMaterial, CourseVideo } from "@/types";
import { Pager, usePagination } from "./Pager";

/**
 * CourseLibraryConsole — admin authoring for the course library (0017), on
 * ONE card: a course picker, then that course's materials and videos side by
 * side. "Add material" / "Add video" open the forms in modals (the same
 * pattern as Add tutor / Add course), and both lists page 10 at a time.
 *
 * All writes go through the server actions in services/courses/mutations.ts
 * (admin-gated, Zod-validated, audited); this component is presentation only.
 */

type MaterialRow = CourseMaterial & { course_name: string; course_subject: string };
type VideoRow = CourseVideo & { course_name: string; course_subject: string };
type CourseOption = { id: string; subject: string; name: string; year: number | null };
type LibraryAction = (prev: CourseLibraryFormState, payload: FormData) => Promise<CourseLibraryFormState>;

/** The form inside a modal — mounted fresh per open, reports success up. */
function AssetFormBody({
  serverAction,
  submitLabel,
  onSaved,
  children,
}: {
  serverAction: LibraryAction;
  submitLabel: string;
  onSaved: (message: string) => void;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<CourseLibraryFormState, FormData>(serverAction, {});
  useEffect(() => {
    if (state.message) onSaved(state.message);
  }, [state, onSaved]);

  return (
    <form action={action} className="mt-4 space-y-4">
      {children}
      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        <Plus className="h-4 w-4" />
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

/** A button that opens one asset form in a modal. */
function AddAssetButton({
  label,
  title,
  description,
  icon: Icon,
  serverAction,
  onSaved,
  children,
}: {
  label: string;
  title: string;
  description: string;
  icon: typeof FileText;
  serverAction: LibraryAction;
  onSaved: (message: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const handleSaved = useCallback(
    (message: string) => {
      setOpen(false);
      onSaved(message);
    },
    [onSaved],
  );

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setAttempt((n) => n + 1);
          setOpen(true);
        }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description} className="max-w-xl">
        {open && (
          <AssetFormBody key={attempt} serverAction={serverAction} submitLabel={label} onSaved={handleSaved}>
            {children}
          </AssetFormBody>
        )}
      </Modal>
    </>
  );
}

const SEMESTER_OPTIONS = (
  <>
    <option value="">Not assigned</option>
    <option value="1">Semester 1</option>
    <option value="2">Semester 2</option>
  </>
);

export function CourseLibraryConsole({
  courses,
  materials,
  videos,
}: {
  courses: CourseOption[];
  materials: MaterialRow[];
  videos: VideoRow[];
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const subjects = Array.from(new Set(courses.map((course) => course.subject)));
  const selectedCourse = courses.find((course) => course.id === courseId);
  const courseName = selectedCourse?.name ?? "this course";

  const courseMaterials = materials.filter((row) => row.course_id === courseId);
  const courseVideos = videos.filter((row) => row.course_id === courseId);
  // 10 per page; switching course resets both lists to page 1.
  const materialPages = usePagination(courseMaterials, 10, courseId);
  const videoPages = usePagination(courseVideos, 10, courseId);

  if (courses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
        No courses in the catalogue yet.
      </p>
    );
  }

  return (
    <Card>
      {/* Course picker — scopes both lists. */}
      <div className="sm:max-w-md">
        <Field label="Course" htmlFor="library-course">
          <Select id="library-course" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            {subjects.map((subject) => (
              <optgroup key={subject} label={subject}>
                {courses
                  .filter((course) => course.subject === subject)
                  .map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>

      {saved && (
        <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {saved}
        </p>
      )}

      {/* Materials | Videos, side by side on wide screens, in the same card. */}
      <div className="mt-6 grid gap-8 border-t border-slate-100 pt-6 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-slate-100">
        {/* ── Materials ───────────────────────────────────────── */}
        <section aria-label="Materials" className="lg:pr-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <FileText className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Materials ({courseMaterials.length})
            </h3>
            <AddAssetButton
              label="Add material"
              title="Add a material"
              description={`Attach a file to ${courseName}. It appears on the course page straight away.`}
              icon={FileText}
              serverAction={addCourseMaterial}
              onSaved={setSaved}
            >
              <input type="hidden" name="courseId" value={courseId} />
              <Field label="Title" htmlFor="material-title">
                <Input id="material-title" name="title" required placeholder="Lecture Notes — Chapter 1: Kinematics" />
              </Field>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Category" htmlFor="material-category">
                  <Select id="material-category" name="category" defaultValue="Lecture Notes">
                    {MATERIAL_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Format" htmlFor="material-format">
                  <Select id="material-format" name="fileFormat" defaultValue="PDF">
                    {FILE_FORMATS.map((format) => (
                      <option key={format} value={format}>
                        {format}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Semester" htmlFor="material-semester">
                  <Select id="material-semester" name="semester" defaultValue="">
                    {SEMESTER_OPTIONS}
                  </Select>
                </Field>
              </div>
              <Field label="Link" htmlFor="material-url" hint="Where the file lives (Drive, institutional page…).">
                <Input id="material-url" name="fileUrl" type="url" required placeholder="https://drive.google.com/…" />
              </Field>
              <Field label="Description" htmlFor="material-description" hint="Optional">
                <Textarea id="material-description" name="description" placeholder="What the student gets from this file." />
              </Field>
            </AddAssetButton>
          </div>

          {courseMaterials.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing attached yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {materialPages.slice.map((material) => (
                <li key={material.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{material.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone="neutral">{material.category}</Badge>
                      <Badge tone={material.semester ? "petrol" : "amber"}>{semesterLabel(material.semester)}</Badge>
                      <span className="uppercase tracking-widest">{material.file_format}</span>
                    </p>
                  </div>
                  <form action={deleteCourseMaterial}>
                    <input type="hidden" name="id" value={material.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${material.title}`}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Pager {...materialPages} onPage={materialPages.setPage} noun="materials" />
          </div>
        </section>

        {/* ── Videos ──────────────────────────────────────────── */}
        <section aria-label="Videos" className="lg:pl-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Video className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Videos ({courseVideos.length})
            </h3>
            <AddAssetButton
              label="Add video"
              title="Add a tutorial video"
              description={`Add a YouTube lesson to ${courseName}. It plays inline on the course page.`}
              icon={Video}
              serverAction={addCourseVideo}
              onSaved={setSaved}
            >
              <input type="hidden" name="courseId" value={courseId} />
              <Field label="Title" htmlFor="video-title">
                <Input id="video-title" name="title" required placeholder="01 — Introduction to Dynamics of Machinery" />
              </Field>
              <Field
                label="YouTube video id"
                htmlFor="video-id"
                hint="The 11-character id from the video URL (watch?v=XXXXXXXXXXX)."
              >
                <Input id="video-id" name="videoId" required placeholder="9MK_Trj4a24" />
              </Field>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Topic" htmlFor="video-topic">
                  <Input id="video-topic" name="topic" placeholder="Kinematics" />
                </Field>
                <Field label="Duration" htmlFor="video-duration">
                  <Input id="video-duration" name="duration" placeholder="24:18" />
                </Field>
                <Field label="Order" htmlFor="video-order">
                  <Input id="video-order" name="sortOrder" type="number" min={0} max={999} defaultValue={0} />
                </Field>
                <Field label="Semester" htmlFor="video-semester">
                  <Select id="video-semester" name="semester" defaultValue="">
                    {SEMESTER_OPTIONS}
                  </Select>
                </Field>
              </div>
              <Field label="Description" htmlFor="video-description" hint="Optional">
                <Textarea id="video-description" name="description" placeholder="What the lesson covers." />
              </Field>
            </AddAssetButton>
          </div>

          {courseVideos.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing attached yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {videoPages.slice.map((video) => (
                <li key={video.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{video.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">{video.video_id}</span>
                      <Badge tone={video.semester ? "petrol" : "amber"}>{semesterLabel(video.semester)}</Badge>
                      {video.topic && <span>{video.topic}</span>}
                      {video.duration && <span>{video.duration}</span>}
                    </p>
                  </div>
                  <form action={deleteCourseVideo}>
                    <input type="hidden" name="id" value={video.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${video.title}`}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Pager {...videoPages} onPage={videoPages.setPage} noun="videos" />
          </div>
        </section>
      </div>
    </Card>
  );
}
