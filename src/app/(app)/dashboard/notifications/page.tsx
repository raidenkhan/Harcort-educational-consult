import { requireProfile } from "@/services/auth/queries";
import { listNotificationsFor } from "@/services/notifications/store";
import { NotificationList } from "@/components/notifications/NotificationList";

/** Module-level clock snapshot (react-hooks/purity). */
function nowSnapshot(): number {
  return Date.now();
}

/**
 * Dashboard → Notifications: the full history behind the bell (the bell's
 * panel shows the latest 20; this shows up to 100), with mark-all-read.
 */
export default async function DashboardNotificationsPage() {
  const profile = await requireProfile();
  const feed = await listNotificationsFor(profile.id, 100);

  if (!feed) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
        Notifications aren&apos;t available yet.
      </div>
    );
  }

  return <NotificationList items={feed.items} unread={feed.unread} now={nowSnapshot()} />;
}
