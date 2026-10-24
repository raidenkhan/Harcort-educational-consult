import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "@/lib/postgres";
import {
  toTutorListings,
  type TutorListing,
  type TutorProfileRow,
} from "@/services/tutors/listing";
import type { Course, CourseMaterial, CourseVideo } from "@/types";

/** Course queries — the subject taxonomy used for search and service listings,
 *  plus the course library (materials + tutorial videos, see 0017). */

/**
 * Reads degrade to an empty list rather than 500ing a public page — but never
 * SILENTLY: a missing table (migration not applied yet) or a transient error
 * is logged so "nothing attached" can be told apart from "the query is
 * broken". Without the log, a failed query and a genuinely empty table are
 * indistinguishable — which once blanked the landing page's "Browse by course"
 * band with no trace of why.
 */
function logAndEmpty<T>(scope: string, message: string | undefined): T[] {
  if (message) console.error(`[courses] ${scope} failed: ${message}`);
  return [];
}

/**
 * The full subject/course taxonomy. Cached after the first request (5 min
 * TTL); the taxonomy changes rarely, and the tutor schedule form reads it
 * from cache too.
 *
 * 0031: only APPROVED courses. Tutor-added courses are created unpublished
 * and wait for an admin, so the public directory can't be spammed. If the
 * column doesn't exist yet (migration pending) the filter is dropped rather
 * than failing the whole query — the catalog must never go blank.
 */
export const listCourses = unstable_cache(
  async (): Promise<Course[]> => {
    const supabase = createAdminClient();

    const read = (approvedOnly: boolean) => {
      const query = supabase
        .from("courses")
        .select("*")
        .order("subject", { ascending: true })
        .order("name", { ascending: true });
      return approvedOnly ? query.eq("is_approved", true) : query;
    };

    let { data, error } = await read(true);

    if (error && isMissingColumn(error)) {
      console.warn(
        "[courses] courses.is_approved missing — listing unmoderated courses (apply migration 0031).",
      );
      ({ data, error } = await read(false));
    }

    if (error) return logAndEmpty<Course>("listCourses", error.message);
    return (data as Course[]) ?? [];
  },
  ["courses"],
  { revalidate: 300, tags: ["courses"] },
);

/** A tutor-added course awaiting review, with the tutor's name. */
export type PendingCourse = Course & { addedBy: string | null };

/**
 * Courses a tutor added that are waiting for review — the admin queue.
 * Not cached: it is read only by the admin console, where a stale list would
 * mean a tutor waits longer than necessary.
 */
export async function listPendingCourses(): Promise<PendingCourse[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("courses")
    .select("*, profiles(full_name)")
    .eq("is_approved", false)
    .order("created_at", { ascending: true });

  if (error) {
    // Pre-0031 there is no approval flag, so there is nothing to review.
    if (isMissingColumn(error)) return [];
    return logAndEmpty<PendingCourse>("listPendingCourses", error.message);
  }

  return ((data ?? []) as Array<Course & {
    profiles?: { full_name: string } | { full_name: string }[] | null;
  }>).map(({ profiles, ...course }) => ({
    ...course,
    addedBy: (Array.isArray(profiles) ? profiles[0] : profiles)?.full_name ?? null,
  }));
}

export async function searchCourses(query: string): Promise<Course[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("courses")
    .select("*")
    .ilike("name", `%${query}%`)
    .limit(20);

  return (data as Course[]) ?? [];
}

export async function getCourseById(courseId: string): Promise<Course | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();

  return (data as Course) ?? null;
}

export async function listCourseMaterials(
  courseId: string,
): Promise<CourseMaterial[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("course_materials")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (error) return logAndEmpty<CourseMaterial>("listCourseMaterials", error.message);
  return (data as CourseMaterial[]) ?? [];
}

export async function listCourseVideos(
  courseId: string,
): Promise<CourseVideo[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("course_videos")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return logAndEmpty<CourseVideo>("listCourseVideos", error.message);
  return (data as CourseVideo[]) ?? [];
}

/**
 * Approved tutors who offer THIS course.
 *
 * Two steps on purpose: PostgREST can filter an embedded relation, but the
 * returned embed is then narrowed too, which would hide the tutor's other
 * courses. Resolving the tutor ids first and then reusing `toTutorListings`
 * (the mapper behind the production-500 fix) keeps the same shape — and the
 * same null-profile defense — as every other tutor list in the app.
 */
export async function listTutorsForCourse(
  courseId: string,
): Promise<TutorListing[]> {
  const supabase = createAdminClient();

  const { data: serviceRows, error: servicesError } = await supabase
    .from("tutor_services")
    .select("tutor_profile_id")
    .eq("course_id", courseId);
  if (servicesError) {
    return logAndEmpty<TutorListing>("listTutorsForCourse", servicesError.message);
  }

  const ids = Array.from(
    new Set(
      ((serviceRows ?? []) as { tutor_profile_id: string }[]).map(
        (row) => row.tutor_profile_id,
      ),
    ),
  );
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("tutor_profiles")
    .select("*, profiles!inner(*), tutor_services(*, courses(*))")
    .in("id", ids)
    .eq("verification_status", "approved")
    .neq("profiles.role", "student");

  return toTutorListings((data ?? []) as TutorProfileRow[]);
}

/** A material/video row plus the course it belongs to, for the admin console. */
export type CourseAssetWithCourse<T> = T & {
  course_name: string;
  course_subject: string;
};

type AssetJoinRow = {
  courses: { name: string; subject: string } | null;
};

function withCourse<T extends AssetJoinRow>(
  row: T,
): Omit<T, "courses"> & { course_name: string; course_subject: string } {
  const { courses, ...rest } = row;
  return {
    ...rest,
    course_name: courses?.name ?? "",
    course_subject: courses?.subject ?? "",
  };
}

/**
 * Every material and video on the platform, for the admin library console.
 * Volume is small (curated by admins), so the console loads the lot and
 * filters client-side by the selected course — one query, no round trips.
 */
export async function listAllCourseAssets(): Promise<{
  materials: CourseAssetWithCourse<CourseMaterial>[];
  videos: CourseAssetWithCourse<CourseVideo>[];
}> {
  const supabase = createAdminClient();

  const [materialsResult, videosResult] = await Promise.all([
    supabase
      .from("course_materials")
      .select("*, courses(name, subject)")
      .order("created_at", { ascending: false }),
    supabase
      .from("course_videos")
      .select("*, courses(name, subject)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (materialsResult.error) {
    console.error(
      `[courses] listAllCourseAssets (materials) failed: ${materialsResult.error.message}`,
    );
  }
  if (videosResult.error) {
    console.error(
      `[courses] listAllCourseAssets (videos) failed: ${videosResult.error.message}`,
    );
  }

  const materials = (
    (materialsResult.data ?? []) as (CourseMaterial & AssetJoinRow)[]
  ).map(withCourse);
  const videos = (
    (videosResult.data ?? []) as (CourseVideo & AssetJoinRow)[]
  ).map(withCourse);

  return { materials, videos };
}
