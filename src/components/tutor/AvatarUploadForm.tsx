"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import {
  uploadTutorAvatarAction,
  type AvatarFormState,
} from "@/services/tutors/avatar";
import { TutorAvatar } from "@/components/ui/TutorAvatar";
import { Button } from "@/components/ui/Button";

/**
 * Profile-photo uploader on the tutor dashboard (0035).
 *
 * Pick a file → a local preview appears → "Save photo" posts it. The preview
 * uses a blob: URL (allowed by the img-src CSP) and is a plain <img> because
 * `TutorAvatar` deliberately rejects non-bucket URLs (it would show initials
 * over the blob). After save, the action returns the new bucket URL and the
 * avatar swaps to it.
 */
export function AvatarUploadForm({
  name,
  currentUrl,
  onSaved,
}: {
  name: string;
  currentUrl: string | null;
  /** Called once after a successful upload — the parent refreshes so the
   *  read-only profile card picks up the new photo. */
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState<AvatarFormState, FormData>(
    uploadTutorAvatarAction,
    {},
  );
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.message) onSaved?.();
  }, [state?.message, onSaved]);

  const savedUrl = state?.url ?? currentUrl;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-4">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob preview
        <img
          src={preview}
          alt="Preview of your photo"
          className="h-16 w-16 shrink-0 rounded-full object-cover"
        />
      ) : (
        <TutorAvatar name={name} src={savedUrl} size={64} />
      )}

      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          type="file"
          name="avatar"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) setPreview(URL.createObjectURL(selected));
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            {savedUrl ? "Change photo" : "Add a photo"}
          </Button>
          {preview && (
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Save photo"}
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Shown on your tutor card and profile. JPG, PNG or WebP, under 2 MB.
        </p>
        {state?.message && (
          <p className="mt-1 text-sm text-emerald-700">{state.message}</p>
        )}
        {state?.error && <p className="mt-1 text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
