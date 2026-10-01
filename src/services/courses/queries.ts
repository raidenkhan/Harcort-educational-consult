import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  toTutorListings,
  type TutorListing,
  type TutorProfileRow,
} from "@/services/tutors/listing";
import type { Course, CourseMaterial, CourseVideo } from "@/types";

/** Course queries — the subject taxonomy used for search and service listings,
 *  plus the course library (materials + tutorial videos, see 0017). */

/**
 * The full subject/course taxonomy. Cached after the first request (5 min
 * TTL); the taxonomy changes rarely, and the tutor schedule form reads it
 * from cache too.
 */
export const listCourses = unstable_cache(
  async (): Promise<Course[]> => {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from("courses")
      .select("*")
      .order("subject", { ascending: true })
      .order("name", { ascending: true });

    return (data as Course[]) ?? [];
  },
  ["courses"],
  { revalidate: 300, tags: ["courses"] },
);

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

/**
 * Library reads degrade to an empty list rather than 500ing the public page —
 * but never SILENTLY: a missing table (migration 0017 not applied yet) or a
 * transient error is logged so "nothing attached" can be told apart from
 * "the query is broken".
 */
function logAndEmpty<T>(scope: string, message: string | undefined): T[] {
  if (message) console.error(`[courses] ${scope} failed: ${message}`);
  return [];
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
