"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { relativeTime } from "@/services/notifications/text";
import { cn } from "@/lib/cn";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

type Feed = { enabled: boolean; unread: number; items: Item[] };

const POLL_MS = 60_000;

/**
 * The notification bell, beside the cart in every signed-in nav. It polls
 * /api/notifications once a minute and whenever the tab regains focus (the
 * app has no realtime channel — same trade-off as /chat), shows an unread
 * badge, and opens a panel of the latest notifications. Opening one marks it
 * read and follows its link. Hidden entirely until migration 0042 exists.
 */
export function NotificationBell() {
  const router = useRouter();
  const [feed, setFeed] = useState<Feed | null>(null);
  // Snapshot of the clock at fetch time — relative times are computed from
  // this, never from Date.now() during render (react-hooks/purity).
  const [fetchedAt, setFetchedAt] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      setFeed((await res.json()) as Feed);
      setFetchedAt(Date.now());
    } catch {
      // Offline or a blip — keep the last feed; the next poll retries.
    }
  }, []);

  useEffect(() => {
    // The first load is deferred a tick so the nav paints without waiting.
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(id?: string) {
    // Optimistic: the badge drops immediately; the server call follows.
    setFeed((prev) =>
      prev
        ? {
            ...prev,
            unread: id ? Math.max(0, prev.unread - (prev.items.find((i) => i.id === id && !i.read) ? 1 : 0)) : 0,
            items: prev.items.map((i) => (!id || i.id === id ? { ...i, read: true } : i)),
          }
        : prev,
    );
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
      });
    } catch {
      // The next poll reconciles.
    }
  }

  function openItem(item: Item) {
    if (!item.read) void markRead(item.id);
    setOpen(false);
    if (item.link) router.push(item.link);
  }

  if (!feed?.enabled) return null;

  const label =
    feed.unread === 0
      ? "Notifications"
      : `Notifications, ${feed.unread} unread`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition duration-150 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.96] sm:h-10 sm:w-10"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {feed.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
            {feed.unread > 9 ? "9+" : feed.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-[4.5rem] z-50 rounded-2xl border border-slate-200 bg-white shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {feed.unread > 0 && (
              <button
                type="button"
                onClick={() => void markRead()}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all as read
              </button>
            )}
          </div>

          {feed.items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              You&apos;re all caught up. Messages, bookings and payment updates
              will show up here.
            </p>
          ) : (
            <ul className="max-h-[min(28rem,70vh)] divide-y divide-slate-100 overflow-y-auto">
              {feed.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50",
                      !item.read && "bg-brand-50/40",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        item.read ? "bg-transparent" : "bg-brand-600",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm leading-snug text-slate-900",
                          !item.read && "font-semibold",
                        )}
                      >
                        {item.title}
                      </span>
                      {item.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">
                          {item.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {relativeTime(item.createdAt, fetchedAt)}
                        {!item.read && <span className="sr-only"> · unread</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
