import { requireRole } from "@/services/auth/queries";
import { AccountSettings } from "@/components/auth/AccountSettings";

/**
 * Admin console — Settings: the admin's own phone/SMS preferences and account
 * details. The console is an admin's only dashboard, so their settings live
 * here rather than under /dashboard.
 */
export default async function AdminSettingsPage() {
  const profile = await requireRole("admin");
  return <AccountSettings profile={profile} />;
}
