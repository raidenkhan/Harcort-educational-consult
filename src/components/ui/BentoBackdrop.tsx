import { cn } from "@/lib/cn";

/**
 * Decorative "bento" backdrop for interior pages (admin, tutor, dashboard, …).
 *
 * Pure CSS, pointer-events none, absolutely positioned — drop it as the first
 * child of a `relative overflow-hidden` page wrapper and it sits behind the
 * content. Deliberately soft: no hard-edged squares or dot patterns; just
 * rounded translucent panels with blurred edges, a couple of glow blobs, a
 * whisper of the brand gradient, and faint blueprint grid lines near the top.
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
          panel: "bg-gradient-to-br from-brand-200/45 to-brand-100/5",
          panelAlt: "bg-gradient-to-tr from-amber-100/40 to-brand-100/5",
          grid: "[background-image:linear-gradient(to_right,rgba(120,53,15,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,53,15,0.045)_1px,transparent_1px)]",
          glow: "bg-brand-300/20",
        }
      : {
          panel: "bg-gradient-to-br from-petrol-200/40 to-petrol-100/5",
          panelAlt: "bg-gradient-to-tr from-sky-100/40 to-petrol-100/5",
          grid: "[background-image:linear-gradient(to_right,rgba(10,75,89,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(10,75,89,0.04)_1px,transparent_1px)]",
          glow: "bg-petrol-300/20",
        };

  const panels = [
    "left-[4%] top-24 h-48 w-72 hidden sm:block rotate-[-1.5deg]",
    "right-[6%] top-40 h-40 w-60 rotate-[1.5deg]",
    "left-[16%] top-[26rem] h-32 w-52 hidden lg:block rotate-[1deg]",
    "right-[4%] top-[34rem] h-44 w-64 hidden lg:block rotate-[-1deg]",
  ];

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

      {/* Soft glow blobs */}
      <div
        className={cn(
          "absolute -top-28 right-[-8%] h-80 w-80 rounded-full blur-3xl",
          palette.glow,
        )}
      />
      <div
        className={cn(
          "absolute left-[-10%] top-[36%] h-72 w-72 rounded-full blur-3xl opacity-80",
          palette.panelAlt,
        )}
      />

      {/* Rounded translucent panels — soft, blurred edges, no borders/shadows */}
      {panels.map((panel, i) => (
        <div
          key={i}
          className={cn(
            "absolute rounded-[2.5rem] blur-[2px]",
            i % 2 === 0 ? palette.panel : palette.panelAlt,
            panel,
          )}
        />
      ))}

      {/* Faint blueprint grid lines, only near the top */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[30rem] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black_12%,transparent_55%)]",
          palette.grid,
        )}
      />
    </div>
  );
}
