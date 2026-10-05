"use client";

import { useActionState, useState } from "react";
import { FileText, Plus, Trash2, Video } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Fields";
import {
  addCourseMaterial,
  addCourseVideo,
  deleteCourseMaterial,
  deleteCourseVideo,
  setCourseYear,
  type CourseLibraryFormState,
} from "@/services/courses/mutations";
import { FILE_FORMATS, MATERIAL_CATEGORIES } from "@/services/courses/schemas";
import { semesterLabel } from "@/services/courses/semesters";
import { YEARS } from "@/components/home/courseTaxonomy";
import type { CourseMaterial, CourseVideo } from "@/types";

/**
 * CourseLibraryConsole — admin authoring for the course library (0017).
 *
 * One screen, two jobs: attach materials and tutorial videos to a course, and
 * remove the ones already there. A course picker at the top scopes both the
 * forms and the list below, so the admin never has to think about which
 * course a row belongs to.
 *
 * All writes go through the server actions in services/courses/mutations.ts
 * (admin-gated, Zod-validated, audited); this component is presentation only.
 */

type MaterialRow = CourseMaterial & { course_name: string; course_subject: string };
type VideoRow = CourseVideo & { course_name: string; course_subject: string };

type CourseOption = { id: string; subject: string; name: string; year: number | null };

function AssetForm({
  action,
  children,
  submitLabel,
  state,
  pending,
}: {
  action: (payload: FormData) => void;
  children: React.ReactNode;
  submitLabel: string;
  state: CourseLibraryFormState;
  pending: boolean;
}) {
  return (
    <form action={action} className="mt-5 space-y-4">
      {children}
      <Button type="submit" disabled={pending}>
        <Plus className="h-4 w-4" />
        {pending ? "Saving…" : submitLabel}
      </Button>
      {state.error && (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="text-sm text-emerald-700" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function CourseLibraryConsole({
  courses,
  materials,
  videos,
}: {
  courses: CourseOption[];
  materials: MaterialRow[];
  videos: VideoRow[];
}) {
  const [materialState, materialAction, materialPending] = useActionState<
    CourseLibraryFormState,
    FormData
  >(addCourseMaterial, {});
  const [videoState, videoAction, videoPending] = useActionState<
    CourseLibraryFormState,
    FormData
  >(addCourseVideo, {});

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const subjects = Array.from(new Set(courses.map((course) => course.subject)));
  const selectedCourse = courses.find((course) => course.id === courseId);

  const courseMaterials = materials.filter((row) => row.course_id === courseId);
  const courseVideos = videos.filter((row) => row.course_id === courseId);

  if (courses.length === 0) {
    return (
      <p className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
        No courses in the taxonomy yet — run migration 0002 to seed the KNUST
        catalog.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      {/* Course picker — scopes everything below, plus its year tier. */}
      <Card className="flex flex-col gap-4 sm:max-w-xl">
        <Field
          label="Course"
          htmlFor="library-course"
          hint="Pick the course you're adding to, or reviewing."
        >
          <Select
            id="library-course"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
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

        <form action={setCourseYear} className="flex items-end gap-3">
          <input type="hidden" name="courseId" value={courseId} />
          <div className="w-44">
            <Field
              label="Year"
              htmlFor="library-year"
              hint="Which year this course is taught in."
            >
              <Select
                key={selectedCourse?.year ?? "all"}
                id="library-year"
                name="year"
                defaultValue={selectedCourse?.year?.toString() ?? ""}
              >
                <option value="">All years</option>
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    Year {year}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit">Save year</Button>
        </form>
      </Card>

      {/* Authoring forms */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600" />
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Add a material
            </h2>
          </div>
          <AssetForm
            action={materialAction}
            submitLabel="Add material"
            state={materialState}
            pending={materialPending}
          >
            <input type="hidden" name="courseId" value={courseId} />
            <Field label="Title" htmlFor="material-title">
              <Input
                id="material-title"
                name="title"
                required
                placeholder="Lecture Notes — Chapter 1: Kinematics"
              />
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
              <Field
                label="Semester"
                htmlFor="material-semester"
                hint="Groups it on the course page."
              >
                <Select
                  id="material-semester"
                  name="semester"
                  defaultValue=""
                >
                  <option value="">Not assigned</option>
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </Select>
              </Field>
            </div>
            <Field
              label="Link"
              htmlFor="material-url"
              hint="Where the file lives (Drive, institutional page…)."
            >
              <Input
                id="material-url"
                name="fileUrl"
                type="url"
                required
                placeholder="https://drive.google.com/…"
              />
            </Field>
            <Field label="Description" htmlFor="material-description" hint="Optional">
              <Textarea
                id="material-description"
                name="description"
                placeholder="What the student gets from this file."
              />
            </Field>
          </AssetForm>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-brand-600" />
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Add a tutorial video
            </h2>
          </div>
          <AssetForm
            action={videoAction}
            submitLabel="Add video"
            state={videoState}
            pending={videoPending}
          >
            <input type="hidden" name="courseId" value={courseId} />
            <Field label="Title" htmlFor="video-title">
              <Input
                id="video-title"
                name="title"
                required
                placeholder="01 — Introduction to Dynamics of Machinery"
              />
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
                <Input
                  id="video-order"
                  name="sortOrder"
                  type="number"
                  min={0}
                  max={999}
                  defaultValue={0}
                />
              </Field>
              <Field
                label="Semester"
                htmlFor="video-semester"
                hint="Groups it on the course page."
              >
                <Select id="video-semester" name="semester" defaultValue="">
                  <option value="">Not assigned</option>
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="video-description" hint="Optional">
              <Textarea
                id="video-description"
                name="description"
                placeholder="What the lesson covers."
              />
            </Field>
          </AssetForm>
        </Card>
      </div>

      {/* What's on this course today */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Materials on this course ({courseMaterials.length})
          </h2>
          {courseMaterials.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Nothing attached yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {courseMaterials.map((material) => (
                <li
                  key={material.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {material.title}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone="neutral">{material.category}</Badge>
                      <Badge
                        tone={material.semester ? "petrol" : "amber"}
                      >
                        {semesterLabel(material.semester)}
                      </Badge>
                      <span className="uppercase tracking-widest">
                        {material.file_format}
                      </span>
                    </p>
                  </div>
                  <form action={deleteCourseMaterial}>
                    <input type="hidden" name="id" value={material.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${material.title}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Videos on this course ({courseVideos.length})
          </h2>
          {courseVideos.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing attached yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {courseVideos.map((video) => (
                <li
                  key={video.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {video.title}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">{video.video_id}</span>
                      <Badge tone={video.semester ? "petrol" : "amber"}>
                        {semesterLabel(video.semester)}
                      </Badge>
                      {video.topic && <span>{video.topic}</span>}
                      {video.duration && <span>{video.duration}</span>}
                    </p>
                  </div>
                  <form action={deleteCourseVideo}>
                    <input type="hidden" name="id" value={video.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${video.title}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
