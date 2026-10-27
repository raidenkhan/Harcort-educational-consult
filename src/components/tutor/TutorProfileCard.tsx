"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TutorAvatar } from "@/components/ui/TutorAvatar";
import { TutorProfileForm } from "./TutorProfileForm";
import { AvatarUploadForm } from "./AvatarUploadForm";
import type { TutorStatus } from "@/types";

/**
 * The tutor's own profile, shown READ-ONLY on the Settings tab — avatar, name,
 * verification badge, bio and qualifications, exactly how a student would see
 * the facts. Nothing here is editable inline: "Edit profile" opens a modal
 * with the photo uploader and the bio/qualifications form, so the nice view
 * is never a form until the tutor deliberately chooses to edit it.
 */
export function TutorProfileCard({
  name,
  avatarUrl,
  status,
  bio,
  qualifications,
}: {
  name: string;
  avatarUrl: string | null;
  status: TutorStatus | null;
  bio: string | null;
  qualifications: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  // After the bio/qualifications save: close the modal AND refresh, so the
  // server re-reads the profile and the read-only view shows the new copy.
  const closeAndRefresh = useCallback(() => {
    setEditing(false);
    router.refresh();
  }, [router]);

  // After a photo-only save: refresh in place (keep the modal open so they can
  // still edit the bio), the read-only avatar picks up the new URL.
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <TutorAvatar name={name} src={avatarUrl} size={64} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">
              {name}
            </span>
            {status === "approved" && (
              <Badge tone="green">
                <ShieldCheck className="h-3 w-3" />
                Verified tutor
              </Badge>
            )}
          </p>
          {bio ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{bio}</p>
          ) : (
            <p className="mt-2 text-sm italic text-slate-400">
              No bio yet — add one so students know who you are.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-4 w-4" />
          Edit profile
        </Button>
      </div>

      {qualifications && (
        <div className="mt-4 rounded-md bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Qualifications
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-700">
            {qualifications}
          </p>
        </div>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit profile"
        description="Your photo, bio and qualifications — what students see on your card and profile."
      >
        <div className="mt-5 space-y-6">
          <AvatarUploadForm name={name} currentUrl={avatarUrl} onSaved={refresh} />
          <div className="border-t border-slate-100 pt-5">
            <TutorProfileForm
              initial={{ bio: bio ?? "", qualifications: qualifications ?? "" }}
              onSaved={closeAndRefresh}
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
}
