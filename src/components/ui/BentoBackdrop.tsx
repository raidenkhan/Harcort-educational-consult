import { cn } from "@/lib/cn";

/**
 * Decorative page backdrop (dashboard, tutor, admin, /tutors, …).
 *
 * Pure CSS, pointer-events none, absolutely positioned — drop it as the first
 * child of a `relative overflow-hidden` page wrapper and it sits behind the
 * content. Shape-free by design: no tiles, panels, or grid lines — just a
 * whisper of the brand gradient and a couple of blurred glow blobs.
 */
export function BentoBackdrop({
  tone = "petrol",
  className,
}: {
  tone?: "amber" | "petrol";
  className?: string;
}) {
  const palette =
    tone === "amber"
      ? {
          glow: "bg-brand-300/20",
          glowAlt: "bg-amber-200/40",
        }
      : {
          glow: "bg-petrol-300/20",
          glowAlt: "bg-sky-200/40",
        };

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {/* Brand gradient art, washed out to a whisper */}
      <div
        className="absolute inset-x-0 top-0 h-96 opacity-[0.06] [mask-image:linear-gradient(to_bottom,black_15%,transparent)]"
        style={{
          backgroundImage: "url(/gradback.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }}
      />

      {/* Soft glow blobs — blurred, no edges */}
      <div
        className={cn(
          "absolute -top-28 right-[-8%] h-80 w-80 rounded-full blur-3xl",
          palette.glow,
        )}
      />
      <div
        className={cn(
          "absolute left-[-10%] top-[36%] h-72 w-72 rounded-full blur-3xl opacity-80",
          palette.glowAlt,
        )}
      />
      <div
        className={cn(
          "absolute bottom-[-10%] left-[45%] h-80 w-96 rounded-full blur-3xl opacity-60",
          palette.glow,
        )}
      />
    </div>
  );
}
