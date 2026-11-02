import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import { Card } from "@/components/ui/Card";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { RoleSwitcher } from "@/components/auth/RoleSwitcher";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { SmsPreferenceForm } from "@/components/auth/SmsPreferenceForm";
import { accraDate } from "@/lib/time";

/**
 * Student dashboard — Settings. Everything about the account rather than
 * anything the student does day to day: how we reach them (phone + SMS
 * opt-out), their program/year, the role switch, and the account facts.
 */
export default async function StudentSettingsPage() {
  const profile = await requireProfile();

  return (
    <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
      {/* Phone (0022) — where session text updates go. Optional for every
          role; an empty value clears the number. The opt-out switch (0027)
          sits with it: the number and the permission to use it are one
          decision. */}
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">
          Phone number &amp; text alerts
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          We text session updates to this number. Optional — add or remove it
          any time, and switch the texts off entirely below.
        </p>
        <div className="mt-3">
          <PhoneForm key={profile.phone ?? "none"} current={profile.phone} />
        </div>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <SmsPreferenceForm optedOut={profile.sms_opt_out ?? false} />
        </div>
      </Card>

      {profile.role === "student" && (
        <RoleSwitcher currentRole={profile.role} />
      )}

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Account</h2>
        <dl className="mt-2 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd className="flex items-center gap-1.5 font-medium capitalize text-slate-900">
              {profile.role}
              {profileIsAdmin(profile) && <VerifiedBadge />}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium text-slate-900">{profile.full_name}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-medium text-slate-900">
              {accraDate(new Date(profile.created_at))}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
