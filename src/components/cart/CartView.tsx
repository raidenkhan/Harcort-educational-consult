"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { useCart } from "@/components/cart/CartProvider";
import { startCartCheckout } from "@/services/payments/mutations";
import type { PaymentFormState } from "@/services/payments/mutations";
import { cartLinePesewas, cartLinePrice, cartSubtotalPesewas } from "@/services/cart/cart";
import { sessionModeLabel } from "@/services/auth/sessionFormat";
import { formatGhs } from "@/lib/money";
import { AccountChoiceModal } from "@/components/auth/AccountChoiceModal";
import { checkoutTotal } from "@/services/payments/fees";

/**
 * The cart — turns a localStorage wish list into ONE Paystack charge.
 * Rendered by the PUBLIC `/cart` page (full public navbar), so a signed-out
 * visitor sees their shortlist too; paying is what asks for an account.
 *
 * Every line is re-priced server-side in `prepare_cart_engagement`, so the
 * student cannot invent a price by editing localStorage. The fee config is
 * passed from the server to keep the displayed total in sync with what will
 * actually be charged.
 */
export function CartView({ signedIn }: { signedIn: boolean }) {
  const searchParams = useSearchParams();
  const { lines, remove, clear, disabled } = useCart();
  // Signed out: "Make payment" asks whether they have an account first.
  const [askAccount, setAskAccount] = useState(false);
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    startCartCheckout,
    {},
  );

  // After a successful payment, Paystack redirects back here with ?paid=1.
  // Clear the cart and show a success message.
  // The return route appends payment_status; only "received" means Paystack
  // confirmed the charge and the ledger applied it.
  const justPaid =
    searchParams.get("paid") === "1" &&
    searchParams.get("payment_status") !== "refused" &&
    searchParams.get("payment_status") !== "pending";
  useEffect(() => {
    if (justPaid) {
      clear();
    }
  }, [justPaid, clear]);

  // The action answers with Paystack's hosted checkout page — go there.
  // (Without this the Pay button started a charge and then did nothing.)
  useEffect(() => {
    if (state?.checkoutUrl) window.location.assign(state.checkoutUrl);
  }, [state]);

  // The SAME gross-up the server charges with (0034), so the number on the
  // Pay button is the number Paystack shows.
  const subtotalPesewas = cartSubtotalPesewas(lines);
  const { feePesewas, totalPesewas } = checkoutTotal(subtotalPesewas);

  // Success state after payment
  if (justPaid) {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.01em] text-slate-900">
            Payment successful!
          </h1>
          <p className="mt-2 text-slate-600">
            Your bookings are confirmed. Check your dashboard to see your timetable and meet your study group.
          </p>
          <div className="mt-6">
            <Link href="/dashboard">
              <Button>Go to dashboard</Button>
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  // Admins are staff and never book: no cart for them (the server refuses
  // admin checkouts too).
  if (disabled) {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-2xl text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.01em] text-slate-900">
            Admin accounts can&apos;t book courses
          </h1>
          <p className="mt-2 text-slate-600">
            Booking and paying for courses is for student accounts. Manage
            courses and tutors from the admin console.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/admin">
              <Button>Open the admin console</Button>
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  // Empty cart state
  if (lines.length === 0) {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-2xl text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.01em] text-slate-900">
            Your cart is empty
          </h1>
          <p className="mt-2 text-slate-600">
            Browse tutors or courses to add some. You can pay for everything at once when you&apos;re ready.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/tutors">
              <Button>Browse tutors</Button>
            </Link>
            <Link href="/courses">
              <Button variant="secondary">Browse courses</Button>
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <>
      <BentoBackdrop variant="smooth" tone="purple" className="-z-10" />
      <Container className="py-8 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-slate-900 sm:text-3xl">
              Your cart ({lines.length} course{lines.length === 1 ? "" : "s"})
            </h1>
            <button
              type="button"
              onClick={() => clear()}
              className="text-sm font-medium text-slate-500 hover:text-red-600"
            >
              Clear all
            </button>
          </div>

          {state?.error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <form action={formAction}>
            {/* Hidden input with cart data */}
            <input
              type="hidden"
              name="cartLines"
              value={JSON.stringify(
                lines.map((line) => ({
                  tutorServiceId: line.tutorServiceId,
                  tutorProfileId: line.tutorProfileId,
                  courseId: line.courseId,
                  mode: line.mode,
                  semesters: line.semesters,
                })),
              )}
            />

            <div className="space-y-3">
              {lines.map((line) => {
                const price = cartLinePrice(line);
                const pricePesewas = price !== null ? cartLinePesewas(line) : null;

                return (
                  <div
                    key={line.tutorServiceId}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">
                          {line.courseName}
                        </p>
                        <p className="text-sm text-slate-600">
                          with {line.tutorName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">{sessionModeLabel(line.mode)}</Badge>
                          {line.courseCode && (
                            <span className="text-xs text-slate-500">
                              {line.courseCode}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {pricePesewas !== null ? (
                          <p className="font-display text-lg font-bold text-slate-900">
                            {formatGhs(pricePesewas)}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500">Price on request</p>
                        )}
                        <p className="text-xs text-slate-500">
                          {line.semesters > 1 && price !== null
                            ? `GH₵${price.toLocaleString()} × ${line.semesters} semesters`
                            : "per semester"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(line.tutorServiceId)}
                        className="ml-2 shrink-0 text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${line.courseName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">
                    {formatGhs(subtotalPesewas)}
                  </span>
                </div>
                {feePesewas > BigInt(0) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Processing fee</span>
                    <span className="font-medium text-slate-900">
                      {formatGhs(feePesewas)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatGhs(totalPesewas)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Link href="/tutors" className="flex-1">
                <Button type="button" variant="secondary" className="w-full">
                  Keep browsing
                </Button>
              </Link>
              {signedIn ? (
                <Button
                  type="submit"
                  disabled={pending || lines.length === 0 || Boolean(state?.checkoutUrl)}
                  className="flex-1"
                >
                  <CreditCard className="h-4 w-4" />
                  {pending || state?.checkoutUrl
                    ? "Opening payment…"
                    : `Pay ${formatGhs(totalPesewas)}`}
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => setAskAccount(true)}
                  disabled={lines.length === 0}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  Make payment · {formatGhs(totalPesewas)}
                </button>
              )}
            </div>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Payments go to Harcourt, never to the tutor. One charge covers all
            courses in your cart.
          </p>
        </div>
      </Container>

      <AccountChoiceModal open={askAccount} onClose={() => setAskAccount(false)} next="/cart" />
    </>
  );
}
