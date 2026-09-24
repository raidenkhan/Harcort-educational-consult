import { Users, UserCheck } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import {
  listApprovedTutorsForAdmin,
  listPendingTutors,
} from "@/services/admin/queries";
import { approveTutor, rejectTutor } from "@/services/admin/mutations";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Fields";

/** Overview tab — platform stats plus tutor application review. */
export default async function AdminPage() {
  await requireRole("admin");

  const [pending, approvedCount] = await Promise.all([
    listPendingTutors(),
    listApprovedTutorsForAdmin(),
  ]);

  const stats = [
    { label: "Pending applications", value: pending.length, icon: Users, tint: "bg-amber-50 text-amber-700" },
    { label: "Approved tutors", value: approvedCount, icon: UserCheck, tint: "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <>
      {/* ── Bento stat row ───────────────────────────────────────── */}
      <div className="mt-8 grid gap-4 grid-cols-2 lg:grid-cols-2">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex items-center gap-4">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${stat.tint}`}
            >
              <stat.icon className="h-5 w-5" />
              <span className="sr-only">{stat.label}</span>
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold text-slate-900">
                {stat.value}
              </p>
              <p className="truncate text-xs font-medium text-slate-500">
                {stat.label}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Tutor applications ───────────────────────────────────── */}
      <section className="mt-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
            Tutor applications
          </h2>
          <div className="flex gap-2">
            <Badge tone="amber">{pending.length} pending</Badge>
            <Badge tone="green">{approvedCount} approved</Badge>
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
            <p className="text-sm text-slate-500">
              No pending applications. New tutor sign-ups will appear here for
              review.
            </p>
        </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {pending.map((tutor) => (
              <li key={tutor.id}>
                <Card className="flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-0 max-w-xl flex-1">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {tutor.full_name || "Unnamed tutor"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {tutor.public_code && (
                        <span
                          className="mr-2 font-mono text-xs text-slate-400"
                          title="Harcourt tracking code — quote this in support conversations"
                        >
                          {tutor.public_code}
                        </span>
                      )}
                      Applied {new Date(tutor.created_at).toLocaleDateString()} ·{" "}
                      {tutor.rate_per_hour != null
                        ? `GH₵${tutor.rate_per_hour.toLocaleString()}/hr`
                        : "No rate set"}
                    </p>
                    {tutor.bio && (
                      <p className="mt-3 text-sm leading-relaxed text-slate-600">
                        {tutor.bio}
                      </p>
                    )}
                  </div>

                  <div className="w-full max-w-xs space-y-3 sm:w-72">
                    <form action={approveTutor} className="space-y-2">
                      <input
                        type="hidden"
                        name="tutorProfileId"
                        value={tutor.id}
                      />
                      <Input
                        name="note"
                        type="text"
                        placeholder="Note (optional, shown to tutor)"
                      />
                      <button
                        type="submit"
                        className="h-10 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700"
                      >
                        Approve tutor
                      </button>
                    </form>
                    <form action={rejectTutor} className="space-y-2">
                      <input
                        type="hidden"
                        name="tutorProfileId"
                        value={tutor.id}
                      />
                      <Input
                        name="note"
                        type="text"
                        required
                        placeholder="Reason for rejection (required)"
                        className="focus:border-red-400 focus:ring-red-100"
                      />
                      <button
                        type="submit"
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        Reject tutor
                      </button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
