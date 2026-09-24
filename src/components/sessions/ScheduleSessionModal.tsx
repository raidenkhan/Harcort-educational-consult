"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { ScheduleSessionForm } from "./ScheduleSessionForm";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * "Schedule a session" as a popup — tap the button, the form pops in over
 * the page. Behaviour (scroll lock, Escape, focus, backdrop) lives in the
 * shared Modal primitive; this is just trigger + content.
 */
export function ScheduleSessionModal({
  students,
}: {
  students: { id: string; full_name: string }[];
}) {
  const [open, setOpen] = useState(false);

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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule a session"
        description="Pick a student, a time, and a topic — it appears on both timetables immediately."
      >
        <ScheduleSessionForm students={students} />
      </Modal>
    </>
  );
}
