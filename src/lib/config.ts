/**
 * Site-wide configuration read from environment.
 *
 * NEXT_PUBLIC_* values are inlined at build time — restart the dev server
 * after changing .env.local.
 */

/**
 * Admin WhatsApp number for the student "Contact admin" button.
 * International format, digits only, no "+" or spaces (e.g. 233201234567).
 * Set NEXT_PUBLIC_ADMIN_WHATSAPP in .env.local; leave empty to hide the
 * WhatsApp CTA until the number is configured.
 */
const ADMIN_WHATSAPP_RAW = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ?? "";

const adminWhatsappNumber = ADMIN_WHATSAPP_RAW.replace(/[^0-9]/g, "");

/** Tap-to-chat link (null until the number is configured). */
export const ADMIN_WHATSAPP_URL = adminWhatsappNumber
  ? `https://wa.me/${adminWhatsappNumber}?text=${encodeURIComponent(
      "Hi Harcot Educational Consult! I have a question about payments.",
    )}`
  : null;
