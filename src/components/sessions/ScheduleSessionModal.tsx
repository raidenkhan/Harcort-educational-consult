"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, X } from "lucide-react";
import { ScheduleSessionForm } from "./ScheduleSessionForm";
import { Button } from "@/components/ui/Button";

/**
 * "Schedule a session" as a popup instead of an inline section — tap the
 * button, the form pops in over the page (Escape/backdrop closes, body
 * scroll locks). Keeps the tutor page focused on the timetable list.
 */
export function ScheduleSessionModal({
  students,
}: {
  students: { id: string; full_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the panel, close on Escape, lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={students.length === 0}
        className="w-full sm:w-auto"
      >
        <CalendarPlus className="h-4 w-4" />
        Schedule a session
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-session-title"
        >
          {/* backdrop */}
          <div
            className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* panel */}
          <div
            ref={panelRef}
            tabIndex={-1}
            className="relative max-h-[90vh] w-full max-w-md animate-modal-in overflow-y-auto rounded-xl bg-white p-6 shadow-lift focus:outline-none"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[0.95]"
            >
              <X className="h-4 w-4" />
            </button>

            <h2
              id="schedule-session-title"
              className="font-display text-xl font-bold tracking-tight text-slate-900"
            >
              Schedule a session
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pick a student, a time, and a topic — it appears on both
              timetables immediately.
            </p>

            <ScheduleSessionForm students={students} />
          </div>
        </div>
      )}
    </>
  );
}
