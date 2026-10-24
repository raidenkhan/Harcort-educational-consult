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
  const ids = [...searchParams.getAll("sms_id")];
  const statuses = [...searchParams.getAll("status")];

  // Arkesel documents the report as query parameters, but the webhook
  // configured in their dashboard has been seen to POST the same pair as a
  // body (form-encoded or JSON). Read both, so a report is never dropped on
  // the floor just because it arrived in the other shape.
  if (ids.filter(Boolean).length === 0 && request.method === "POST") {
    try {
      const type = request.headers.get("content-type") ?? "";
      if (type.includes("application/json")) {
        const body = (await request.json()) as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null;
        const rows = Array.isArray(body) ? body : body ? [body] : [];
        for (const row of rows) {
          const id = row?.sms_id ?? row?.smsId ?? row?.id;
          const status = row?.status;
          if (typeof id === "string" && id) ids.push(id);
          if (typeof status === "string" && status) statuses.push(status);
        }
      } else if (type.includes("form")) {
        const form = await request.formData();
        ids.push(...form.getAll("sms_id").map(String).filter(Boolean));
        statuses.push(...form.getAll("status").map(String).filter(Boolean));
      }
    } catch {
      // A body we cannot read is not an error — fall through and answer 200
      // so the provider does not retry a report we already handled.
    }
  }

  const cleanIds = ids.filter(Boolean);
  if (cleanIds.length === 0) {
    return NextResponse.json({ received: true, ignored: "no sms_id" });
  }

  const supabase = createAdminClient();
  let updated = 0;

  for (let i = 0; i < cleanIds.length; i++) {
    const smsId = cleanIds[i];
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
