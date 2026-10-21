"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * First-party page-view beacon (0025).
 *
 * One POST per distinct pathname, via `sendBeacon` so a fast navigation can't
 * cancel it. No third-party script, no cookies read in JS (the visitor cookie
 * is httpOnly and set by the collector), and Do-Not-Track is honoured. Admin
 * and API paths are filtered server-side as well.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    if (typeof navigator === "undefined") return;
    if (navigator.doNotTrack === "1") return;

    lastPath.current = pathname;

    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
    });

    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/track", blob)) return;
    }

    // Fallback for browsers without sendBeacon (or a rejected beacon).
    void fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* analytics is best-effort */
    });
  }, [pathname]);

  return null;
}
