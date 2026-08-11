import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Only session-relevant routes — keeps the middleware off static assets.
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/tutor/:path*",
    "/chat/:path*",
    "/sign-in",
    "/sign-up",
  ],
};
