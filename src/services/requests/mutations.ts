"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleOutboxDrain } from "@/lib/email/outbox";
import { requireProfile } from "@/services/auth/queries";
import { sendRequestSchema, respondRequestSchema } from "./schemas";

/**
 * Tutor-request mutations — send (student), respond (tutor), withdraw
 * (student). All state changes run through the 0012 RPCs, which verify
 * role, ownership, and request state in Postgres. Notifications enqueue
 * in-transaction and are drained here after the response.
 */

export type RequestFormState = { error?: string; message?: string };

/** Extract the Postgres guard message from a PostgREST error. */
function rpcError(err: { message?: string } | Error | null): string {
  const message = err instanceof Error ? err.message : (err?.message ?? "Request failed");
  const match = message.match(/(forbidden|tutor_not_available|request_not_found|request_not_pending)[^"]*/);
  return match ? match[0] : message;
}

function friendlyError(error: string): string {
  if (error.startsWith("forbidden: students only")) {
    return "Only student accounts can send tutor requests.";
  }
  if (error.startsWith("forbidden: not this request")) {
    return "This request isn't yours to answer.";
  }
  if (error.startsWith("forbidden: not your request")) {
    return "This request isn't yours to withdraw.";
  }
  if (error.startsWith("tutor_not_available")) {
    return "This tutor is no longer taking requests.";
  }
  if (error.startsWith("request_not_pending")) {
    return "This request was already answered.";
  }
  if (error.startsWith("request_not_found")) {
    return "Request not found.";
  }
  return error;
}

/** Student sends a tutoring request. */
export async function sendTutorRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const profile = await requireProfile();

  const parsed = sendRequestSchema.safeParse({
    tutorProfileId: formData.get("tutorProfileId"),
    courseId: formData.get("courseId") ?? undefined,
    message: formData.get("message") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("send_tutor_request", {
    actor_id: profile.id,
    p_tutor_profile_id: parsed.data.tutorProfileId,
    p_course_id: parsed.data.courseId ?? null,
    p_message: parsed.data.message ?? "",
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  scheduleOutboxDrain();
  revalidatePath("/dashboard");
  return {
    message:
      "Request sent. You'll get an email when the tutor accepts — then your Pay 50% button unlocks.",
  };
}

/** Tutor accepts or declines a request. */
export async function respondTutorRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const profile = await requireProfile();

  const parsed = respondRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    accept: formData.get("accept"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("respond_tutor_request", {
    actor_id: profile.id,
    p_request_id: parsed.data.requestId,
    p_accept: parsed.data.accept,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  scheduleOutboxDrain();
  revalidatePath("/tutor");
  revalidatePath("/dashboard");
  return {
    message: parsed.data.accept
      ? "Accepted. The student can now complete their first 50% payment to activate sessions."
      : "Request declined.",
  };
}

/** Student withdraws their own pending request. */
export async function withdrawTutorRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const profile = await requireProfile();

  const requestId = String(formData.get("requestId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    return { error: "Invalid request." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("withdraw_tutor_request", {
    actor_id: profile.id,
    p_request_id: requestId,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  revalidatePath("/dashboard");
  return { message: "Request withdrawn." };
}
