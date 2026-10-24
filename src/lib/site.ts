/**
 * Single source of truth for site identity — URL, brand name, description,
 * social links. Every SEO surface (metadata, sitemap, robots, manifest,
 * JSON-LD) imports from here so they can never drift apart.
 *
 * `APP_URL` (from .env.local) is the public origin, e.g. https://harcourt.com.gh.
 *
 * Fallbacks matter in production: `APP_URL` is optional, and a Vercel
 * deployment that never set it would otherwise emit `http://localhost:3000`
 * into every canonical URL, sitemap entry and Open Graph image — which is
 * exactly what WhatsApp's crawler would fetch. Vercel exposes its own
 * production domain, so use that before localhost.
 */

const vercelHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "";

export const SITE_URL =
  process.env.APP_URL?.replace(/\/+$/, "") ||
  (vercelHost
    ? `https://${vercelHost
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")}`
    : "") ||
  "http://localhost:3000";

export const SITE_NAME = "Harcourt Educational Consult";

export const SITE_DESCRIPTION =
  "Academic support built around the courses Ghanaian students actually struggle with — approved tutors for KNUST engineering and free full-length lessons on Harcourt University, our YouTube lesson library.";

/** Loose tagline used for social cards (shorter than the description). */
export const SITE_TAGLINE =
  "Tutors and free lessons for the courses that trip students up";

export const YOUTUBE_URL = "https://www.youtube.com/@harcourt-university";

/** Build an absolute URL from a root-relative path. */
export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
