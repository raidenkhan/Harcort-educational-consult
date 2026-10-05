"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * AutoCarousel — a paged carousel that advances itself.
 *
 * Why build instead of a library: the two usages on this page need very
 * different slide widths (full-width lesson pages; landscape + vertical
 * testimonial frames). A headless pager keeps every slide a plain child.
 *
 * Behavior:
 *  - Auto-advances every `intervalMs` while the section is on screen, the
 *    tab is visible, the pointer is elsewhere, and no video is playing.
 *  - Manual navigation (arrows, dots, swipe) resets the timer — a user who
 *    takes control isn't yanked away mid-read.
 *  - Scrolls one page per tick (a track of flex items translated by
 *    `scrollTo`, so touch swiping comes free from native scrolling).
 *  - Reduced motion: no auto-advance at all; arrows and dots still work.
 *
 * Purity note: the tick uses a ref-based callback so the interval is set
 * exactly once (React Compiler lint forbids re-creating it per render).
 */
export function AutoCarousel({
  children,
  className,
  trackClassName,
  ariaLabel,
  intervalMs = 6000,
}: {
  /** One child per page. Each child must accept `data-carousel-page`. */
  children: ReactNode[];
  className?: string;
  trackClassName?: string;
  ariaLabel: string;
  intervalMs?: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState(children.length);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const playingVideos = useRef(0);
  const listeners = useRef(new Set<(delta: 1 | -1) => void>());

  /** A slide calls this when an inline video starts/stops playing. */
  const setPlaying = useCallback((playing: boolean) => {
    playingVideos.current += playing ? 1 : -1;
    if (playingVideos.current < 0) playingVideos.current = 0;
  }, []);

  const hold = useMemo(
    () => ({ setPlaying }),
    [setPlaying],
  );

  /** Re-count pages after mount — children can render conditionally. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const count = track.querySelectorAll("[data-carousel-page]").length;
    setPageCount(count || children.length);
  }, [children.length]);

  const goTo = useCallback((index: number, manual = false) => {
    const track = trackRef.current;
    if (!track) return;
    const pages = Array.from(
      track.querySelectorAll<HTMLElement>("[data-carousel-page]"),
    );
    if (pages.length === 0) return;
    const next = ((index % pages.length) + pages.length) % pages.length;
    track.scrollTo({ left: pages[next].offsetLeft, behavior: "smooth" });
    setActive(next);
    if (manual) {
      listeners.current.forEach((fn) => fn(1));
    }
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      goTo(active + dir);
    },
    [goTo, active],
  );

  /** Auto-advance: only while visible, tab shown, not hovered, no video. */
  useEffect(() => {
    if (pageCount < 2 || paused) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let visible = true;

    const tick = () => {
      if (visible && document.visibilityState === "visible" && playingVideos.current === 0) {
        goTo(active + 1);
      }
    };
    const timer = setInterval(tick, intervalMs);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    if (trackRef.current) observer.observe(trackRef.current);

    return () => {
      if (timer) clearInterval(timer);
      observer.disconnect();
    };
  }, [active, paused, pageCount, goTo, intervalMs]);

  /** Track the active page on manual scroll (swipe). */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const pages = Array.from(
          track.querySelectorAll<HTMLElement>("[data-carousel-page]"),
        );
        const centre = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        pages.forEach((p, i) => {
          const c = p.offsetLeft + p.offsetWidth / 2;
          const d = Math.abs(c - centre);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        setActive(best);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className={className}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        role="group"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        className={cn(
          "flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          trackClassName,
        )}
      >
        <CarouselHoldContext.Provider value={hold}>
          {children}
        </CarouselHoldContext.Provider>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-xs transition hover:border-slate-300 hover:text-slate-900 active:scale-[0.96]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2" role="tablist" aria-label={ariaLabel}>
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-300",
                  i === active
                    ? "w-6 bg-brand-600"
                    : "w-1.5 bg-slate-300 hover:bg-slate-400",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-xs transition hover:border-slate-300 hover:text-slate-900 active:scale-[0.96]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Wiring for slides that contain inline players: a playing video calls
 * `useCarouselHold()` and reports `true`/`false`, and the carousel pauses
 * auto-advance while any slide is playing.
 */
const CarouselHoldContext = createContext<{
  setPlaying: (playing: boolean) => void;
} | null>(null);

export function useCarouselHold() {
  const ctx = useContext(CarouselHoldContext);
  return {
    onPlayingChange: (playing: boolean) => ctx?.setPlaying(playing),
  };
}
