import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

/**
 * The social card for a tutor share link (`/tutors/HC-T-…?course=…`).
 *
 * Why it exists: a link a tutor pastes into WhatsApp used to render as a bare
 * URL. WhatsApp reads Open Graph tags, and an OG image is the difference
 * between a grey link and a card a student actually taps. This renders the
 * tutor's name, the course they shared and the semester price on the brand
 * purple — no photo needed, no per-tutor upload step.
 *
 * Inputs are query params set by the profile's `generateMetadata`, and every
 * one is attacker-controllable (anyone can hit this URL), so they are length-
 * clamped and never rendered as markup — satori treats them as text.
 *
 * Deliberately no database read: the crawler may fetch this seconds after the
 * page, and the page already decided what the card should say. It also keeps
 * the route fast and cacheable (`immutable` — the URL carries the content).
 */

export const runtime = "nodejs";

/** Trim a query value to something that fits the card. */
function clamp(value: string | null, max: number): string {
  if (!value) return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = clamp(searchParams.get("name"), 48) || "Harcourt tutor";
  const course = clamp(searchParams.get("course"), 64);
  const price = clamp(searchParams.get("price"), 32);

  const initial = name.charAt(0).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          // The brand purple, with a lighter bloom top-right so the card does
          // not read as a flat rectangle in a chat list.
          background:
            "radial-gradient(900px 520px at 88% 8%, #8B2FC9 0%, rgba(139,47,201,0) 62%), linear-gradient(135deg, #3D0663 0%, #610B96 52%, #1C0F2B 100%)",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#FFFFFF",
              color: "#610B96",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            H
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
              Harcourt
            </div>
            <div style={{ fontSize: 17, color: "#D1B4EF" }}>
              Educational Consult
            </div>
          </div>
        </div>

        {/* The point of the card: who, which course, how much */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {course ? (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "10px 22px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(209,180,239,0.45)",
                color: "#F3E9FF",
                fontSize: 26,
                fontWeight: 600,
                marginBottom: 26,
              }}
            >
              {course}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 26,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 104,
                height: 104,
                borderRadius: 26,
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.28)",
                fontSize: 52,
                fontWeight: 700,
              }}
            >
              {initial}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                maxWidth: 880,
              }}
            >
              <div
                style={{
                  fontSize: 62,
                  fontWeight: 700,
                  letterSpacing: -2,
                  lineHeight: 1.05,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 28,
                  color: "#D1B4EF",
                }}
              >
                {price
                  ? `Verified tutor · ${price}`
                  : "Verified tutor · KNUST engineering"}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            paddingTop: 24,
            fontSize: 22,
            color: "#D1B4EF",
          }}
        >
          <div style={{ display: "flex" }}>
            Book on Harcourt · payments handled by our team
          </div>
          <div style={{ display: "flex" }}>{SITE_NAME}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // The URL fully describes the image, so a crawler may keep it.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
