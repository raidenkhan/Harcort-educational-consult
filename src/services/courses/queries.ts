import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Course } from "@/types";

/** Course queries — the subject taxonomy used for search and service listings. */

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
