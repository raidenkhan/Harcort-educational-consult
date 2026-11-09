import { requireProfile } from "@/services/auth/queries";
import { AccountSettings } from "@/components/auth/AccountSettings";

/**
 * Student dashboard — Settings. Everything about the account rather than
 * anything the student does day to day.
 */
export default async function StudentSettingsPage() {
  const profile = await requireProfile();
  return <AccountSettings profile={profile} className="mt-10" />;
}
