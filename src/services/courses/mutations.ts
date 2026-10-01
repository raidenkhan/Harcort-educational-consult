"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/services/auth/queries";
import { profileIsAdmin } from "@/lib/auth/admin";
import {
  courseAssetIdSchema,
  createMaterialSchema,
  createVideoSchema,
} from "./schemas";

/**
 * Course-library mutations — the admin-authored half of 0017.
 *
 * Same contract as every other service here: the acting admin is re-derived
 * server-side from the session cookie (never trusted from the form), input is
 * parsed with Zod at the boundary, and every write is mirrored into
 * admin_audit_log so the console keeps a trail. Admins can only add and
 * remove assets in v1; there is no edit (delete + re-add instead).
 */

export type CourseLibraryFormState = { error?: string; message?: string };

/**
 * Read the semester select. Blank means "not assigned yet" and becomes
 * `undefined` (valid) rather than `0` (which would fail validation).
 */
function readSemester(formData: FormData): number | undefined {
  const raw = String(formData.get("semester") ?? "").trim();
  return raw ? Number(raw) : undefined;
}

/** Best-effort audit entry — a logging failure must never fail the action. */
async function writeAudit(
  adminId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_type: "course",
    target_id: targetId,
    metadata,
  });
  if (error) console.error("[courses] audit write failed:", error.message);
}

/** Bust the admin console and the public course page after a change. */
function revalidateCourse(courseId: string): void {
  revalidatePath("/admin/courses");
  revalidatePath(`/courses/${courseId}`);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export async function addCourseMaterial(
  _prev: CourseLibraryFormState,
  formData: FormData,
): Promise<CourseLibraryFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) return { error: "You're not allowed to do that." };

  const parsed = createMaterialSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    category: formData.get("category"),
    fileFormat: formData.get("fileFormat"),
    fileUrl: formData.get("fileUrl"),
    description: formData.get("description") || undefined,
    semester: readSemester(formData),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid material" };
  }

  const { courseId, title, category, fileFormat, fileUrl, description, semester } =
    parsed.data;

  const supabase = createAdminClient();
  const { error } = await supabase.from("course_materials").insert({
    course_id: courseId,
    title,
    category,
    file_format: fileFormat,
    file_url: fileUrl,
    description: description || null,
    semester: semester ?? null,
  });
  if (error) return { error: error.message };

  await writeAudit(profile.id, "course_material_added", courseId, {
    title,
    category,
    file_format: fileFormat,
    semester: semester ?? null,
  });
  revalidateCourse(courseId);

  return { message: `Added “${title}”.` };
}

export async function deleteCourseMaterial(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) throw new Error("Forbidden");

  const parsed = courseAssetIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;

  const supabase = createAdminClient();
  // Read the owning course first: the public page needs revalidating, and
  // after the delete the row is gone.
  const { data: row } = await supabase
    .from("course_materials")
    .select("course_id, title")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!row) return;

  const material = row as { course_id: string; title: string };
  const { error } = await supabase
    .from("course_materials")
    .delete()
    .eq("id", parsed.data.id);
  if (error) throw new Error(error.message);

  await writeAudit(profile.id, "course_material_removed", material.course_id, {
    title: material.title,
  });
  revalidateCourse(material.course_id);
}

// ---------------------------------------------------------------------------
// Tutorial videos
// ---------------------------------------------------------------------------

export async function addCourseVideo(
  _prev: CourseLibraryFormState,
  formData: FormData,
): Promise<CourseLibraryFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) return { error: "You're not allowed to do that." };

  const parsed = createVideoSchema.safeParse({
    courseId: formData.get("courseId"),
    videoId: formData.get("videoId"),
    title: formData.get("title"),
    topic: formData.get("topic") || undefined,
    duration: formData.get("duration") || undefined,
    description: formData.get("description") || undefined,
    sortOrder: formData.get("sortOrder") || undefined,
    semester: readSemester(formData),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid video" };
  }

  const { courseId, videoId, title, topic, duration, description, sortOrder, semester } =
    parsed.data;

  const supabase = createAdminClient();
  const { error } = await supabase.from("course_videos").insert({
    course_id: courseId,
    provider: "youtube",
    video_id: videoId,
    title,
    topic: topic || null,
    duration: duration || null,
    description: description || null,
    sort_order: sortOrder ?? 0,
    semester: semester ?? null,
  });
  if (error) return { error: error.message };

  await writeAudit(profile.id, "course_video_added", courseId, {
    title,
    video_id: videoId,
    semester: semester ?? null,
  });
  revalidateCourse(courseId);

  return { message: `Added “${title}”.` };
}

export async function deleteCourseVideo(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) throw new Error("Forbidden");

  const parsed = courseAssetIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("course_videos")
    .select("course_id, title")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!row) return;

  const video = row as { course_id: string; title: string };
  const { error } = await supabase
    .from("course_videos")
    .delete()
    .eq("id", parsed.data.id);
  if (error) throw new Error(error.message);

  await writeAudit(profile.id, "course_video_removed", video.course_id, {
    title: video.title,
  });
  revalidateCourse(video.course_id);
}
