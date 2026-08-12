"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Inbox, Loader2, MessageCircle, Send } from "lucide-react";
import { sendMessage, type ConversationFormState } from "@/services/chat/mutations";
import type { ConversationListItem } from "@/services/chat/queries";
import type { Message } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { cn } from "@/lib/cn";
import { chatDay, chatDayKey, chatTime, chatTimestamp } from "@/lib/time";

/**
 * The /chat workspace — WhatsApp-style.
 *
 * Mobile: a chats list fills the screen; tapping a chat opens the thread
 * (back button returns to the list). Desktop: conversation sidebar + thread
 * sit side by side. Sending is optimistic — your bubble appears instantly
 * with a "Sending…" state, reconciles to a ✓ once the refreshed thread has
 * it, and rolls back with your text restored on failure.
 *
 * Incoming messages: conversations/messages are published to
 * supabase_realtime, but the app uses self-hosted auth (no Supabase session),
 * so a browser client can't subscribe under RLS. Instead we poll
 * router.refresh() while the page is open — new messages appear within ~5s.
 */
const POLL_MS = 5000;

interface PendingMessage {
  tempId: string;
  body: string;
}

/** A thread row — either a day separator or a message bubble. */
type Row =
  | { kind: "separator"; id: string; label: string }
  | { kind: "message"; message: Message };

/** Module-level so the React Compiler purity lint stays quiet. */
function nowMs(): number {
  return Date.now();
}

/** Insert day separators whenever the Accra date changes between messages. */
function buildRows(messages: Message[], now: number): Row[] {
  const rows: Row[] = [];
  let prevKey: string | null = null;
  for (const m of messages) {
    const key = chatDayKey(new Date(m.created_at).getTime());
    if (key !== prevKey) {
      rows.push({
        kind: "separator",
        id: `sep-${key}`,
        label: chatDay(new Date(m.created_at).getTime(), now),
      });
      prevKey = key;
    }
    rows.push({ kind: "message", message: m });
  }
  return rows;
}

/** One message bubble. Pure render of a single message — no state. */
function MessageRow({
  message,
  myId,
  fromAdmin,
}: {
  message: Message;
  myId: string;
  /** True when this message was sent by the conversation's admin participant. */
  fromAdmin: boolean;
}) {
  const mine = message.sender_id === myId;
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-lg px-3.5 py-2 shadow-xs",
          mine
            ? "rounded-br-sm bg-slate-900 text-white"
            : "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.body}
        </p>
        <p className="mt-1 flex items-center justify-end gap-1 text-right text-[11px] text-slate-400">
          {mine && <Check className="h-3 w-3" />}
          {fromAdmin && <VerifiedBadge className="h-3.5 w-3.5" />}
          {chatTime(new Date(message.created_at))}
        </p>
      </div>
    </div>
  );
}

