/**
 * Post-auth redirect targets.
 *
 * Why this exists: a payment link (`/pay/<token>`) is a URL a signed-out
 * student may open on a new device. Bouncing them to sign-in is fine, but
 * dropping where they were going is not — they land on the dashboard with no
 * way back to the link. The sign-in/sign-up actions therefore accept a `next`
 * form field.
 *
 * `next` is attacker-controllable (it arrives in a URL and is echoed into a
 * form), so it is validated here rather than trusted: only a same-site
 * absolute PATH is allowed. `//evil.com` and `https://evil.com` are both
 * rejected — an open redirect after login is a phishing primitive that lends
 * the real site's domain to an attacker.
 */

/** A same-site path, or null when the value is not safe to redirect to. */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path) return null;

  // Must be a path, not an absolute or protocol-relative URL.
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  // Backslashes are normalized to "/" by some browsers — `/\evil.com` would
  // become `//evil.com`.
  if (path.includes("\\")) return null;
  // Control characters can smuggle a second header/location.
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;

  return path.slice(0, 300);
}
