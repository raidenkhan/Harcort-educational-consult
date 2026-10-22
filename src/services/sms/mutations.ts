"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/services/auth/queries";
import { sendSms } from "@/lib/sms";

/**
 * Admin SMS actions. The only manual send in the app — everything else is
 * triggered by the system (a request, a session, a payment).
 */

export type SmsActionState = { error?: string; message?: string };

/**
 * Send a test text to the admin's own number — the quickest way to prove the
 * key, the sender ID and the handset all line up.
 *
 * It deliberately ignores the opt-out flag: this is the admin's own number
 * and a deliberate action.
 */
export async function sendTestSmsAction(): Promise<SmsActionState> {
  const admin = await requireRole("admin");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", admin.id)
    .maybeSingle();

  const phone = (data as { phone: string | null } | null)?.phone;
  if (!phone) {
    return {
      error: "Your account has no phone number on file — add one on your dashboard first.",
    };
  }

  const result = await sendSms({
    to: phone,
    message: `Harcourt: test text from the admin console. If you can read this, texting works.`,
    kind: "test",
    profileId: admin.id,
  });

  if (!result.ok) {
    return { error: result.error ?? "The text could not be sent." };
  }

  revalidatePath("/admin/sms");
  return { message: `Test text sent to ${phone}.` };
}
