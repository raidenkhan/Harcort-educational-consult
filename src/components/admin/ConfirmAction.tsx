"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

type Result = { error?: string; message?: string };

/**
 * A two-step action button for anything permanent: the first click asks
 * "Are you sure?", the second runs the server action. The result (or error)
 * is reported to the parent so it can show one status line for the list.
 */
export function ConfirmAction({
  label,
  confirmLabel = "Yes, do it",
  tone = "danger",
  disabled,
  title,
  run,
  onResult,
}: {
  label: string;
  confirmLabel?: string;
  tone?: "danger" | "neutral";
  disabled?: boolean;
  /** Tooltip — used to explain why a disabled action is unavailable. */
  title?: string;
  run: () => Promise<Result>;
  onResult: (result: Result) => void;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const base =
    "inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold shadow-xs transition disabled:cursor-not-allowed disabled:opacity-50";

  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled || pending}
        title={title}
        onClick={() => setArmed(true)}
        className={cn(
          base,
          tone === "danger"
            ? "border border-slate-300 bg-white text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await run();
            setArmed(false);
            onResult(result);
            router.refresh();
          })
        }
        className={cn(base, tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "bg-petrol-900 text-white hover:bg-petrol-800")}
      >
        {pending ? "Working…" : confirmLabel}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setArmed(false)}
        className={cn(base, "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50")}
      >
        Cancel
      </button>
    </span>
  );
}

/** One status line for a list of actions. */
export function ActionStatus({ result }: { result: Result | null }) {
  if (!result || (!result.error && !result.message)) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        result.error
          ? "border border-red-200 bg-red-50 text-red-700"
          : "border border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      {result.error ?? result.message}
    </p>
  );
}
