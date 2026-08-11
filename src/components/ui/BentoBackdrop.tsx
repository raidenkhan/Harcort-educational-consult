import { cn } from "@/lib/cn";

/**
 * Decorative "bento grid" backdrop for interior pages (admin, tutor, …).
 *
 * Pure CSS, pointer-events none, absolutely positioned — drop it as the first
 * child of a `relative overflow-hidden` page wrapper and it sits behind the
 * content. Subtle by design: tiles are faint borders + tints, plus the brand
 * gradient (public/gradback.jpg) washed to near-transparency at the top.
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
          tile: "border-brand-200/70 bg-brand-50/40",
          tileFill: "bg-brand-100/50",
          dot: "bg-brand-300/30",
          grid: "[background-image:linear-gradient(to_right,rgba(120,53,15,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,53,15,0.055)_1px,transparent_1px)]",
          glow: "bg-brand-300/25",
        }
      : {
          tile: "border-petrol-200/60 bg-petrol-50/35",
          tileFill: "bg-petrol-100/45",
          dot: "bg-petrol-300/30",
          grid: "[background-image:linear-gradient(to_right,rgba(10,75,89,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(10,75,89,0.05)_1px,transparent_1px)]",
          glow: "bg-petrol-300/20",
        };

  const tiles = [
    "left-[3%] top-24 h-44 w-60 hidden sm:block",
    "right-[4%] top-36 h-32 w-52",
    "left-[12%] top-[24rem] h-28 w-48 hidden sm:block",
    "right-[10%] top-[30rem] h-40 w-56",
    "left-[2%] top-[40rem] h-24 w-40 hidden lg:block",
    "right-[3%] top-[46rem] h-32 w-44 hidden lg:block",
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
        className="absolute inset-x-0 top-0 h-96 opacity-[0.07] [mask-image:linear-gradient(to_bottom,black_15%,transparent)]"
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
          palette.tileFill,
        )}
      />

      {/* Blueprint grid lines, strongest at the top */}
      <div
        className={cn(
          "absolute inset-0 [background-size:44px_44px] [mask-image:radial-gradient(ellipse_80%_65%_at_50%_0%,black,transparent_82%)]",
          palette.grid,
        )}
      />

      {/* Scattered bento tiles */}
      {tiles.map((tile, i) => (
        <div
          key={i}
          className={cn("absolute rounded-2xl border", palette.tile, tile)}
        >
          {/* Tiny spec dots on a couple of tiles, like a blueprint */}
          {i % 2 === 0 && (
            <div
              className={cn(
                "absolute inset-0 [background-image:radial-gradient(transparent_1.5px,currentColor_1.5px)] [background-size:12px_12px] opacity-20",
                palette.dot,
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
