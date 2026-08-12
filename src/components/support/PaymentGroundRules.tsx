import { CheckCircle2, ShieldCheck } from "lucide-react";
import { ADMIN_WHATSAPP_URL } from "@/lib/config";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";

/**
 * Student-facing payment ground rules + admin contact.
 *
 * Policy: students make and discuss payments ONLY with Harcourt admins — never
 * with tutors. Shown as a prominent card on the student dashboard and a
 * compact banner at the top of /chat (where payment talk would happen).
 *
 * The WhatsApp CTA renders only when NEXT_PUBLIC_ADMIN_WHATSAPP is set in
 * .env.local (see src/lib/config.ts).
 */

const RULES = [
  "All payments and payment discussions go through Harcourt admins only.",
  "If a tutor ever asks you to pay them, stop the conversation and contact an admin.",
  "Never share card, bank, or mobile-money details with a tutor.",
  "Fees, refunds and disputes are handled by the admin team.",
];

/** Official WhatsApp glyph (Simple Icons) — lucide has no brand icons. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function WhatsAppCta({ compact = false }: { compact?: boolean }) {
  // Number not configured yet — banner just carries the reminder; the card
  // shows a muted placeholder so it doesn't look broken.
  if (!ADMIN_WHATSAPP_URL) {
    if (compact) return null;
    return (
      <span className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-400">
        <WhatsAppIcon className="h-4 w-4" />
        Admin WhatsApp contact coming soon
      </span>
    );
  }
  return (
    <a
      href={ADMIN_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-emerald-600 font-semibold text-white shadow-xs transition duration-150 hover:bg-emerald-700 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        compact ? "h-9 px-3.5 text-xs" : "h-10 px-4 text-sm",
      )}
    >
      <WhatsAppIcon className="h-4 w-4" />
      {compact ? "Contact admin" : "Contact an admin on WhatsApp"}
    </a>
  );
}

export function PaymentGroundRules({
  variant = "card",
  audience = "student",
  className,
}: {
  variant?: "card" | "banner";
  audience?: "student" | "tutor";
  className?: string;
}) {
  // ── Compact banner (chat page) ─────────────────────────────────────
  if (variant === "banner") {
    const message =
      audience === "tutor"
        ? "you never collect fees or discuss payments with students — direct them to a Harcourt admin."
        : "only Harcourt admins handle payments — tutors never collect fees.";
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
      >
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-sm leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">
              Payment reminder:
            </span>{" "}
            {message}
          </p>
        </div>
        <WhatsAppCta compact />
      </div>
    );
  }

  // ── Full card (student dashboard) ──────────────────────────────────
  return (
    <Card className={cn("border-amber-200 bg-amber-50/70", className)}>
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100">
          <ShieldCheck className="h-5 w-5 text-amber-700" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-900">
            Payments go through Harcourt — never to tutors
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Every payment and payment discussion happens with a Harcourt admin.
            Tutors never collect fees — this keeps you safe and every
            transaction tracked.
          </p>
          <ul className="mt-4 space-y-2.5">
            {RULES.map((rule) => (
              <li
                key={rule}
                className="flex items-start gap-2 text-sm leading-relaxed text-slate-700"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <WhatsAppCta />
          </div>
        </div>
      </div>
    </Card>
  );
}
