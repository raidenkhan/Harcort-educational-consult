import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  Eye,
  GraduationCap,
  Percent,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import { getAnalyticsSnapshot } from "@/services/analytics/queries";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatGhs } from "@/lib/money";
import { accraDate } from "@/lib/time";

/**
 * Performance tab — the admin's operating picture.
 *
 * Four questions, in order: is anyone visiting, are they becoming students,
 * is anyone paying, and are tutors actually delivering the sessions they're
 * paid for. Money is shown both directions (collected vs paid out) so the
 * platform's own margin is visible, not implied.
 *
 * Traffic is first-party (0025) — no third-party script, no cookies read in
 * JS. Everything else reads the same tables the rest of the console uses.
 */
export default async function AdminAnalyticsPage() {
  await requireRole("admin");

  const snapshot = await getAnalyticsSnapshot();
  const { traffic, money, funnel, sessions, people, tutors } = snapshot;

  const headline = [
    {
      label: "Collected · all time",
      value: formatGhs(money.collectedAllTime),
      note: `${money.paymentsCount} payment${money.paymentsCount === 1 ? "" : "s"}`,
      icon: ArrowDownLeft,
      tint: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Collected · last 30 days",
      value: formatGhs(money.collected30d),
      note: "verified by Paystack webhook",
      icon: Wallet,
      tint: "bg-brand-50 text-brand-700",
    },
    {
      label: "Paid out to tutors",
      value: formatGhs(money.paidOut),
      note: `${formatGhs(money.owedToTutors)} still owed`,
      icon: ArrowUpRight,
      tint: "bg-petrol-50 text-petrol-700",
    },
    {
      label: "Platform fees",
      value: formatGhs(money.platformFees),
      note: "10% of each agreement",
      icon: Percent,
      tint: "bg-amber-50 text-amber-700",
    },
    {
      label: "Outstanding from students",
      value: formatGhs(money.outstandingFromStudents),
      note: "pending + overdue installments",
      icon: TrendingUp,
      tint: "bg-red-50 text-red-700",
    },
    {
      label: "Visitors · last 30 days",
      value: String(traffic.visitors30d),
      note: `${traffic.views30d} page views`,
      icon: Eye,
      tint: "bg-slate-100 text-slate-700",
    },
  ];

  const maxViews = Math.max(1, ...traffic.byDay.map((d) => d.views));
  const maxCollected = money.byDay.reduce(
    (max, day) => (day.collected > max ? day.collected : max),
    BigInt(0),
  );

  return (
    <>
      {/* ── Headline numbers ─────────────────────────────────────── */}
      <section className="mt-8" aria-label="Headline numbers">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {headline.map((stat) => (
            <Card key={stat.label} className="flex items-start gap-4">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${stat.tint}`}
              >
                <stat.icon className="h-5 w-5" />
                <span className="sr-only">{stat.label}</span>
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl font-bold tabular-nums text-slate-900">
                  {stat.value}
                </p>
                <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{stat.note}</p>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Snapshot taken {accraDate(new Date(snapshot.generatedAt))} · reload for
          live figures.
        </p>
      </section>

      {/* ── Money in / out ───────────────────────────────────────── */}
      <section className="mt-14" aria-label="Money">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
              Money
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Payments in, tutor payouts out, and what is still owed on each
              side. Only webhook-verified payments count as collected.
            </p>
          </div>
          <Badge tone="green">Paystack reconciled</Badge>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-slate-900">
              Collected — last 14 days
            </h3>
            <ul className="mt-4 space-y-2">
              {money.byDay.map((day) => (
                <li key={day.day} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 font-mono text-[11px] text-slate-500">
                    {day.day.slice(5)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-emerald-500/80"
                      style={{
                        width: `${moneyBarWidth(day.collected, maxCollected)}%`,
                      }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-600">
                    {day.collected > BigInt(0) ? formatGhs(day.collected) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-900">Balance sheet</h3>
            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              {[
                ["Collected from students", formatGhs(money.collectedAllTime)],
                ["Paid out to tutors", formatGhs(money.paidOut)],
                ["Queued for payout", formatGhs(money.owedToTutors)],
                ["Platform fees booked", formatGhs(money.platformFees)],
                ["Average payment", formatGhs(money.averagePayment)],
                ["Outstanding from students", formatGhs(money.outstandingFromStudents)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-md bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
              {funnel.engagements.live} active agreement
              {funnel.engagements.live === 1 ? "" : "s"} ·{" "}
              {funnel.engagements.awaitingPayment} awaiting first payment ·{" "}
              {funnel.engagements.completed} completed
            </div>
          </Card>
        </div>
      </section>

      {/* ── Requests → sessions ──────────────────────────────────── */}
      <section className="mt-14" aria-label="Requests and sessions">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Demand &amp; delivery
        </h2>
        <p className="mt-1 max-w-xl text-sm text-slate-600">
          Where students stall between asking for a tutor and actually being
          tutored — and whether the sessions that got paid for were held.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <TrendingUp className="h-3.5 w-3.5" /> Requests
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
              {funnel.requests}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {funnel.pending} pending · {funnel.accepted} accepted ·{" "}
              {funnel.declined} declined
            </p>
          </Card>
          <Card>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Percent className="h-3.5 w-3.5" /> Acceptance rate
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
              {funnel.acceptanceRate}%
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {funnel.avgResponseHours === null
                ? "No tutor has responded yet"
                : `Tutors answer in ~${funnel.avgResponseHours}h`}
            </p>
          </Card>
          <Card>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <CalendarCheck className="h-3.5 w-3.5" /> Sessions
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
              {sessions.confirmed}
              <span className="text-base font-semibold text-slate-400">
                {" "}
                / {sessions.scheduled}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {sessions.upcoming} upcoming · {sessions.cancelled} cancelled
            </p>
          </Card>
          <Card>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <CalendarCheck className="h-3.5 w-3.5" /> Attendance confirmed
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
              {sessions.completionRate}%
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Both tutor and student ticked the session
            </p>
          </Card>
        </div>
      </section>

      {/* ── Site traffic ─────────────────────────────────────────── */}
      <section className="mt-14" aria-label="Site traffic">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
              Site traffic
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              First-party counts, recorded by the site itself. No third-party
              tracker, no IP addresses, no query strings. Admin pages excluded.
            </p>
          </div>
          <Badge tone="neutral">First-party</Badge>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs font-medium text-slate-500">Today</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
              {traffic.viewsToday}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              views · {traffic.visitorsToday} visitor
              {traffic.visitorsToday === 1 ? "" : "s"}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-slate-500">Last 7 days</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
              {traffic.views7d}
            </p>
            <p className="mt-1 text-xs text-slate-500">page views</p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-slate-500">Last 30 days</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
              {traffic.views30d}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {traffic.visitors30d} unique visitor
              {traffic.visitors30d === 1 ? "" : "s"}
            </p>
          </Card>
        </div>

        {traffic.views30d === 0 && (
          <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-500">
            Nothing recorded yet. Views start appearing as people browse — if
            this stays at zero after real traffic, apply migration 0025.
          </p>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-slate-900">
              Views — last 14 days
            </h3>
            <ul className="mt-4 space-y-2">
              {traffic.byDay.map((day) => (
                <li key={day.day} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 font-mono text-[11px] text-slate-500">
                    {day.day.slice(5)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-brand-500/80"
                      style={{
                        width: `${Math.max(
                          2,
                          Math.round((day.views / maxViews) * 100),
                        )}%`,
                      }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-600">
                    {day.views} · {day.visitors}u
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-slate-900">Top pages</h3>
              {traffic.topPages.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No views yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {traffic.topPages.map((page) => (
                    <li
                      key={page.path}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="truncate font-mono text-xs text-slate-700">
                        {page.path}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        {page.views} · {page.share}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-slate-900">Referrers</h3>
              {traffic.topReferrers.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No external referrers yet — most visits are direct.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {traffic.topReferrers.map((referrer) => (
                    <li
                      key={referrer.host}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="truncate text-slate-700">{referrer.host}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        {referrer.views}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </section>

      {/* ── People & tutors ──────────────────────────────────────── */}
      <section className="mt-14 pb-4" aria-label="People and tutor performance">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          People
        </h2>
        <p className="mt-1 max-w-xl text-sm text-slate-600">
          Who is on the platform, and which tutors are actually running the
          sessions they get paid for.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-brand-700" />
            <div>
              <p className="font-display text-xl font-bold tabular-nums text-slate-900">
                {people.students}
              </p>
              <p className="text-xs text-slate-500">
                students · {people.newStudents30d} new in 30d
              </p>
            </div>
          </Card>
          <Card className="flex items-center gap-3">
            <Users className="h-5 w-5 text-petrol-700" />
            <div>
              <p className="font-display text-xl font-bold tabular-nums text-slate-900">
                {people.tutors}
              </p>
              <p className="text-xs text-slate-500">
                tutors · {people.newTutors30d} new in 30d
              </p>
            </div>
          </Card>
          <Card className="flex items-center gap-3">
            <Users className="h-5 w-5 text-amber-700" />
            <div>
              <p className="font-display text-xl font-bold tabular-nums text-slate-900">
                {people.admins}
              </p>
              <p className="text-xs text-slate-500">admin accounts</p>
            </div>
          </Card>
        </div>

        <Card className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900">
            Tutor performance
          </h3>
          {tutors.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No sessions scheduled yet.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pr-3 font-medium">Tutor</th>
                    <th className="py-2 pr-3 text-right font-medium">Sessions</th>
                    <th className="py-2 pr-3 text-right font-medium">Confirmed</th>
                    <th className="py-2 text-right font-medium">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tutors.map((tutor) => (
                    <tr key={tutor.name}>
                      <td className="py-2.5 pr-3 text-slate-800">{tutor.name}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">
                        {tutor.sessions}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">
                        {tutor.confirmedSessions}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-800">
                        {formatGhs(tutor.earnings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </>
  );
}

/** 0–100 bar width for a bigint amount against the window's maximum. */
function moneyBarWidth(value: bigint, max: bigint): number {
  if (max <= BigInt(0)) return 0;
  return Math.max(2, Math.round((Number(value) / Number(max)) * 100));
}
