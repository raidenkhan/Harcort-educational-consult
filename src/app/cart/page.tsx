import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentProfile } from "@/services/auth/queries";
import { PublicNav } from "@/components/navigation/PublicNav";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { CartView } from "@/components/cart/CartView";

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

  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      <PublicNav profile={profile} />
      <main className="relative flex-1 pt-20 sm:pt-24">
        {/* CartView reads ?paid= with useSearchParams. */}
        <Suspense>
          <CartView signedIn={Boolean(profile)} />
        </Suspense>
      </main>
      {profile && <MobileTabBar role={profile.role} />}
    </div>
  );
}
