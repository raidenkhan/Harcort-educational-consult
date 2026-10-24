"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { tutorSharePath, type ShareableCourse } from "@/services/tutors/share";

/**
 * "Copy the link for THIS course" — the per-course twin of CopyProfileLink.
 *
 * A tutor who teaches ME 255 and ME 355 hands out a different link for each.
 * The student lands on that offering with the price in front of them and the
 * request dialog already set to it, instead of a page listing everything and
 * a picker they have to work out.
 */
export function CopyServiceLink({
  publicCode,
  course,
}: {
  publicCode: string;
  course: ShareableCourse;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${tutorSharePath(publicCode, course)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard permission denied — show the URL so it can be copied by hand.
      window.prompt("Copy this link", url);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 active:scale-[0.98]"
      aria-label={`Copy the share link for ${course.code ?? "this course"}`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Link2 className="h-3 w-3" />
      )}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