export function ChatView({
  conversations,
  activeId,
  thread,
  otherName,
  myId,
  closed = false,
  now,
  otherIsAdmin = false,
  adminId = null,
  isAdmin = false,
}: {
  conversations: ConversationListItem[];
  activeId: string | null;
  thread: Message[];
  otherName: string;
  myId: string;
  closed?: boolean;
  /** Snapshot for "Today"/"Yesterday" separators — passed from the server page. */
  now: number;
  /** The other party is a verified Harcot admin. */
  otherIsAdmin?: boolean;
  /** The conversation's admin participant id (marks their bubbles). */
  adminId?: string | null;
  /** The signed-in user is an admin (empty-state copy + no browse CTA). */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [pendingMsgs, setPendingMsgs] = useState<PendingMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Mobile: chats list ↔ open thread, derived from the URL so it can never
  // drift out of sync with the active conversation (the old local state
  // would go stale and every row ended up opening the same fallback chat).
  const searchParams = useSearchParams();
  // The URL must name THIS conversation — otherwise the pane stays on the
  // list for the moment it takes the new thread's props to arrive, instead of
  // flashing the previous conversation's content.
  const threadOpen =
    Boolean(activeId) && searchParams.get("c") === activeId;

  // Timestamp of the last manual navigation — polling skips this window so a
  // refresh response can't clobber an in-flight conversation switch.
  const lastNav = useRef(0);

  const selectConversation = (id: string) => {
    lastNav.current = nowMs();
    router.push(`/chat?c=${id}`);
  };
  const closeThread = () => {
    lastNav.current = nowMs();
    router.replace("/chat");
  };

  // True once the server thread contains this body from me (reconciliation).
  const threadHasBody = (body: string) =>
    thread.some((m) => m.sender_id === myId && m.body === body);

  // Optimistic bubbles the server doesn't know about yet.
  const visiblePending = pendingMsgs.filter((p) => !threadHasBody(p.body));

  const rows = buildRows(thread, now);

  // Pick up new messages while the page is open (see realtime note above).
  // Skips refreshes shortly after a manual switch and when the tab is hidden.
  useEffect(() => {
    if (conversations.length === 0) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastNav.current < 1500) return;
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [conversations.length, router]);

  // Stay pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom) el.scrollTop = el.scrollHeight;
  }, [thread, activeId, stickToBottom, pendingMsgs.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setStickToBottom(nearBottom);
  };

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeId || closed || sending) return;
    const input = formRef.current?.querySelector<HTMLTextAreaElement>(
      'textarea[name="body"]',
    );
    const body = input?.value.trim() ?? "";
    if (!body) return;

    // Optimistic bubble — show it before the network even gets involved.
    setPendingMsgs((prev) => [
      ...prev.filter((p) => !threadHasBody(p.body)),
      { tempId: crypto.randomUUID(), body },
    ]);
    setSendError(null);
    setSending(true);
    formRef.current?.reset();

    const fd = new FormData();
    fd.set("conversationId", activeId);
    fd.set("body", body);

    const res: ConversationFormState | undefined = await sendMessage(fd);
    setSending(false);

    if (res?.error) {
      // Failed — drop the bubble and restore the text so they can retry.
      setSendError(res.error);
      setPendingMsgs((prev) => prev.filter((p) => p.body !== body));
      const el = formRef.current?.querySelector<HTMLTextAreaElement>(
        'textarea[name="body"]',
      );
      if (el && !el.value.trim()) el.value = body;
      return;
    }
    router.refresh();
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
        {isAdmin ? (
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
            Use the “New message” panel above to start a conversation with a
            student or tutor.
          </p>
        ) : (
          <>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
              Find a tutor you like on the home page and tap “Contact tutor” —
              the conversation will show up here for both of you.
            </p>
            <Link href="/tutors" className="mt-6 inline-block">
              <Button>Browse tutors</Button>
            </Link>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="mt-10 lg:grid lg:grid-cols-[300px_1fr] lg:gap-6">
      {/* ── Chats list ─────────────────────────────────────────────── */}
      <Card
        padded={false}
        className={cn(
          "h-[calc(100dvh-15rem)] min-h-96 flex-col overflow-hidden lg:h-[600px] lg:min-h-0",
          threadOpen ? "hidden lg:flex" : "flex",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Chats</h2>
          <Badge tone="petrol">{conversations.length}</Badge>
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 px-5 py-4 text-left transition duration-150",
                    active ? "bg-brand-50/70" : "hover:bg-slate-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      active ? "bg-brand-600 text-white" : "bg-slate-900 text-white",
                    )}
                  >
                    {(c.otherName || "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {c.otherName}
                        </span>
                        {c.otherIsAdmin && <VerifiedBadge />}
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
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ── Thread ─────────────────────────────────────────────────── */}
      <Card
        padded={false}
        className={cn(
          "h-[calc(100dvh-15rem)] min-h-96 flex-col overflow-hidden lg:h-[600px] lg:min-h-0",
          !threadOpen ? "hidden lg:flex" : "flex",
        )}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
          <button
            type="button"
            onClick={closeThread}
            aria-label="Back to chats"
            className="-ml-1.5 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            {(otherName || "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-slate-900">
                {otherName}
              </span>
              {otherIsAdmin && <VerifiedBadge />}
            </p>
            <p className="text-xs text-slate-500">
              {closed ? "Conversation closed" : "Conversation open"}
            </p>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-5 py-5"
        >
          {rows.length === 0 && visiblePending.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MessageCircle className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Say hello to {otherName} — your messages will appear here.
              </p>
            </div>
          ) : (
            <>
              {rows.map((row) =>
                row.kind === "separator" ? (
                  <div key={row.id} className="flex justify-center">
                    <span className="rounded-md bg-slate-200/80 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {row.label}
                    </span>
                  </div>
                ) : (
                  <MessageRow
                    key={row.message.id}
                    message={row.message}
                    myId={myId}
                    fromAdmin={row.message.sender_id === adminId}
                  />
                ),
              )}

              {/* Optimistic bubbles still in flight */}
              {visiblePending.map((p) => (
                <div key={p.tempId} className="flex justify-end">
                  <div className="max-w-[78%] rounded-lg rounded-br-sm bg-slate-900 px-3.5 py-2 shadow-xs text-white">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {p.body}
                    </p>
                    <p className="mt-1 flex items-center justify-end gap-1 text-right text-[11px] text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Sending…
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <form
          ref={formRef}
          onSubmit={handleSend}
          className="border-t border-slate-100 bg-white p-4"
        >
          <div className="flex items-end gap-2">
            <textarea
              name="body"
              rows={1}
              maxLength={2000}
              disabled={closed}
              placeholder={
                closed ? "This conversation is closed" : `Message ${otherName}…`
              }
              className="h-11 min-h-0 flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
            <Button
              type="submit"
              disabled={sending || !activeId || closed}
              className="h-11 w-11 shrink-0 px-0"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {sendError && (
            <p className="mt-2 text-xs font-medium text-red-600" role="alert">
              {sendError}
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
