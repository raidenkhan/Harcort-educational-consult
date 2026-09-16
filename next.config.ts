import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * The CSP is deliberately explicit rather than maximally strict: Next.js
 * injects inline bootstrap scripts (so `script-src` needs `'unsafe-inline'`
 * unless we move to nonce-based CSP via middleware) and Tailwind/React emit
 * inline `style` attributes (`style-src 'unsafe-inline'`). Everything else is
 * locked to `'self'` — notably `connect-src`, because the browser never talks
 * to Supabase or Resend; all of that is server-side.
 */
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' is Turbopack's dev-time requirement only — never in prod.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  // OAuth is a top-level redirect, not an embed.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Clickjacking: the app must never render inside a frame.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Hide the stack we run on and never ship browser source maps to production.
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // The project lives inside C:\Users\User; without this Next.js walks up to
  // the home directory looking for workspace roots (it finds a stray
  // package-lock.json there), which breaks file discovery such as
  // middleware.ts. Pin both roots to the project directory.
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
