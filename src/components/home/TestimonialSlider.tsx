"use client";

import Image from "next/image";
import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { AutoCarousel, useCarouselHold } from "./Carousel";
import { TESTIMONIAL_VIDEOS, type TestimonialVideo } from "./testimonialVideos";

/**
 * Student-stories carousel — data lives in ./testimonialVideos (server-safe,
 * so the landing page can read the list too). Add a video there; nothing
 * else needs touching.
 */

/**
 * Click-to-play facade for one testimonial video. Posters come from
 * YouTube's CDN (walked down the size list on 404 — see VideoTestimonial
 * for the full reasoning). The frame aspect is fixed by orientation so a
 * vertical Short never letterboxes into a landscape stage.
 */
function TestimonialFrame({ video }: { video: TestimonialVideo }) {
  const [playing, setPlaying] = useState(false);
  const [posterIndex, setPosterIndex] = useState(0);
  const { onPlayingChange } = useCarouselHold();

  const candidates = [`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`];
  const posterSrc = candidates[posterIndex];

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[2px] border border-petrol-800 bg-petrol-900",
        video.orientation === "short" ? "aspect-[9/16]" : "aspect-video",
      )}
    >
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0&iv_load_policy=3&playsinline=1&color=white`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setPlaying(true);
            onPlayingChange(true);
          }}
          aria-label={video.title}
          className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
        >
          {posterSrc && (
            <Image
              src={posterSrc}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 640px"
              onError={() => setPosterIndex((i) => i + 1)}
              className="object-cover opacity-90 transition-opacity duration-300 [transition-timing-function:var(--ease-out)] group-hover:opacity-100 motion-reduce:transition-none"
            />
          )}
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-petrol-950/70 via-petrol-950/10 to-petrol-950/30"
          />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <span className="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
              <span
                aria-hidden="true"
                className="absolute inset-0 animate-play-pulse rounded-[2px] border-2 border-white/60 motion-reduce:hidden"
              />
              <span className="relative flex h-full w-full items-center justify-center rounded-[2px] border border-white/25 bg-white/95 text-petrol-900 transition duration-200 [transition-timing-function:var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <Play
                  className="h-6 w-6 translate-x-[2px] sm:h-7 sm:w-7"
                  fill="currentColor"
                />
              </span>
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white [text-shadow:0_1px_10px_rgba(21,10,32,0.9)]">
              {video.caption ?? "Watch the story"}
            </span>
          </span>
          {video.duration && (
            <span className="absolute bottom-3 right-3 rounded-[2px] bg-petrol-950/85 px-2 py-1 text-[11px] font-semibold tabular-nums text-white">
              {video.duration}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * The student-stories carousel: dark stage, one slide per video, vertical
 * Shorts displayed in a centred portrait column so they read like a phone
 * screen rather than a cropped video.
 */
export function TestimonialSlider() {
  return (
    <AutoCarousel
      ariaLabel="Student stories"
      intervalMs={8000}
      trackClassName="snap-start"
    >
      {TESTIMONIAL_VIDEOS.map((video) => (
        <div
          key={video.videoId}
          data-carousel-page
          className="min-w-0 shrink-0 grow-0 basis-full snap-start"
        >
          {video.orientation === "short" ? (
            // Vertical Short: portrait column, centred, max-w so it reads
            // as a phone screen on desktop instead of a stretched video.
            <div className="mx-auto w-full max-w-[300px] sm:max-w-[340px]">
              <TestimonialFrame video={video} />
            </div>
          ) : (
            <TestimonialFrame video={video} />
          )}
        </div>
      ))}
    </AutoCarousel>
  );
}
