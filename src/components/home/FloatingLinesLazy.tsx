"use client";

import dynamic from "next/dynamic";
import type { FloatingLinesProps } from "./FloatingLines";

/**
 * Lazy-loading shell for FloatingLines.
 *
 * three.js is ~600KB minified — statically importing it into the landing
 * bundle delays the first paint of the page users see most. This shell
 * splits it into its own chunk, loaded client-side on idle (ssr: false, so
 * the server never pays for it either). FloatingLines itself already
 * respects prefers-reduced-motion and renders nothing in that case; the
 * AnimatedGradient wash behind it covers the brief load window, so the
 * hero never shows a hole.
 */
const FloatingLines = dynamic(() => import("./FloatingLines"), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

export default function FloatingLinesLazy(props: FloatingLinesProps) {
  return <FloatingLines {...props} />;
}
