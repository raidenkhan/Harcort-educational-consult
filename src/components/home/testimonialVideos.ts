/**
 * Testimonial videos — real student stories hosted on YouTube.
 *
 * This module is intentionally server-safe (no "use client"): the landing
 * page is a server component and needs the raw data (to decide whether the
 * band renders at all), while the slider that renders it is a client
 * component. Keep shared video data in files like this one.
 *
 * `orientation` controls the frame: "landscape" is the classic 16:9 stage;
 * "short" is a 9:16 vertical (YouTube Shorts) shown in a centred portrait
 * column so it reads like a phone screen, never a stretched video.
 */
export type TestimonialVideo = {
  provider: "youtube";
  videoId: string;
  orientation: "landscape" | "short";
  /** Accessible name for the play button / player iframe. */
  title: string;
  /** Visible caption on the frame (e.g. the student's course). */
  caption?: string;
  duration?: string;
};

export const TESTIMONIAL_VIDEOS: TestimonialVideo[] = [
  {
    // https://youtube.com/shorts/y35i27H8RPI — vertical Short.
    provider: "youtube",
    videoId: "y35i27H8RPI",
    orientation: "short",
    title: "Student story — how Harcourt sessions work",
    caption: "Student story",
  },
  {
    // https://youtu.be/ULll1Nglehw — unlisted landscape testimonial.
    // Verified serving 144p/360p/720p, which keeps weak connections playing.
    provider: "youtube",
    videoId: "ULll1Nglehw",
    orientation: "landscape",
    title: "Student testimonial — Harcourt Educational Consult",
    caption: "Watch the story",
    duration: "1:00",
  },
];
