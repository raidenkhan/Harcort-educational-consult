"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";

/**
 * The tutor's shareable profile link (/tutors/HC-T-…), with a copy button —
 * the "send this to students" surface (0031). Copying uses the clipboard API
 * with a select-and-copy fallback for browsers that deny the permission.
 */
export function CopyProfileLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/tutors/${encodeURIComponent(code)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard permission denied — select the text so a manual Ctrl+C works.
      const input = document.getElementById("profile-link") as HTMLInputElement | null;
      input?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-3 flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="profile-link"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 font-mono text-xs text-slate-600 shadow-xs outline-none focus:border-slate-400"
        />
      </div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3.5 text-sm font-semibold text-white shadow-xs transition hover:bg-slate-800 active:scale-[0.98]"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            Copy link
          </>
        )}
      </button>
    </div>
  );
}
