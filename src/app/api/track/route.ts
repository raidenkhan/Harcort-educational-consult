import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/track — the first-party page-view collector (0025).
 *
 * Called by the beacon in the root layout on every client-side navigation.
 * Deliberately dumb and fast: validate the path, derive an opaque visitor
 * hash, insert. It never throws at the caller and always answers 204, because
 * analytics must never be able to break a page.
 *
 * What is NOT stored: IP address, user agent, query string, full referrer
 * URL. The referrer is reduced to its hostname; the visitor id is a random
 * first-party cookie whose hash is all the database ever sees. Admin and API
 * routes are ignored.
 */

const VISITOR_COOKIE = "hc_vid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paths the admin already sees in their own dashboard — not traffic. */
function isTrackable(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/api")) return false;
  return path.length <= 300;
}

function referrerHost(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.slice(0, 120) || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let payload: { path?: unknown; referrer?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const path = typeof payload.path === "string" ? payload.path : "/";
  if (!isTrackable(path)) return new NextResponse(null, { status: 204 });

  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  const visitorId = existing && UUID_RE.test(existing) ? existing : randomUUID();

  const visitorHash = createHash("sha256")
    .update(`${visitorId}:${process.env.ANALYTICS_SALT ?? "harcourt"}`)
    .digest("hex");

  const supabase = createAdminClient();
  const { error } = await supabase.from("page_views").insert({
    path,
    referrer_host: referrerHost(payload.referrer),
    visitor_hash: visitorHash,
  });
  if (error) {
    // Missing table (0025 not applied) or a transient failure — never fatal.
    console.error(`[analytics] page view not recorded: ${error.message}`);
  }

  const response = new NextResponse(null, { status: 204 });
  if (visitorId !== existing) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  }
  return response;
}
