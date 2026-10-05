"use client";

import Image from "next/image";
import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { LESSONS } from "./HarcourtUniversity";
import { AutoCarousel, useCarouselHold } from "./Carousel";

/**
 * LessonSlider — the free-lesson library as one auto-advancing carousel,
 * placed immediately after the subject marquee so the proof ("watch a real
 * problem being solved") is the first thing a visitor meets.
 *
 * Grouping: lessons are paged three-per-view on desktop and one on mobile
 * via CSS scroll-snap (the carousel scrolls natively, so swiping is free).
 * Thumbnails only — the player is requested on click (keeps the page fast:
 * eight YouTube embeds would add ~1MB of player JS nobody asked for).
 */
type Lesson = (typeof LESSONS)[number];

function LessonCard({ lesson }: { lesson: Lesson }) {
  const [playing, setPlaying] = useState(false);
  const { onPlayingChange } = useCarouselHold();

  return (
    <article className="overflow-hidden rounded-[2px] border border-slate-200 bg-white shadow-card">
      <div className="relative aspect-video overflow-hidden bg-petrol-950">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${lesson.id}?autoplay=1&rel=0&iv_load_policy=3&playsinline=1&color=white`}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            // Loading an iframe never sets it back to a poster — acceptable:
            // closing playback isn't part of the UX, navigating away clears it.
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setPlaying(true);
              onPlayingChange(true);
            }}
            aria-label={`Play lesson: ${lesson.title}`}
            className="group absolute inset-0 h-full w-full cursor-pointer"
          >
            <Image
              src={`https://i.ytimg.com/vi/${lesson.id}/hqdefault.jpg`}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover opacity-90 transition duration-300 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.03] group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-petrol-950/70 via-transparent to-petrol-950/20"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-[2px] bg-white/95 text-petrol-900 shadow-lift transition duration-200 [transition-timing-function:var(--ease-out)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" />
              </span>
            </span>
            <span className="absolute bottom-2 right-2 rounded-[2px] bg-petrol-950/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              {lesson.length}
            </span>
          </button>
        )}
      </div>
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">
          {lesson.topic}
        </p>
        <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
          {lesson.title}
        </h3>
      </div>
    </article>
  );
}

/**
 * Chunks LESSONS into carousel pages of `perPage`, responsive without JS:
 * the track is a CSS grid whose columns change at the `lg` breakpoint, and
 * each page is a grid that renders its chunk into 3 (or 1) cells.
 */
export function LessonSlider({ className }: { className?: string }) {
  const pages: Lesson[][] = [];
  for (let i = 0; i < LESSONS.length; i += 3) {
    pages.push(LESSONS.slice(i, i + 3));
  }

  return (
    <AutoCarousel
      ariaLabel="Free lessons from Harcourt University"
      intervalMs={7000}
      className={className}
      trackClassName="snap-start"
    >
      {pages.map((chunk, i) => (
        <div
          key={i}
          data-carousel-page
          className="min-w-0 shrink-0 grow-0 basis-full snap-start"
        >
          {/* 1 card on phones, 3 across from `sm` up (pages of 3). */}
          <div
            className={cn(
              "grid gap-6",
              chunk.length === 1 && "sm:grid-cols-1",
              chunk.length === 2 && "sm:grid-cols-2 lg:grid-cols-3",
              chunk.length === 3 && "sm:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {chunk.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        </div>
      ))}
    </AutoCarousel>
  );
}
