import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireProfile } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import {
  listSessionsForStudent,
  listSessionsForTutor,
  type SessionView,
} from "@/services/sessions/queries";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { SessionCard } from "@/components/sessions/SessionCard";

/** Sessions can be ticked from 15 minutes before their start time. */
const GRACE_MS = 15 * 60 * 1000;

/** Module-level splits so the render stays pure (React Compiler lint). */
function splitStudentTimetable(sessions: SessionView[]) {
  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => new Date(s.scheduled_at).getTime() > now + GRACE_MS,
  );
  const other = sessions.filter((s) => !upcoming.includes(s));
  return { now, upcoming, other };
}

function countTutorUpcoming(sessions: SessionView[]) {
  const now = Date.now();
  return sessions.filter(
    (s) => new Date(s.scheduled_at).getTime() > now + GRACE_MS,
  ).length;
}

const STATUS_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" }
> = {
  pending: { label: "Under review", tone: "amber" },
  approved: { label: "Approved · live to students", tone: "green" },
  rejected: { label: "Not approved", tone: "red" },
};

export default async function DashboardPage() {
  const profile = await requireProfile();

  const [tutor, studentSessions, tutorSessions] = await Promise.all([
    profile.role === "tutor" ? getOwnTutorProfile() : Promise.resolve(null),
    profile.role === "student" ? listSessionsForStudent() : Promise.resolve([]),
    profile.role === "tutor" ? listSessionsForTutor() : Promise.resolve([]),
  ]);

  const studentTimetable =
    profile.role === "student" ? splitStudentTimetable(studentSessions) : null;
  const upcomingSessions = studentTimetable?.upcoming ?? [];
  const otherSessions = studentTimetable?.other ?? [];
  const tutorUpcomingCount =
    profile.role === "tutor" ? countTutorUpcoming(tutorSessions) : 0;

  const roleHeading: Record<string, string> = {
    student: "Find the right tutor for every course.",
    tutor: "Manage how you teach on Harcot.",
    admin: "Run the platform. Approve tutors, review reports.",
  };

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Dashboard
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">
          Welcome, {profile.full_name.split(" ")[0]}.
        </h1>
        <p className="mt-2 max-w-xl text-slate-600">{roleHeading[profile.role]}</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {profile.role === "student" && (
            <Card>
              <h2 className="text-lg font-semibold text-slate-900">Find a tutor</h2>
              <p className="mt-1 text-sm text-slate-600">
                Browse approved tutors by subject and course, then reach out
                when you find the right match.
              </p>
              <Link href="/tutors" className="mt-4 block">
                <Button className="w-full sm:w-auto">Browse tutors</Button>
              </Link>
            </Card>
          )}

          {profile.role === "tutor" && tutor && (
            <Card>
              <h2 className="text-lg font-semibold text-slate-900">
                Your tutor profile
              </h2>
              {tutor.profile ? (
                <p className="mt-1 text-sm text-slate-600">
                  Hourly rate:{" "}
                  <span className="font-semibold text-slate-900">
                    GH₵{tutor.profile.rate_per_hour?.toLocaleString() ?? "—"}
                  </span>{" "}
                  · {tutor.services.length} course(s) offered
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  You haven&apos;t set up your tutor profile yet.
                </p>
              )}
              <div className="mt-3">
                <Badge tone={tutor.profile ? STATUS_BADGE[tutor.profile.verification_status].tone : "neutral"}>
                  {tutor.profile
                    ? STATUS_BADGE[tutor.profile.verification_status].label
                    : "Not started"}
                </Badge>
              </div>
              <Link href="/tutor" className="mt-4 block">
                <Button className="w-full sm:w-auto">
                  {tutor.profile ? "Edit tutor profile" : "Set up tutor profile"}
                </Button>
              </Link>
            </Card>
          )}

          {profile.role === "tutor" && (
            <Card>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Timetable</h2>
                {tutorUpcomingCount > 0 && <Badge tone="amber">{tutorUpcomingCount} upcoming</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Schedule sessions with your students and tick attendance when
                you meet.
              </p>
              <Link href="/tutor#timetable" className="mt-4 block">
                <Button className="w-full sm:w-auto">
                  <CalendarClock className="h-4 w-4" />
                  Open timetable
                </Button>
              </Link>
            </Card>
          )}

          {profile.role === "admin" && (
            <Card>
              <h2 className="text-lg font-semibold text-slate-900">
                Tutor applications
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Review new tutor applications, approve or reject them, and
                keep an eye on attendance.
              </p>
              <Link href="/admin" className="mt-4 block">
                <Button className="w-full sm:w-auto">Open admin console</Button>
              </Link>
            </Card>
          )}

          <Card>
            <h2 className="text-lg font-semibold text-slate-900">Account</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium capitalize text-slate-900">
                  {profile.role}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">{profile.full_name}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Member since</dt>
                <dd className="font-medium text-slate-900">
                  {new Date(profile.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* ── Student timetable ────────────────────────────────────── */}
        {profile.role === "student" && (
          <section className="mt-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                  Your sessions
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
                  Timetable with your tutors
                </h2>
                <p className="mt-1 max-w-xl text-sm text-slate-600">
                  Your tutor schedules sessions here. Tick attendance when you
                  meet — it confirms the session happened on the admin side.
                </p>
              </div>
              {upcomingSessions.length > 0 && (
                <Badge tone="petrol">{upcomingSessions.length} upcoming</Badge>
              )}
            </div>

            {studentSessions.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
                <p className="text-sm text-slate-500">
                  No sessions yet. Find a tutor, start a conversation, and your
                  tutor will schedule sessions here.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {upcomingSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    role="student"
                    now={studentTimetable!.now}
                  />
                ))}
                {otherSessions.length > 0 && (
                  <div className="pt-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Past &amp; in progress
                    </h3>
                    <div className="mt-3 space-y-4">
                      {otherSessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          role="student"
                          now={studentTimetable!.now}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </Container>
    </div>
  );
}
