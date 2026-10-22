"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleOutboxDrain } from "@/lib/email/outbox";
import { notifyNewMessage } from "@/lib/email/notify";
import { notifySmsToProfiles } from "@/lib/sms";
import { formatGhs } from "@/lib/money";
import { requireProfile } from "@/services/auth/queries";
import { normalizeSessionMode } from "@/services/auth/sessionFormat";
import {
  paymentPlanRequestSchema,
  sendRequestSchema,
  respondRequestSchema,
} from "./schemas";

/**
 * Tutor-request mutations — send (student), respond (tutor), withdraw
 * (student). All state changes run through the 0012 RPCs, which verify
 * role, ownership, and request state in Postgres. Notifications enqueue
 * in-transaction and are drained here after the response.
 */

/** The paywall shown the moment a request is sent (0024 flow). */
export interface RequestPaywall {
  requestId: string;
  tutorServiceId: string;
  courseName: string;
  tutorName: string;
  /** The tutor's full quote for the course, in pesewas. */
  totalPesewas: number;
  /** The first 50% — what the student must pay to activate sessions. */
  duePesewas: number;
}

export type RequestFormState = {
  error?: string;
  message?: string;
  paywall?: RequestPaywall;
};

/** A student's in-site request for a payment plan (paywall fallback). */
export type PaymentPlanFormState = {
  error?: string;
  message?: string;
  conversationId?: string;
};

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
    sessionMode: formData.get("sessionMode") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const supabase = createAdminClient();

  // The session format is chosen HERE, for THIS request only (0024). It is
  // never written to the profile: the same student may want group sessions
  // with one tutor and one-on-one with another.
  const sessionMode = normalizeSessionMode(parsed.data.sessionMode);
  let request: { data: unknown; error: { message?: string } | null } = await supabase.rpc(
    "send_tutor_request",
    {
      actor_id: profile.id,
      p_tutor_profile_id: parsed.data.tutorProfileId,
      p_course_id: parsed.data.courseId ?? null,
      p_message: parsed.data.message ?? "",
      p_session_mode: sessionMode,
    },
  );

  // Fail-safe for a database that hasn't applied 0024 yet: the request itself
  // must never fail because the format parameter is unknown. The request is
  // sent with the DB default and the log says why.
  if (request.error && /send_tutor_request|p_session_mode/i.test(request.error.message ?? "")) {
    console.error(
      "[requests] send_tutor_request(p_session_mode) unavailable — apply migration 0024.",
    );
    request = await supabase.rpc("send_tutor_request", {
      actor_id: profile.id,
      p_tutor_profile_id: parsed.data.tutorProfileId,
      p_course_id: parsed.data.courseId ?? null,
      p_message: parsed.data.message ?? "",
    });
  }
  if (request.error) return { error: friendlyError(rpcError(request.error)) };

  const requestId = typeof request.data === "string" ? request.data : null;

  // send_tutor_request is idempotent: an existing pending request is returned
  // untouched. The dialog is the only place the format is asked, so make the
  // picker authoritative for that request (non-fatal if 0024 isn't applied).
  if (requestId) {
    const { error: modeError } = await supabase.rpc("update_tutor_request_session", {
      actor_id: profile.id,
      p_request_id: requestId,
      p_session_mode: sessionMode,
    });
    if (modeError) {
      console.error(`[requests] session_mode not saved: ${modeError.message}`);
    }
  }

  // Resolve the paywall from the request row that actually exists — never
  // from the form input. send_tutor_request is idempotent, so re-requesting a
  // tutor returns the earlier pending request, possibly for a different
  // course; the amount shown must match that row, because it becomes a real
  // money agreement.
  const paywall = await resolvePaywall(supabase, requestId);

  // Text the tutor: a new request is the one thing a tutor must not miss,
  // and most of them won't open their email between classes. Best-effort.
  const contact = await resolveRequestContact(supabase, requestId);
  if (contact?.tutorProfileId) {
    notifySmsToProfiles(
      [contact.tutorProfileId],
      `Harcourt: ${profile.full_name || "A student"} wants to book ${contact.courseName}. Open the app to respond.`,
      "request",
    );
  }

  scheduleOutboxDrain();
  revalidatePath("/dashboard");
  revalidatePath("/tutor", "layout");
  return {
    message: paywall
      ? "Request sent. Complete the first 50% below to activate your sessions."
      : "Request sent. You'll get an email when the tutor accepts — your payment button unlocks then.",
    paywall: paywall ?? undefined,
  };
}

