import { AlertTriangle, MessageSquare, Send, Users } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import {
  listRecentSmsMessages,
  smsStats,
  type SmsMessageRow,
} from "@/services/sms/queries";
import { getSmsBalance, isSmsConfigured, smsSandbox } from "@/lib/sms";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SmsTestButton } from "./SmsTestButton";

/**
 * Admin SMS console — what the texting actually did.
 *
 * Sections:
 *   1. Tiles — texts sent today, failures today, numbers on file, opted out.
 *   2. Account — Arkesel balance and the sender ID in use, plus a test text
 *      to the admin's own handset (the fastest proof the whole chain works).
 *   3. The log — every attempt, newest first, with the provider's own
 *      delivery verdict once Arkesel's batched report arrives.
 *
 * Sandbox mode is called out loudly: in sandbox nothing is billed AND
 * nothing is delivered, so a "sent" row means the code ran, not that a
 * handset rang.
 */

const STATUS_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" | "brand" }
> = {
  pending: { label: "Sending", tone: "amber" },
  sent: { label: "Sent", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  skipped: { label: "Skipped", tone: "neutral" },
  unknown: { label: "In flight", tone: "brand" },
};

const KIND_LABEL: Record<string, string> = {
  session_reminder: "Session reminder",
  session_scheduled: "Session scheduled",
  session_cancelled: "Session cancelled",
  request: "New request",
  request_response: "Request answered",
  payment: "Payment received",
  payment_reminder: "Payment reminder",
  reset: "Password reset",
  test: "Test",
};

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Module-level clock snapshot (react-hooks/purity) — read once per render. */
function snapshotNow(): number {
  return Date.now();
}

export async function SmsConsole() {
  await requireRole("admin");

  const [messages, stats, balance] = await Promise.all([
    listRecentSmsMessages(50),
    smsStats(snapshotNow()),
    getSmsBalance(true),
  ]);

  const configured = isSmsConfigured();
  const sandbox = smsSandbox();

  const tiles = [
    {
      label: "Texts sent today",
      value: stats.today,
      icon: Send,
      tint: "bg-brand-50 text-brand-700",
    },
    {
      label: "Failed today",
      value: stats.failedToday,
      icon: AlertTriangle,
      tint: "bg-red-50 text-red-700",
    },
    {
      label: "Numbers on file",
      value: stats.withPhone,
      icon: Users,
      tint: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Opted out",
      value: stats.optedOut,
      icon: MessageSquare,
      tint: "bg-slate-100 text-slate-600",
    },
  ];

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Text messages
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Session reminders, request updates, payment notices and reset codes
            — everything the app texts, and what the provider said about it.
          </p>
        </div>
        {sandbox && (
          <Badge tone="amber">Sandbox — nothing is billed or delivered</Badge>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="flex items-center gap-4">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${tile.tint}`}
            >
              <tile.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold text-slate-900">
                {tile.value}
              </p>
              <p className="truncate text-xs font-medium text-slate-500">
                {tile.label}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h3 className="text-lg font-semibold text-slate-900">
          Arkesel account
        </h3>
        {!configured ? (
          <p className="mt-2 text-sm text-slate-600">
            No <code className="font-mono text-xs">ARKESEL_API_KEY</code> is
            configured, so every text is a silent no-op. Add it to the Vercel
            environment and redeploy.
          </p>
        ) : (
          <>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  SMS credits left
                </dt>
                <dd className="font-display text-lg font-semibold text-slate-900">
                  {balance ? balance.smsBalance : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Main balance
                </dt>
                <dd className="font-display text-lg font-semibold text-slate-900">
                  {balance ? balance.mainBalance || "—" : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Mode
                </dt>
                <dd className="font-display text-lg font-semibold text-slate-900">
                  {sandbox ? "Sandbox" : "Live"}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <SmsTestButton />
            </div>
          </>
        )}
      </Card>

      <div className="mt-6">
        <h3 className="text-lg font-semibold text-slate-900">Recent texts</h3>
        {messages.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
            No texts logged yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {messages.map((message: SmsMessageRow) => {
              const badge = STATUS_BADGE[message.status] ?? {
                label: message.status,
                tone: "neutral" as const,
              };
              return (
                <li key={message.id}>
                  <Card className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {KIND_LABEL[message.kind] ?? message.kind}
                        </span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        {message.deliveryStatus && (
                          <Badge tone="neutral">{message.deliveryStatus}</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{message.body}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {message.toNumber} · {when(message.createdAt)}
                        {message.error ? ` · ${message.error}` : ""}
                      </p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
