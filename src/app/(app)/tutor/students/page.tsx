import { requireRole } from "@/services/auth/queries";
import { TutorRequestsInbox } from "@/components/payments/TutorRequestsInbox";
import { TutorRoster } from "@/components/payments/TutorRoster";

/**
 * Students tab — the two student-facing surfaces side by side: the request
 * inbox (who wants to work with you) and the roster (who you're working
 * with). No earnings here — that's the Earnings tab's job.
 */
export default async function TutorStudentsPage() {
  await requireRole("tutor");

  return (
    <section className="mt-10 space-y-16">
      <div>
        <div className="max-w-xl text-sm text-slate-600">
          Accepting a request unlocks the student&apos;s payment step and puts
          them on your roster below.
        </div>
        <div className="mt-6">
          <TutorRequestsInbox />
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          My students
        </h2>
        <p className="mt-1 max-w-xl text-sm text-slate-600">
          Everyone you&apos;re working with — payment progress, the topics
          you&apos;ve finished, and your next meetings.
        </p>
        <div className="mt-8">
          <TutorRoster />
        </div>
      </div>
    </section>
  );
}
