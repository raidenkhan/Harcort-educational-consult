import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentProfile } from "@/services/auth/queries";
import { PublicNav } from "@/components/navigation/PublicNav";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { CartView } from "@/components/cart/CartView";
import { listStudentBookings } from "@/services/payments/queries";
import { semestersLabel } from "@/services/payments/bookings";
import { profileIsAdmin } from "@/lib/auth/admin";

export const metadata: Metadata = {
  title: "Your cart",
  description: "Courses you've shortlisted — pay for them all in one charge.",
  robots: { index: false },
};

/**
 * /cart — a PUBLIC page. It used to live inside the signed-in app shell,
 * which gave a signed-out visitor the app's header (Sign out, Dashboard) and
 * no public links. The cart works signed out (localStorage), so the page uses
 * the same navbar as every other public page; only paying asks for sign-in.
 */
export default async function CartPage() {
  const profile = await getCurrentProfile();

  // Booked-but-unpaid agreements live in the cart until they're paid; a few
  // paid ones are listed below them (students only — admins never book).
  const bookings =
    profile && profile.role === "student" && !profileIsAdmin(profile)
      ? await listStudentBookings(profile)
      : [];
  const label = (b: (typeof bookings)[number]) => [b.courseCode, b.courseName].filter(Boolean).join(" ");
  const detail = (b: (typeof bookings)[number]) =>
    [semestersLabel(b.semesters), b.sessionMode === "group" ? "Group" : b.sessionMode === "one_on_one" ? "One-on-one" : null]
      .filter(Boolean)
      .join(" · ");
  const pendingBookings = bookings
    .filter((b) => b.status === "pending_payment" && b.agreedTotal - b.paidPesewas > BigInt(0))
    .map((b) => ({
      id: b.id,
      courseLabel: label(b),
      tutorName: b.tutorName,
      detail: detail(b),
      owedPesewas: (b.agreedTotal - b.paidPesewas).toString(),
    }));
  const paidBookings = bookings
    .filter((b) => b.status === "active" || b.status === "completed")
    .slice(0, 5)
    .map((b) => ({
      id: b.id,
      courseLabel: label(b),
      tutorName: b.tutorName,
      detail: detail(b),
      amountPesewas: b.agreedTotal.toString(),
      status: b.status as "active" | "completed",
    }));

  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      {/* Signed in, the cart is part of the dashboard: no landing-side links
          (Courses / Find a tutor / Video Lessons) — the logo goes back there. */}
      <PublicNav profile={profile} showLinks={!profile} />
      <main className="relative flex-1 pt-20 sm:pt-24">
        {/* CartView reads ?paid= with useSearchParams. */}
        <Suspense>
          <CartView
            signedIn={Boolean(profile)}
            pendingBookings={pendingBookings}
            paidBookings={paidBookings}
          />
        </Suspense>
      </main>
      {profile && <MobileTabBar role={profile.role} />}
    </div>
  );
}
