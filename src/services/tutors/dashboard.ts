import "server-only";

import {
  listTutorInbox,
  type TutorRequestView,
} from "@/services/requests/queries";
import { listTutorEngagements, listTutorPayments, type TutorPaymentView } from "@/services/payments/queries";
import {
  listSessionsForTutor,
  type SessionView,
} from "@/services/sessions/queries";
import { splitTimetable } from "@/services/sessions/timetable";
import {
  summarizeEarnings,
  type EarningsSummary,
} from "@/services/payments/summary";
import { listTutorRoster, type RosterEntry } from "./roster";
import type { Profile } from "@/types";

/**
 * The tutor dashboard's one aggregate read.
 *
 * Four domains, one round of parallel queries:
 *   roster      → who the tutor teaches (name, course, payment progress)
 *   sessions    → the next lessons + attendance ticks the tutor still owes
 *   requests    → students waiting for an accept/decline
 *   engagements → money actually collected and what is still owed
 *
 * The page then renders it without further DB work. Editing surfaces (bio,
 * courses, phone) live on `/tutor/settings`, not here.
 */

export interface TutorDashboardData {
  students: RosterEntry[];
  /** Scheduled sessions still ahead, soonest first. */
  upcoming: SessionView[];
  /** Sessions that have started (or are inside the grace window) and still
   *  carry no tutor attendance tick. */
  awaitingTick: SessionView[];
  pendingRequests: TutorRequestView[];
  /** The newest payments — who paid, for what, and when. */
  payments: TutorPaymentView[];
  earnings: EarningsSummary;
}

/** How many payment rows the dashboard shows before the Earnings tab. */
const DASHBOARD_PAYMENT_ROWS = 6;

export async function getTutorDashboard(
  profile: Profile,
): Promise<TutorDashboardData> {
  const [students, sessions, requests, engagements, payments] =
    await Promise.all([
      listTutorRoster(profile),
      listSessionsForTutor(),
      listTutorInbox(profile),
      listTutorEngagements(profile),
      listTutorPayments(profile, DASHBOARD_PAYMENT_ROWS),
    ]);

  // One clock snapshot, off the render path (react-hooks/purity). The split
  // itself is shared with the Timetable tab, so the grace window is identical.
  const { upcoming, awaitingTick } = splitTimetable(sessions, Date.now());

  return {
    students,
    upcoming,
    awaitingTick,
    pendingRequests: requests.filter((request) => request.status === "pending"),
    payments,
    earnings: summarizeEarnings(engagements),
  };
}
