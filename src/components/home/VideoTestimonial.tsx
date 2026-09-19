"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Click-to-play facade for the student-testimonial exhibit.
 *
 * Why not drop the <iframe> straight into the page: a YouTube/Vimeo embed
 * pulls its own player bundle — hundreds of KB of JS plus its own requests —
 * the moment the page parses it, whether or not anyone ever presses play.
 * This band sits far below the fold, so that cost would be paid by every
 * visitor for a video most never open. Here the page ships one poster image
 * and a button; the player is requested only after a click.
 *
 * Playback is the platform's job: both hosts serve adaptive-bitrate streams,
 * so a viewer on a weak mobile connection gets a lower-quality rendition
 * instead of a stalling buffer. That is the reason the source file lives on
 * the platform rather than in /public — a fixed-bitrate MP4 either fits the
 * viewer's connection or it doesn't, and there is no ladder to fall back to.
 *
 * ── On hiding the host's branding ────────────────────────────────────────
 * The player parameters below are everything the hosts still honour:
 *   youtube  rel=0 (related videos restricted to the same channel),
 *            iv_load_policy=3 (no annotations/cards)
 *   vimeo    title=0, byline=0, portrait=0 (no title card, uploader name or
 *            avatar in the chrome)
 * YouTube's own logo, title card and "watch on YouTube" button CANNOT be
 * removed: `showinfo` was retired in 2018 and Google confirms `modestbranding`
 * "is deprecated and will have no effect". Cropping the player to hide the
 * chrome only misaligns the controls and works against YouTube's terms. If the
 * branding genuinely has to go, the fix is a different host — a platform that
 * serves HLS we drive with our own <video> element has no third-party chrome
 * to hide. Vimeo already gets close; a raw HLS source gets all the way.
 *
 * The embed hosts are allow-listed in `frame-src` in next.config.ts. Without
 * that entry the browser blocks the iframe (frame-src falls back to
 * default-src, it does not inherit img-src) and the play button would look
 * broken.
 */

type VideoProvider = "youtube" | "vimeo";

const PLAYER_SRC: Record<VideoProvider, (id: string) => string> = {
  // youtube-nocookie: no tracking cookies are set before playback starts.
  youtube: (id) =>
    `https://www.youtube-nocookie.com/embed/${id}` +
    `?autoplay=1&rel=0&iv_load_policy=3&playsinline=1&color=white`,
  vimeo: (id) =>
    `https://player.vimeo.com/video/${id}` +
    `?autoplay=1&title=0&byline=0&portrait=0&dnt=1`,
};

/**
 * Poster image candidates, best first.
 *
 * YouTube only materialises the larger sizes when it has them: a 720p upload
 * with a default frame serves `sddefault` and nothing above it, while
 * `maxresdefault`/`hq720` 404 (they return a 120×90 grey placeholder, which
 * the optimizer surfaces as a failed image). Rather than guess, the component
 * walks this list on error — see `onError` below. Setting a custom thumbnail
 * in YouTube Studio makes the large sizes exist, which both sharpens the
 * poster and skips the failed requests.
 *
 * The default frames are 4:3 with letterbox bars; the container is 16:9 and
 * the image is `object-cover`, which crops exactly those bars off.
 *
 * Vimeo exposes no equivalent public URL, so a Vimeo testimonial must pass
 * `poster` explicitly (a frame dropped into /public is fine).
 */
const POSTER_CANDIDATES: Record<VideoProvider, (id: string) => string[]> = {
  youtube: (id) => [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hq720.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ],
  vimeo: () => [],
};

export function VideoTestimonial({
  provider,
  videoId,
  poster,
  title,
  label = "Watch the story",
  duration,
  className,
}: {
  provider: VideoProvider;
  videoId: string;
  /** Override the derived poster. Required in practice for Vimeo. */
  poster?: string;
  /** Accessible name for the play button and the player iframe. */
  title: string;
  /** Visible caption under the play chip. */
  label?: string;
  /** Runtime, shown as a chip on the frame (e.g. "1:00"). */
  duration?: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  // Walks the candidate list when a size isn't available; running off the end
  // simply drops the poster, leaving the flat ink stage and the play button.
  const [posterIndex, setPosterIndex] = useState(0);
  const candidates = poster ? [poster] : POSTER_CANDIDATES[provider](videoId);
  const posterSrc = candidates[posterIndex];

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-[2px] border border-petrol-800 bg-petrol-900",
        className,
      )}
    >
      {playing ? (
        <iframe
          src={PLAYER_SRC[provider](videoId)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={title}
          className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
        >
          {posterSrc && (
            // Lazy by default (no `priority`) — this band is below the fold.
            // next/image proxies the remote thumbnail through /_next/image,
            // so it still satisfies the `img-src 'self'` CSP.
            <Image
              src={posterSrc}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 1024px"
              onError={() => setPosterIndex((i) => i + 1)}
              className="object-cover opacity-90 transition-opacity duration-300 [transition-timing-function:var(--ease-out)] group-hover:opacity-100 motion-reduce:transition-none"
            />
          )}

          {/* Cinematic falloff — keeps the chip legible over any frame while
              leaving the middle of the picture bright. */}
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-petrol-950/70 via-petrol-950/10 to-petrol-950/30"
          />

          <span className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <span className="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
              {/* Squared "sonar" ring — draws the eye without a bouncing
                  arrow. Neutralised by the global reduced-motion override. */}
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
              {label}
            </span>
          </span>

          {duration && (
            <span className="absolute bottom-3 right-3 rounded-[2px] bg-petrol-950/85 px-2 py-1 text-[11px] font-semibold tabular-nums text-white">
              {duration}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
