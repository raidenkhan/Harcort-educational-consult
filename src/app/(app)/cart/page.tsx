"use client";

import { useActionState, useEffect } from "react";
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
import { cartLinePrice, cartSubtotalPesewas } from "@/services/cart/cart";
import { sessionModeLabel } from "@/services/auth/sessionFormat";
import { formatGhs } from "@/lib/money";
import { paystackFeeConfig } from "@/services/payments/fees";

/**
 * The cart page — turns a localStorage wish list into ONE Paystack charge.
 *
 * Every line is re-priced server-side in `prepare_cart_engagement`, so the
 * student cannot invent a price by editing localStorage. The fee config is
 * passed from the server to keep the displayed total in sync with what will
 * actually be charged.
 */
export default function CartPage() {
  const searchParams = useSearchParams();
  const { lines, remove, clear, ready } = useCart();
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    startCartCheckout,
    {},
  );

  // Fee config from the server (0034). This ensures the displayed total matches
  // what the server will gross up.
  const feeConfig = paystackFeeConfig();

  // After a successful payment, Paystack redirects back here with ?paid=1.
  // Clear the cart and show a success message.
  const justPaid = searchParams.get("paid") === "1";
  useEffect(() => {
    if (justPaid) {
      clear();
    }
  }, [justPaid, clear]);

  // Compute totals
  const subtotalPesewas = cartSubtotalPesewas(lines);
  const subtotalCedis = Number(subtotalPesewas) / 100;

  // Apply the same fee logic as checkoutTotal
  let feePesewas = BigInt(0);
  if (feeConfig.percent > 0) {
    const percentFee = Math.ceil((subtotalCedis * feeConfig.percent) / 100);
    feePesewas += BigInt(Math.round(percentFee * 100));
  }
  if (feeConfig.fixedPesewas > 0) {
    feePesewas += BigInt(feeConfig.fixedPesewas);
  }
  if (feeConfig.capPesewas !== null && feePesewas > BigInt(feeConfig.capPesewas)) {
    feePesewas = BigInt(feeConfig.capPesewas);
  }

  const totalPesewas = subtotalPesewas + feePesewas;

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
                })),
              )}
            />

            <div className="space-y-3">
              {lines.map((line) => {
                const price = cartLinePrice(line);
                const pricePesewas = price !== null ? BigInt(Math.round(price * 100)) : null;

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
                        <p className="text-xs text-slate-500">per semester</p>
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
              <Button
                type="submit"
                disabled={pending || lines.length === 0}
                className="flex-1"
              >
                <CreditCard className="h-4 w-4" />
                {pending ? "Starting checkout…" : `Pay ${formatGhs(totalPesewas)}`}
              </Button>
            </div>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Payments go to Harcourt, never to the tutor. One charge covers all
            courses in your cart.
          </p>
        </div>
      </Container>
    </>
  );
}
