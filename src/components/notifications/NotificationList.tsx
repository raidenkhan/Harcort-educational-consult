"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { relativeTime } from "@/services/notifications/text";
import { cn } from "@/lib/cn";

type Item = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

async function markRead(id?: string) {
  try {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
  } catch {
    // Best-effort; the next load reconciles.
  }
}

/**
 * The full notification history (Dashboard → Notifications). Same behaviour
 * as the bell's panel — opening one marks it read and follows its link — with
 * room for the whole list. `now` is a server snapshot so relative times never
 * read the clock during render.
 */
export function NotificationList({
  items: initial,
  unread: initialUnread,
  now,
}: {
  items: Item[];
  unread: number;
  now: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, startTransition] = useTransition();

  function open(item: Item) {
    if (!item.read) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
      setUnread((n) => Math.max(0, n - 1));
      void markRead(item.id);
    }
    if (item.link) router.push(item.link);
  }

  function readAll() {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnread(0);
    startTransition(async () => {
      await markRead();
      // Refresh so the sidebar's unread badge (server-rendered) drops too.
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
        <Bell className="mx-auto mb-2 h-5 w-5 text-slate-400" aria-hidden="true" />
        You&apos;re all caught up. Messages, bookings and payment updates will
        show up here.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {unread > 0 ? `${unread} unread` : "All read"} · showing the latest {items.length}
        </p>
        {unread > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={readAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Mark all as read
          </button>
        )}
      </div>

      <Card padded={false} className="mt-4 divide-y divide-slate-100 overflow-hidden">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => open(item)}
            className={cn(
              "flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5",
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
              <span className={cn("block text-sm text-slate-900", !item.read && "font-semibold")}>
                {item.title}
              </span>
              {item.body && (
                <span className="mt-0.5 block text-sm text-slate-600">{item.body}</span>
              )}
              <span className="mt-1 block text-xs text-slate-400">
                {relativeTime(item.createdAt, now)}
                {!item.read && <span className="sr-only"> · unread</span>}
              </span>
            </span>
          </button>
        ))}
      </Card>
    </div>
  );
}
