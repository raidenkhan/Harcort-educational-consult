"use client";

import { useState } from "react";
import { CalendarDays, Columns3, List } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Calendar tabs — switches between the precomputed List / Month / Week views.
 * All three views are rendered server-side and passed in as props; this
 * component only holds the active-tab state (no data fetching, no Date.now()).
 */

type View = "list" | "month" | "week";

const TABS: { id: View; label: string; icon: typeof List }[] = [
  { id: "list", label: "List", icon: List },
  { id: "month", label: "Month", icon: CalendarDays },
  { id: "week", label: "Week", icon: Columns3 },
];

export function CalendarTabs({
  listView,
  month,
  week,
}: {
  listView: ReactNode;
  month: ReactNode;
  week: ReactNode;
}) {
  const [view, setView] = useState<View>("list");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Timetable view"
        className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === id
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {view === "list" && listView}
        {view === "month" && month}
        {view === "week" && week}
      </div>
    </div>
  );
}