/**
 * Who a request concerns — the two people who may need to be told about it,
 * and what it's about. Resolved from the REQUEST ROW (never from the form),
 * so the text always matches the request that actually exists.
 */
async function resolveRequestContact(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string | null,
): Promise<{
  studentId: string;
  tutorProfileId: string;
  courseName: string;
  tutorName: string;
} | null> {
  if (!requestId) return null;

  const { data } = await supabase
    .from("tutor_requests")
    .select(
      "id, student_id, course_id, tutor_profile_id, courses(name), tutor_profiles(profile_id, profiles(full_name))",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as {
    student_id: string;
    course_id: string | null;
    tutor_profile_id: string;
    courses?: { name?: string } | { name?: string }[] | null;
    tutor_profiles?:
      | {
          profile_id?: string;
          profiles?: { full_name?: string } | { full_name?: string }[] | null;
        }
      | Array<{
          profile_id?: string;
          profiles?: { full_name?: string } | { full_name?: string }[] | null;
        }>
      | null;
  };

  const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
  const tp = Array.isArray(row.tutor_profiles)
    ? row.tutor_profiles[0]
    : row.tutor_profiles;
  const names = tp?.profiles;
  const tutor = Array.isArray(names) ? names[0] : names;

  return {
    studentId: row.student_id,
    tutorProfileId: tp?.profile_id ?? "",
    courseName: course?.name ?? "your course",
    tutorName: tutor?.full_name ?? "your tutor",
  };
}

/**
 * Resolve the amount and labels for a request's paywall. Returns null when the
 * tutor hasn't quoted this course (no price to charge) — the UI then explains
 * that payment unlocks once a price exists instead of inventing an amount.
 */
async function resolvePaywall(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string | null,
): Promise<RequestPaywall | null> {
  if (!requestId) return null;

  const { data: requestRow } = await supabase
    .from("tutor_requests")
    .select("course_id, tutor_profile_id")
    .eq("id", requestId)
    .maybeSingle();
  const request = requestRow as
    | { course_id: string | null; tutor_profile_id: string }
    | null;
  if (!request?.course_id) return null;

  const { data } = await supabase
    .from("tutor_services")
    .select("id, price, courses(name), tutor_profiles(profiles(full_name))")
    .eq("tutor_profile_id", request.tutor_profile_id)
    .eq("course_id", request.course_id)
    .maybeSingle();
  if (!data) return null;

  const row = data as {
    id: string;
    price: unknown;
    courses?: { name: string } | { name: string }[] | null;
    tutor_profiles?:
      | { profiles?: { full_name: string } | { full_name: string }[] | null }
      | Array<{ profiles?: { full_name: string } | { full_name: string }[] | null }>
      | null;
  };
  const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
  const tp = Array.isArray(row.tutor_profiles) ? row.tutor_profiles[0] : row.tutor_profiles;
  const names = tp?.profiles;
  const tutor = Array.isArray(names) ? names[0] : names;

  const totalPesewas = Math.round(Number(row.price ?? 0) * 100);
  if (totalPesewas <= 0) return null;

  return {
    requestId,
    tutorServiceId: row.id,
    courseName: course?.name ?? "your course",
    tutorName: tutor?.full_name ?? "your tutor",
    totalPesewas,
    duePesewas: Math.floor(totalPesewas / 2),
  };
}

/**
 * Paywall fallback: the student can't pay the first 50% in full and asks the
 * admin team, from the site, for a payment plan. Creates (or re-enters) the
 * student's admin conversation and posts the context — the admin replies in
 * /chat, exactly like any other admin thread.
 */
export async function requestPaymentPlan(
  _prev: PaymentPlanFormState,
  formData: FormData,
): Promise<PaymentPlanFormState> {
  const profile = await requireProfile();
  if (profile.role !== "student") {
    return { error: "Only student accounts can request a payment plan." };
  }

  const parsed = paymentPlanRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const supabase = createAdminClient();

  const { data: requestRow } = await supabase
    .from("tutor_requests")
    .select(
      `id, student_id, course_id, status,
       courses(name),
       tutor_profiles(id, profiles(full_name), tutor_services(price, course_id))`,
    )
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  if (!requestRow) return { error: "Request not found." };
  const request = requestRow as unknown as {
    id: string;
    student_id: string;
    course_id: string | null;
    status: string;
    courses?: { name: string } | { name: string }[] | null;        tutor_profiles?:
      | {
          id: string;
          profiles?: { full_name: string } | { full_name: string }[] | null;
          tutor_services?: Array<{ price: unknown; course_id: string }> | null;
        }
      | Array<{
          id: string;
          profiles?: { full_name: string } | { full_name: string }[] | null;
          tutor_services?: Array<{ price: unknown; course_id: string }> | null;
        }>
      | null;
  };
  if (request.student_id !== profile.id) {
    return { error: "This request isn't yours." };
  }

  // One admin inbox owns these threads. `is_admin` first (0008), legacy role
  // as a fallback for accounts created before the flag existed.
  let adminId: string | null = null;
  const { data: admin } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_admin", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  adminId = (admin as { id: string } | null)?.id ?? null;
  if (!adminId) {
    const { data: legacy } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    adminId = (legacy as { id: string } | null)?.id ?? null;
  }
  if (!adminId) {
    return { error: "No admin account is available right now — please try WhatsApp." };
  }

  // Reuse this student's admin thread if it exists (0007 dedupe index).
  let conversationId: string | null = null;
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("admin_id", adminId)
    .eq("student_id", profile.id)
    .maybeSingle();
  conversationId = (existing as { id: string } | null)?.id ?? null;

  if (!conversationId) {
    const { data: inserted, error } = await supabase
      .from("conversations")
      .insert({ admin_id: adminId, student_id: profile.id })
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        const { data: reopened } = await supabase
          .from("conversations")
          .select("id")
          .eq("admin_id", adminId)
          .eq("student_id", profile.id)
          .maybeSingle();
        conversationId = (reopened as { id: string } | null)?.id ?? null;
      }
      if (!conversationId) return { error: "Could not open a chat with the admin team." };
    } else {
      conversationId = (inserted as { id: string } | null)?.id ?? null;
    }
  }
  if (!conversationId) return { error: "Could not open a chat with the admin team." };

  const course = Array.isArray(request.courses) ? request.courses[0] : request.courses;
  const tp = Array.isArray(request.tutor_profiles)
    ? request.tutor_profiles[0]
    : request.tutor_profiles;
  const tutorNames = tp?.profiles;
  const tutor = Array.isArray(tutorNames) ? tutorNames[0] : tutorNames;
  const service = tp?.tutor_services?.find(
    (s: { price: unknown; course_id: string }) => s.course_id === request.course_id,
  );
  const totalPesewas = service ? Math.round(Number(service.price ?? 0) * 100) : 0;
  const due = totalPesewas > 0 ? Math.floor(totalPesewas / 2) : null;

  const lines = [
    "Payment plan request — I can't pay the first 50% in full right now.",
    course?.name ? `Course: ${course.name}` : null,
    tutor?.full_name ? `Tutor: ${tutor.full_name}` : null,
    due !== null ? `First payment due: ${formatGhs(BigInt(due))}` : null,
    `Student code: ${profile.public_code ?? profile.id.slice(0, 8)}`,
    parsed.data.note ? `Note: ${parsed.data.note}` : null,
  ].filter((line): line is string => Boolean(line));
  const body = lines.join("\n");

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: profile.id,
    body,
  });
  if (messageError) return { error: messageError.message };

  notifyNewMessage({
    recipientProfileIds: [adminId],
    senderName: profile.full_name || "A student",
    body,
    conversationId,
  });

  revalidatePath("/chat");
  revalidatePath("/dashboard");
  return {
    message: "Sent to the Harcourt admin team — continue in Chat to agree a plan.",
    conversationId,
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

  // Text the student the verdict — accepted means they can now pay the first
  // 50%, declined means they should stop waiting for it.
  const contact = await resolveRequestContact(
    supabase,
    parsed.data.requestId,
  );
  if (contact) {
    notifySmsToProfiles(
      [contact.studentId],
      parsed.data.accept
        ? `Harcourt: ${contact.tutorName} accepted your request for ${contact.courseName}. Open the app to pay and schedule.`
        : `Harcourt: ${contact.tutorName} declined your request for ${contact.courseName}.`,
      "request_response",
    );
  }

  scheduleOutboxDrain();
  revalidatePath("/tutor", "layout");
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
