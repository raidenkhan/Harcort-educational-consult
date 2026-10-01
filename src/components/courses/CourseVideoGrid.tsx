"use client";

import Image from "next/image";
import { useState } from "react";
import { Play } from "lucide-react";

/**
 * CourseVideoGrid — the tutorial videos attached to one course.
 *
 * Click-to-play on purpose: embedding every player up front would ship a
 * YouTube player per video for content most visitors never open. Thumbnails
 * only, and the iframe is requested when a student actually presses play
 * (same reasoning as LessonSlider on the landing page).
 *
 * YouTube is the only provider today; other providers would need their own
 * embed branch here and a poster source in CourseVideoPlayer-less flows.
 */

export type CourseVideoItem = {
  id: string;
  provider: string;
  video_id: string;
  title: string;
  topic: string | null;
  duration: string | null;
  description: string | null;
};

function VideoCard({ video }: { video: CourseVideoItem }) {
  const [playing, setPlaying] = useState(false);
  const embeddable = video.provider === "youtube";

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
      <div className="relative aspect-video overflow-hidden bg-petrol-950">
        {playing && embeddable ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.video_id}?autoplay=1&rel=0&iv_load_policy=3&playsinline=1&color=white`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => embeddable && setPlaying(true)}
            // Non-embeddable providers keep the link working via the title
            // link below rather than pretending the poster is playable.
            disabled={!embeddable}
            aria-label={`Play tutorial: ${video.title}`}
            className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white disabled:cursor-default"
          >
            <Image
              src={`https://i.ytimg.com/vi/${video.video_id}/hq720.jpg`}
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
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-white/95 text-petrol-900 shadow-lift transition duration-200 [transition-timing-function:var(--ease-out)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" />
              </span>
            </span>
            {video.duration && (
              <span className="absolute bottom-2 right-2 rounded-md bg-petrol-950/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                {video.duration}
              </span>
            )}
          </button>
        )}
      </div>

      <div className="p-4">
        {video.topic && (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">
            {video.topic}
          </p>
        )}
        <h3 className="mt-1.5 text-sm font-semibold leading-snug text-slate-900">
          {video.title}
        </h3>
        {video.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            {video.description}
          </p>
        )}
      </div>
    </article>
  );
}

export function CourseVideoGrid({ videos }: { videos: CourseVideoItem[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((video) => (
        <li key={video.id}>
          <VideoCard video={video} />
        </li>
      ))}
    </ul>
  );
}
