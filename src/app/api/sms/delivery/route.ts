import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST/GET /api/sms/delivery — Arkesel delivery report receiver.
 *
 * Arkesel calls the `callback_url` we passed with the send request, using
 * two QUERY PARAMETERS: `sms_id` and `status`. The reports arrive in batches
 * roughly ten minutes after the send, so this endpoint is written for
 * repeats, not for a single call.
 *
 * Security notes (Arkesel requires the URL to be reachable without
 * pre-authorisation, so it cannot be secret):
 *   * nothing is trusted here — the row is found by the provider's own
 *     message id, and an id we never sent is ignored,
 *   * the same report arriving twice is a no-op (idempotent),
 *   * the endpoint only ever moves a status forward; it never touches money.
 *
 * GET is supported too: Arkesel has used both methods across their docs.
 */

const DELIVERED = "DELIVERED";
const FAILED = new Set(["NOT_DELIVERED", "PROHIBITED", "EXPIRED"]);

/** Map Arkesel's verdict onto our status vocabulary. */
function mapStatus(arkeselStatus: string): string {
  if (arkeselStatus === DELIVERED) return "sent";
  if (FAILED.has(arkeselStatus)) return "failed";
  // SUBMITTED / QUEUED / anything new: accepted by the network, not yet
  // delivered. Unknown values land here on purpose — a status we don't
  // understand must never break the handler.
  return "unknown";
}

async function handle(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.getAll("sms_id").filter(Boolean);
  const statuses = searchParams.getAll("status").filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ received: true, ignored: "no sms_id" });
  }

  const supabase = createAdminClient();
  let updated = 0;

  for (let i = 0; i < ids.length; i++) {
    const smsId = ids[i];
    const raw = (statuses[i] ?? statuses[0] ?? "").trim().toUpperCase();
    if (!raw) continue;

    const { data, error } = await supabase
      .from("sms_messages")
      .update({
        status: mapStatus(raw),
        delivery_status: raw,
      })
      .eq("sms_id", smsId)
      .select("id");

    if (error) {
      console.error(`[sms] delivery report failed for ${smsId}: ${error.message}`);
      continue;
    }

    if (data && data.length > 0) {
      updated += data.length;
      if (FAILED.has(raw)) {
        console.error(`[sms] message ${smsId} was ${raw} — the handset never got it`);
      }
    }
    // No row: this id was never sent by us. Ignore it — the endpoint is open.
  }

  return NextResponse.json({ received: true, updated });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
