import Link from "next/link";
import { SearchX } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { FloatingNav } from "@/components/navigation/FloatingNav";

/**
 * A tutor link that matches nobody — a mistyped code, a tutor who was never
 * approved, or one who switched to student (and therefore left the public
 * list). The default Next 404 is a dead end; this one explains the three
 * likely causes and puts the directory one tap away.
 *
 * The page deliberately does not echo the code back: it is attacker-supplied
 * text on a public page, and the tutor who receives the link does not need to
 * see it to understand the message.
 */
export default function TutorNotFound() {
  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      <BentoBackdrop tone="purple" className="-z-10" />
      <FloatingNav links={[{ href: "/tutors", label: "Find a tutor" }]} />
      <main className="relative flex flex-1 items-center pt-28">
        <Container size="narrow">
          <Card className="mx-auto w-full max-w-lg text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <SearchX className="h-6 w-6" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900">
              This tutor link doesn&apos;t match anyone
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The code may have been mistyped or cut short when the link was
              copied. It can also happen when a tutor is no longer listed — only
              approved tutors appear on Harcourt.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Ask the tutor to send their link again, or find them in the
              directory.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/tutors"
                className="inline-flex h-11 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Browse tutors
              </Link>
              <Link
                href="/courses"
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Browse courses
              </Link>
            </div>
          </Card>
        </Container>
      </main>
    </div>
  );
}
