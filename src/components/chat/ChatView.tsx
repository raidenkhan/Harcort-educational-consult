"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, MessageCircle, Send, Loader2 } from "lucide-react";
import { sendMessage, type ConversationFormState } from "@/services/chat/mutations";
import type { ConversationListItem } from "@/services/chat/queries";
import type { Message } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { chatTime, chatTimestamp } from "@/lib/time";

/**
 * The /chat workspace: conversation sidebar + message thread + composer.
 *
 * Realtime note: messages/conversations are published to supabase_realtime,
 * but the app uses self-hosted auth (no Supabase session), so a browser
 * client can't subscribe under RLS. Instead we poll router.refresh() while
 * the page is open — new messages appear within ~5s with no extra deps.
 */

const POLL_MS = 5000;

export function ChatView({
  conversations,
  activeId,
  thread,
  otherName,
  myId,
  closed = false,
}: {
  conversations: ConversationListItem[];
  activeId: string | null;
  thread: Message[];
  otherName: string;
  myId: string;
  closed?: boolean;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [state, formAction, pending] = useActionState<ConversationFormState, FormData>(
    sendMessage,
    {},
  );

  // Pick up new messages while the page is open (see realtime note above).
  useEffect(() => {
    if (conversations.length === 0) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [conversations.length, router]);

  // Stay pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom) el.scrollTop = el.scrollHeight;
  }, [thread, activeId, stickToBottom]);

  // Clear the composer after a successful send.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setStickToBottom(nearBottom);
  };

  // ── Empty state: no conversations at all ──────────────────────────
  if (conversations.length === 0) {
    return (
      <Card className="mt-10 p-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-slate-100">
          <Inbox className="h-6 w-6 text-slate-500" />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold text-slate-900">
          No conversations yet
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          Find a tutor you like on the home page and tap “Contact tutor” — the
          conversation will show up here for both of you.
        </p>
        <Link href="/#tutors" className="mt-6 inline-block">
          <Button>Browse tutors</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* Mobile conversation picker */}
      <select
        value={activeId ?? ""}
        onChange={(e) => router.push(`/chat?c=${e.target.value}`)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs lg:hidden"
        aria-label="Switch conversation"
      >
        {conversations.map((c) => (
          <option key={c.id} value={c.id}>
            {c.otherName}
          </option>
        ))}
      </select>

      {/* Sidebar */}
      <Card padded={false} className="hidden h-[600px] flex-col overflow-hidden lg:flex">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Conversations</h2>
          <Badge tone="petrol">{conversations.length}</Badge>
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <Link
                  href={`/chat?c=${c.id}`}
                  className={cn(
                    "flex items-start gap-3 px-5 py-4 transition duration-150",
                    active
                      ? "bg-brand-50/70"
                      : "hover:bg-slate-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold",
                      active ? "bg-brand-600 text-white" : "bg-slate-900 text-white",
                    )}
                  >
                    {(c.otherName || "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {c.otherName}
                      </span>
                      {c.lastMessage && (
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {chatTimestamp(new Date(c.lastMessage.createdAt))}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {c.lastMessage
                        ? `${c.lastMessage.senderId === myId ? "You: " : ""}${c.lastMessage.body}`
                        : "No messages yet — say hello."}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Thread */}
      <Card padded={false} className="flex h-[600px] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
            {(otherName || "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{otherName}</p>
            <p className="text-xs text-slate-500">
              {conversations.find((c) => c.id === activeId)?.status === "closed"
                ? "Conversation closed"
                : "Conversation open"}
            </p>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-5 py-5"
        >
          {thread.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MessageCircle className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Say hello to {otherName} — your messages will appear here.
              </p>
            </div>
          ) : (
            thread.map((m) => {
              const mine = m.sender_id === myId;
              return (
                <div
                  key={m.id}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[78%] rounded-lg px-3.5 py-2 shadow-xs",
                      mine
                        ? "rounded-br-sm bg-slate-900 text-white"
                        : "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {m.body}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-right text-[11px]",
                        mine ? "text-slate-400" : "text-slate-400",
                      )}
                    >
                      {chatTime(new Date(m.created_at))}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form ref={formRef} action={formAction} className="border-t border-slate-100 bg-white p-4">
          <input type="hidden" name="conversationId" value={activeId ?? ""} />
          <div className="flex items-end gap-2">
            <textarea
              name="body"
              rows={1}
              maxLength={2000}
              disabled={closed}
              placeholder={closed ? "This conversation is closed" : `Message ${otherName}…`}
              className="h-11 min-h-0 flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
            <Button
              type="submit"
              disabled={pending || !activeId || closed}
              className="h-11 w-11 shrink-0 px-0"
              aria-label="Send message"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {state?.error && (
            <p className="mt-2 text-xs font-medium text-red-600" role="alert">
              {state.error}
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
