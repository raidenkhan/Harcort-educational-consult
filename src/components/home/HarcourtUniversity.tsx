import Image from "next/image";
import { Play, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "./Reveal";

/**
 * Harcourt University — the free educational-content arm of Harcourt.
 *
 * Every lesson below is a real video from the Harcourt University YouTube
 * channel (youtube.com/@harcourt-university): full engineering-mechanics
 * problems worked step by step. Thumbnails come straight from YouTube's CDN
 * via next/image (remotePattern in next.config.ts) and each card links to
 * the video. Swap videos by editing the list — keep ids, titles and
 * durations in sync with the channel.
 */
/**
 * A featured lesson-library channel. Harcourt University is the flagship;
 * partner channels (LoganDemia) extend coverage into subjects the flagship
 * doesn't teach yet. Every video is real and verified against the channel.
 */
export interface LessonChannel {
  /** Channel display name. */
  name: string;
  /** Handle URL (https://www.youtube.com/@…) for the "visit channel" link. */
  url: string;
  /** One-line description of what the channel teaches. */
  blurb: string;
  /** True for Harcourt's own channel (gets the flagship styling). */
  flagship: boolean;
}

/** The channels featured in the lesson library. */
export const LESSON_CHANNELS: LessonChannel[] = [
  {
    name: "Harcourt University",
    url: "https://www.youtube.com/@harcourt-university",
    blurb:
      "Our flagship channel — full engineering-mechanics problems worked step by step.",
    flagship: true,
  },
  {
    name: "LoganDemia",
    url: "https://www.youtube.com/@LoganDemia",
    blurb:
      "Partner channel — computer architecture and digital signal processing, from adders and caches to z-transforms.",
    flagship: false,
  },
];

/**
 * Real videos across the featured channels. `channel` picks the badge and
 * topic grouping; ids/titles/durations verified against the channels.
 * Exported so the Subjects section can derive the lesson-library subject
 * list from it.
 */
export const LESSONS: {
  id: string;
  title: string;
  length: string;
  topic: string;
  channel: string;
}[] = [
  {
    id: "Y7Ro0SJAsiQ",
    title: "Tower crane statics — complete engineering mechanics solution",
    length: "42:25",
    topic: "Engineering Mechanics",
    channel: "Harcourt University",
  },
  {
    id: "9MK_Trj4a24",
    title: "Machine kinematics: velocity diagram & slider velocity",
    length: "27:30",
    topic: "Theory of Machines",
    channel: "Harcourt University",
  },
  {
    id: "g6PYU11DrMo",
    title: "Coulombic damping vibration system explained from first principles",
    length: "14:10",
    topic: "Vibrations",
    channel: "Harcourt University",
  },
  {
    id: "NK7Qhg6F7ZY",
    title: "Rotary balancing: graphical method, problem continuation",
    length: "32:38",
    topic: "Dynamics",
    channel: "Harcourt University",
  },
  {
    id: "ewyPOql60BQ",
    title: "Booth's algorithm explained — 2-bit & 3-bit encoding",
    length: "14:01",
    topic: "Computer Architecture",
    channel: "LoganDemia",
  },
  {
    id: "v-1D01fE77w",
    title: "Cache memory & the memory hierarchy — part 1",
    length: "15:21",
    topic: "Computer Architecture",
    channel: "LoganDemia",
  },
  {
    id: "Kx6q-F2W_lg",
    title: "MIPS architecture — single-cycle datapath",
    length: "10:07",
    topic: "Computer Architecture",
    channel: "LoganDemia",
  },
  {
    id: "Yq70B9AvFb8",
    title: "Inverse z-transform, part 1 — digital signal processing",
    length: "12:34",
    topic: "Digital Signal Processing",
    channel: "LoganDemia",
  },
];

export function HarcourtUniversity() {
  return (
    <section id="learn" className="relative scroll-mt-24">
      <Container className="py-16 sm:py-20">
        <Reveal>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
                Harcourt University
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Free lessons on the courses that trip students up
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                Watch full problems being solved — not summaries. Our channels
                cover the mechanics, machines and dynamics topics KNUST
                students face every semester, plus computer architecture and
                digital signal processing from our partner channel LoganDemia
                — all free for anyone.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              {LESSON_CHANNELS.map((channel) => (
                <a
                  key={channel.name}
                  href={channel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 transition-colors hover:text-brand-600"
                >
                  {channel.name === "Harcourt University" ? (
                    "Visit the channel"
                  ) : (
                    <>Visit {channel.name}</>
                  )}
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {LESSONS.map((lesson, i) => (
            <Reveal
              key={lesson.id}
              delay={i * 60}
              variant={i % 2 === 0 ? "left" : "right"}
            >
              <a
                href={`https://www.youtube.com/watch?v=${lesson.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-[2px] border border-slate-200 bg-white transition duration-200 [transition-timing-function:var(--ease-out)] hover:border-slate-300 motion-reduce:transition-none"
              >
                {/* Thumbnail with play affordance — pointer-gated so touch
                    devices don't get a stuck hover state. */}
                <div className="relative aspect-video overflow-hidden bg-petrol-950">
                  <Image
                    src={`https://i.ytimg.com/vi/${lesson.id}/hq720.jpg`}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover opacity-90 transition duration-300 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.03] group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[2px] bg-white/95 text-petrol-900 transition duration-200 [transition-timing-function:var(--ease-out)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-105">
                      <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />
                    </span>
                  </span>
                  <span className="absolute bottom-2 right-2 rounded-[2px] bg-petrol-950/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                    {lesson.length}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">
                    {lesson.topic}
                    {!LESSON_CHANNELS.find((c) => c.name === lesson.channel)
                      ?.flagship && (
                      <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">
                        · {lesson.channel}
                      </span>
                    )}
                  </p>
                  <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                    {lesson.title}
                  </h3>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
