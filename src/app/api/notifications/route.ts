import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/services/auth/queries";
import {
  listNotificationsFor,
  markNotificationsRead,
} from "@/services/notifications/store";

/**
 * /api/notifications — the bell next to the cart.
 *
 *   GET   → { enabled, unread, items } for the signed-in profile
 *   POST  → { id } marks one read; {} marks all read
 *
 * Both are scoped to the session profile on the server; the browser never
 * names whose notifications it wants. `enabled: false` means migration 0042
 * hasn't been applied, and the bell hides itself.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  }
  const data = await listNotificationsFor(profile.id);
  if (!data) {
    return NextResponse.json({ enabled: false, unread: 0, items: [] }, { headers: NO_STORE });
  }
  return NextResponse.json({ enabled: true, ...data }, { headers: NO_STORE });
}

const markSchema = z.object({ id: z.string().uuid().optional() });

export async function POST(request: NextRequest) {
  // Same-origin only: a state change must not be triggerable from another site.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const parsed = markSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  await markNotificationsRead(profile.id, parsed.data.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
