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
 * Real videos from the Harcourt University YouTube channel. Exported so the
 * Subjects section can derive the lesson-library subject list from it.
 */
export const LESSONS: {
  id: string;
  title: string;
  length: string;
  topic: string;
}[] = [
  {
    id: "Y7Ro0SJAsiQ",
    title: "Tower crane statics — complete engineering mechanics solution",
    length: "42:25",
    topic: "Engineering Mechanics",
  },
  {
    id: "9MK_Trj4a24",
    title: "Machine kinematics: velocity diagram & slider velocity",
    length: "27:30",
    topic: "Theory of Machines",
  },
  {
    id: "g6PYU11DrMo",
    title: "Coulombic damping vibration system explained from first principles",
    length: "14:10",
    topic: "Vibrations",
  },
  {
    id: "NK7Qhg6F7ZY",
    title: "Rotary balancing: graphical method, problem continuation",
    length: "32:38",
    topic: "Dynamics",
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
                Watch full problems being solved — not summaries. Our YouTube
                library covers the mechanics, machines and dynamics topics
                KNUST students face every semester, free for anyone.
              </p>
            </div>
            <a
              href="https://www.youtube.com/@harcourt-university"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-900 transition-colors hover:text-brand-600"
            >
              Visit the channel
              <ArrowUpRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
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
