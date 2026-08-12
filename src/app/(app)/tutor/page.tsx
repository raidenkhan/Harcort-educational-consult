import { requireRole } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import { listCourses } from "@/services/courses/queries";
import {
  listSessionsForTutor,
  listTutorStudents,
  type SessionView,
} from "@/services/sessions/queries";
import { TutorProfileForm } from "@/components/tutor/TutorProfileForm";
import { TutorServiceForm } from "@/components/tutor/TutorServiceForm";
import { SessionCard } from "@/components/sessions/SessionCard";
import { ScheduleSessionModal } from "@/components/sessions/ScheduleSessionModal";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import type { TutorService } from "@/types";

/** Sessions can be ticked from 15 minutes before their start time. */
const GRACE_MS = 15 * 60 * 1000;

/**
 * Split the timetable into upcoming vs past/in-progress and count pending
 * ticks. Module-level so the render stays pure (React Compiler lint).
 */
function splitTimetable(sessions: SessionView[]) {
  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => new Date(s.scheduled_at).getTime() > now + GRACE_MS,
  );
  const past = sessions
    .filter((s) => !upcoming.includes(s))
    .reverse(); // most recent first
  // Only sessions that are due/ended and still unticked by me — upcoming
  // ones haven't started, so they aren't "awaiting" anything yet.
  const awaitingTick = sessions.filter(
    (s) =>
      !s.tutor_confirmed_at &&
      new Date(s.scheduled_at).getTime() <= now + GRACE_MS,
  ).length;
  return { now, upcoming, past, awaitingTick };
}

export default async function TutorPage() {
  await requireRole("tutor");

  const [tutor, courses, sessions, students] = await Promise.all([
    getOwnTutorProfile(),
    listCourses(),
    listSessionsForTutor(),
    listTutorStudents(),
  ]);

  const isApproved = tutor.profile?.verification_status === "approved";
  const { now, upcoming, past, awaitingTick } = splitTimetable(sessions);

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="purple" />
      <Container className="py-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          For tutors
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">
          Your tutor profile
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Tell students who you are, what you teach, and what you charge. Your
          profile stays hidden until our team approves it.
        </p>

        {tutor.profile && (
          <div className="mt-4">
            <Badge
              tone={
                tutor.profile.verification_status === "approved"
                  ? "green"
                  : tutor.profile.verification_status === "rejected"
                    ? "red"
                    : "amber"
              }
            >
              {tutor.profile.verification_status === "approved"
                ? "Approved — visible to students"
                : tutor.profile.verification_status === "rejected"
                  ? "Not approved — see admin note"
                  : "Under review"}
            </Badge>
            {tutor.profile.admin_notes && (
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-semibold">Admin note:</span>{" "}
                {tutor.profile.admin_notes}
              </p>
            )}
          </div>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <Card>
            <h2 className="text-lg font-semibold text-slate-900">About you</h2>
            <TutorProfileForm
              initial={{
                bio: tutor.profile?.bio ?? "",
                qualifications: tutor.profile?.qualifications ?? "",
                ratePerHour: tutor.profile?.rate_per_hour?.toString() ?? "",
              }}
            />
          </Card>

          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold text-slate-900">
                Courses you teach
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Add the courses you&apos;re willing to tutor, with your price
                per hour.
              </p>
              <TutorServiceForm courses={courses} />
            </Card>

            <Card>
              <h2 className="text-lg font-semibold text-slate-900">
                Your services
              </h2>
              {tutor.services.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  No courses added yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {tutor.services.map((service: TutorService) => (
                    <li
                      key={service.id}
                      className="flex items-center justify-between py-2.5 text-sm"
                    >
                      <span className="font-medium text-slate-800">
                        {courseName(courses, service.course_id)}
                      </span>
                      <span className="font-semibold text-slate-900">
                        GH₵{service.price.toLocaleString()}
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          /hr
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        {/* ── Timetable ────────────────────────────────────────────── */}
        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                Timetable
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
                Sessions with your students
              </h2>
              <p className="mt-1 max-w-xl text-sm text-slate-600">
                Schedule meetings, then both you and the student tick
                attendance when you meet — the admin sees both ticks, so your
                work is verifiable.
              </p>
            </div>
            <div className="flex gap-2">
              <Badge tone="amber">{upcoming.length} upcoming</Badge>
              {awaitingTick > 0 && (
                <Badge tone="neutral">{awaitingTick} awaiting your tick</Badge>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              {upcoming.length === 0 && past.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
                  <p className="text-sm text-slate-500">
                    No sessions yet. Once students contact you, schedule your
                    first meeting with “Schedule a session”.
                  </p>
                </div>
              ) : (
                <>
                  {upcoming.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      role="tutor"
                      now={now}
                    />
                  ))}

                  {past.length > 0 && (
                    <div className="pt-6">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        Past &amp; in progress
                      </h3>
                      <div className="mt-3 space-y-4">
                        {past.map((session) => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            role="tutor"
                            now={now}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <Card className="lg:sticky lg:top-24">
                <h3 className="text-lg font-semibold text-slate-900">
                  Schedule a session
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Pick a student, a time, and a topic — it appears on both
                  timetables immediately.
                </p>
                {isApproved ? (
                  <>
                    <div className="mt-4">
                      <ScheduleSessionModal students={students} />
                    </div>
                    {students.length === 0 && (
                      <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-sm text-slate-500">
                        Students who contact you through Harcourt will appear
                        here, ready to be scheduled.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                    Your timetable unlocks once your tutor profile is approved.
                  </p>
                )}
              </Card>
            </div>
          </div>
        </section>
      </Container>
    </div>
  );
}

function courseName(courses: { id: string; name: string }[], courseId: string) {
  return courses.find((c) => c.id === courseId)?.name ?? "Unknown course";
}
