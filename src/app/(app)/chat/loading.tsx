import { Container } from "@/components/ui/Container";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/** Chat page skeleton — conversation list + message thread area. */
export default function ChatLoading() {
  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />

        {/* Chat layout: sidebar list + main thread */}
        <div className="mt-10 grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Conversation list */}
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-card"
              >
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1 h-3 w-full" />
                </div>
              </div>
            ))}
          </div>

          {/* Message thread */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-card">
            {/* Thread header */}
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3.5">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>

            {/* Messages */}
            <div className="space-y-4 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
                >
                  <Skeleton
                    className={`h-10 rounded-2xl ${i % 2 === 0 ? "w-48" : "w-40"}`}
                  />
                </div>
              ))}
            </div>

            {/* Input bar */}
            <div className="border-t border-slate-200 px-5 py-3">
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
