import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { FloatingNav } from "@/components/navigation/FloatingNav";
import { PayLinkButton } from "@/components/payments/PayLinkButton";
import { accraDate } from "@/lib/time";
import { formatGhs } from "@/lib/money";
import { requireProfile } from "@/services/auth/queries";
import { getPaymentLinkByToken } from "@/services/payments/queries";

/**
 * /pay/[token] — the student's side of an admin-issued part-payment link.
 *
 * The admin opens a plan (an agreement) and sends a one-time URL for a
 * specific amount. The token is the only credential: it is hashed and looked
 * up here, then the page shows the student exactly what they are paying, on
 * which course, and what is left afterwards — before any money moves.
 *
 * Deliberately standalone (not under the (app) shell): the link is opened from
 * WhatsApp or email, often by a student who is not signed in on that device.
 * `requireProfile(next)` bounces them to the auth modal and brings them BACK
 * here once signed in.
 *
 * Everything is server-rendered from the database. The only client part is the
 * pay button, and it sends nothing but the token.
 */

/** Module-level clock read: `react-hooks/purity` forbids `Date.now()` during
 *  render, and the link's expiry check needs one snapshot. */
function nowMs(): number {
  return Date.now();
}

export const metadata = {
  title: "Pay your Harcourt balance",
  description: "Settle part of your Harcourt tuition balance securely.",
  // A payment link is a bearer credential — never let a crawler index one.
  robots: { index: false, follow: false },
};

export default async function PayLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { token } = await params;
  const { payment } = await searchParams;

  const profile = await requireProfile(`/pay/${token}`);

  const link = await getPaymentLinkByToken(token, nowMs());

  const shell = (children: React.ReactNode) => (
    <div className="relative flex flex-1 flex-col">
      <BentoBackdrop tone="purple" className="-z-10" />
      <FloatingNav links={[{ href: "/", label: "Home" }]} showSearch={false}>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-slate-700 transition duration-150 hover:bg-slate-100"
        >
          My dashboard
        </Link>
      </FloatingNav>
      <main className="relative flex flex-1 items-center pb-14 pt-28">
        <Container size="narrow">
          <Card className="mx-auto w-full max-w-lg">
            <div className="mb-4 flex justify-center">
              <BrandMark size="lg" />
            </div>
            {children}
          </Card>
        </Container>
      </main>
    </div>
  );

  // Unknown, malformed or deleted token. Never say which — the token is a
  // credential and guessing must stay cheap for us and useless for an attacker.
  if (!link) {
    return shell(
      <>
        <h1 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">
          This payment link isn&apos;t valid
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          It may have been mistyped or replaced. Message the Harcourt admin team
          on WhatsApp and they&apos;ll send you a fresh one.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Go to my dashboard
        </Link>
      </>,
    );
  }

  // A link is issued to one student. Anyone else must not see its contents.
  if (link.studentId && link.studentId !== profile.id) {
    return shell(
      <>
        <h1 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">
          This link belongs to another student
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          You&apos;re signed in as {profile.full_name}. Sign in with the account
          the link was issued to, or ask the admin team for a link on this
          account.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Go to my dashboard
        </Link>
      </>,
    );
  }

  const settled = link.remainingPesewas <= BigInt(0);

  if (link.status === "paid" || settled) {
    return shell(
      <>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-center font-display text-2xl font-bold tracking-tight text-slate-900">
          {link.status === "paid" ? "This link is already paid" : "Fully paid"}
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          {link.courseTitle || "Your course"} · {formatGhs(link.agreedTotal)}{" "}
          tuition. Nothing is outstanding on this agreement.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Go to my dashboard
        </Link>
      </>,
    );
  }

  if (link.status === "cancelled" || !link.payable) {
    return shell(
      <>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-center font-display text-2xl font-bold tracking-tight text-slate-900">
          {link.status === "cancelled"
            ? "This link was cancelled"
            : "This link has expired"}
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          Ask the Harcourt admin team for a new link — your balance is{" "}
          {formatGhs(link.remainingPesewas)}.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Go to my dashboard
        </Link>
      </>,
    );
  }

  const charge =
    link.amount > link.remainingPesewas ? link.remainingPesewas : link.amount;
  const balanceAfter = link.remainingPesewas - charge;

  return shell(
    <>
      <h1 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">
        Pay {formatGhs(charge)}
      </h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        {link.courseTitle || "Your course"}
        {link.tutorName ? ` · ${link.tutorName}` : ""}
      </p>

      {payment === "return" && (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Paystack has sent you back. We&apos;re confirming the payment —
            this page shows the new balance as soon as it lands (usually a few
            seconds).
          </span>
        </p>
      )}

      <dl className="mt-6 space-y-2.5 border-t border-slate-200 pt-5 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-slate-500">Full semester fee</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {formatGhs(link.agreedTotal)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-slate-500">Already paid</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {formatGhs(link.paidPesewas)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-slate-500">Paying now</dt>
          <dd className="font-semibold tabular-nums text-brand-700">
            {formatGhs(charge)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2.5">
          <dt className="text-slate-500">Balance after this payment</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {formatGhs(balanceAfter)}
          </dd>
        </div>
        {link.expectedFullPaymentAt && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-slate-500">Balance promised by</dt>
            <dd className="font-medium text-slate-900">
              {accraDate(
                new Date(`${link.expectedFullPaymentAt.slice(0, 10)}T00:00:00Z`),
              )}
            </dd>
          </div>
        )}
      </dl>

      {link.note && (
        <p className="mt-4 rounded-md bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          {link.note}
        </p>
      )}

      <PayLinkButton token={token} amountDisplay={formatGhs(charge)} />

      <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
        Paid securely through Paystack. Payments go to Harcourt Educational
        Consult — never send tuition money to a tutor directly.
      </p>
    </>,
  );
}
