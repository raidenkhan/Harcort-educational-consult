"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  LogOut,
  MessageSquare,
  Send,
  Users,
} from "lucide-react";
import {
  archiveGroup,
  leaveGroup,
  sendGroupMessage,
  type GroupFormState,
} from "@/services/groups/mutations";
import type {
  GroupListItem,
  GroupMemberView,
  GroupMeta,
} from "@/services/groups/queries";
import type { StudyGroupMessage } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { chatDay, chatDayKey, chatTime, chatTimestamp } from "@/lib/time";

/**
 * The /groups workspace — a shared message feed per group.
 *
 * Mobile: the groups list fills the screen; tapping a group opens its feed
 * (a back button returns to the list). Desktop: list + feed side by side.
 * Sending is optimistic. New messages arrive by polling router.refresh() —
 * same reasoning as /chat (self-hosted auth means no browser realtime).
 */
const POLL_MS = 5000;

interface PendingMessage {
  tempId: string;
  body: string;
}

type Row =
  | { kind: "separator"; id: string; label: string }
  | { kind: "message"; message: StudyGroupMessage };

function nowMs(): number {
  return Date.now();
}

function buildRows(messages: StudyGroupMessage[], now: number): Row[] {
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

/** The owner's invite code, with copy-to-clipboard. */
function JoinCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const write = navigator.clipboard?.writeText(code);
        if (!write) return;
        void write.then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Copy the join code"
      className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold tracking-wider text-brand-700 transition hover:bg-brand-100"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {code}
    </button>
  );
}

function MessageRow({
  message,
  myId,
}: {
  message: StudyGroupMessage;
  myId: string;
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
          {chatTime(new Date(message.created_at))}
        </p>
      </div>
    </div>
  );
}

export function GroupsView({
  groups,
  activeId,
  thread,
  meta,
  members,
  myId,
  now,
}: {
  groups: GroupListItem[];
  activeId: string | null;
  thread: StudyGroupMessage[];
  meta: GroupMeta | null;
  members: GroupMemberView[];
  myId: string;
  now: number;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [pendingMsgs, setPendingMsgs] = useState<PendingMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const threadOpen = Boolean(activeId) && searchParams.get("g") === activeId;
  const lastNav = useRef(0);

  const selectGroup = (id: string) => {
    lastNav.current = nowMs();
    router.push(`/groups?g=${id}`);
  };
  const closeThread = () => {
    lastNav.current = nowMs();
    router.replace("/groups");
  };

  const threadHasBody = (body: string) =>
    thread.some((m) => m.sender_id === myId && m.body === body);
  const visiblePending = pendingMsgs.filter((p) => !threadHasBody(p.body));
  const rows = buildRows(thread, now);

  useEffect(() => {
    if (groups.length === 0) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastNav.current < 1500) return;
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [groups.length, router]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom) el.scrollTop = el.scrollHeight;
  }, [thread, activeId, stickToBottom, pendingMsgs.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeId || meta?.isArchived || sending) return;
    const input = formRef.current?.querySelector<HTMLTextAreaElement>(
      'textarea[name="body"]',
    );
    const body = input?.value.trim() ?? "";
    if (!body) return;

    setPendingMsgs((prev) => [
      ...prev.filter((p) => !threadHasBody(p.body)),
      { tempId: crypto.randomUUID(), body },
    ]);
    setSendError(null);
    setSending(true);
    formRef.current?.reset();

    const fd = new FormData();
    fd.set("groupId", activeId);
    fd.set("body", body);

    const res: GroupFormState | undefined = await sendGroupMessage(fd);
    setSending(false);

    if (res?.error) {
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

  // ── Empty state: no groups at all ──────────────────────────────────
  if (groups.length === 0) {
    return (
      <Card className="mt-10 p-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-slate-100">
          <Users className="h-6 w-6 text-slate-500" />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold text-slate-900">
          No study groups yet
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          Join a group with the code your tutor shared, or — if you tutor —
          start one above and share the code with your students.
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-10 lg:grid lg:grid-cols-[300px_1fr] lg:gap-6">
      {/* ── Groups list ─────────────────────────────────────────────── */}
      <Card
        padded={false}
        className={cn(
          "h-[calc(100dvh-15rem)] min-h-96 flex-col overflow-hidden lg:h-[600px] lg:min-h-0",
          threadOpen ? "hidden lg:flex" : "flex",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Study groups</h2>
          <Badge tone="brand">{groups.length}</Badge>
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {groups.map((g) => {
            const active = g.id === activeId;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => selectGroup(g.id)}
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
                    <Users className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {g.name}
                      </span>
                      {g.lastMessage && (
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {chatTimestamp(new Date(g.lastMessage.createdAt))}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {g.lastMessage
                        ? `${g.lastMessage.senderId === myId ? "You: " : ""}${g.lastMessage.body}`
                        : `${g.memberCount} member${g.memberCount === 1 ? "" : "s"} — say hello.`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ── Feed ────────────────────────────────────────────────────── */}
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
            aria-label="Back to groups"
            className="-ml-1.5 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {meta?.name ?? ""}
            </p>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              {meta?.courseName && <span className="truncate">{meta.courseName}</span>}
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {meta?.memberCount ?? members.length}
              </span>
              {meta?.isArchived && <Badge tone="neutral">Archived</Badge>}
            </p>
          </div>

          {/* Owner tools: invite code + archive. Members: leave. */}
          {meta && (
            <div className="flex items-center gap-2">
              {meta.isOwner && meta.joinCode && !meta.isArchived && (
                <JoinCodeChip code={meta.joinCode} />
              )}
              {meta.isOwner ? (
                <form
                  action={archiveGroup}
                  onSubmit={(e) => {
                    if (!window.confirm("Archive this group? Members keep the history but can't post.")) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="groupId" value={meta.id} />
                  <button
                    type="submit"
                    disabled={meta.isArchived}
                    aria-label="Archive group"
                    title="Archive group"
                    className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <form
                  action={leaveGroup}
                  onSubmit={(e) => {
                    if (!window.confirm("Leave this group?")) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="groupId" value={meta.id} />
                  <button
                    type="submit"
                    aria-label="Leave group"
                    title="Leave group"
                    className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-5 py-5"
        >
          {rows.length === 0 && visiblePending.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                {meta?.description ??
                  "No messages yet — start the conversation."}
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
                  <MessageRow key={row.message.id} message={row.message} myId={myId} />
                ),
              )}

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
              disabled={meta?.isArchived}
              placeholder={
                meta?.isArchived ? "This group is archived" : "Message the group…"
              }
              className="h-11 min-h-0 flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
            <Button
              type="submit"
              disabled={sending || !activeId || meta?.isArchived}
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
