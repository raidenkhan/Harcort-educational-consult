"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Link2,
  Loader2,
  LogOut,
  MessageSquare,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  addGroupMembers,
  archiveGroup,
  joinGroupById,
  leaveGroup,
  markGroupRead,
  sendGroupMessage,
  type GroupFormState,
} from "@/services/groups/mutations";
import type {
  GroupListItem,
  GroupMemberView,
  GroupMeta,
  JoinableGroup,
} from "@/services/groups/queries";
import type { StudyGroupMessage } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  deferPolling,
  pausePolling,
  pollingPaused,
  type PollGate,
} from "@/lib/pollGate";
import { chatDay, chatDayKey, chatTime, chatTimestamp } from "@/lib/time";

/**
 * The /groups workspace — a shared message feed per group, shaped like the
 * messaging app Ghanaian students already use.
 *
 * 0036 made the room *visible*: the list shows an initials avatar, the sender
 * name on the last-message preview, a bold row and an unread pill when
 * something arrived, and a search box once a student is in several groups.
 * Tutors add students from their roster right in the members sheet, and a
 * student who is already working with a tutor can join their group in one tap
 * from the suggestion band instead of hunting for a code.
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

/* ------------------------------------------------------------------ */
/*  Avatars — WhatsApp puts a face on every row; a group gets initials  */
/* ------------------------------------------------------------------ */

const AVATAR_TONES = [
  "bg-brand-600",
  "bg-petrol-700",
  "bg-emerald-600",
  "bg-amber-500",
  "bg-rose-600",
  "bg-sky-600",
] as const;

/** First letters of the first and last word, e.g. "Thermo Circle" → "TC". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** Stable colour per name — same group always gets the same tint. */
function toneFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

function GroupAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-white",
        toneFor(name),
        className ?? "h-11 w-11",
      )}
    >
      {initials(name)}
    </span>
  );
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
  senderName,
}: {
  message: StudyGroupMessage;
  myId: string;
  /** Group chat: a bubble from someone else names its author (WhatsApp). */
  senderName?: string;
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
        {!mine && senderName && (
          <p className="mb-0.5 text-[11px] font-semibold text-brand-700">
            {senderName}
          </p>
        )}
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

/* ------------------------------------------------------------------ */
/*  Suggested groups — one-tap join                                     */
/* ------------------------------------------------------------------ */

function SuggestedGroups({ suggested }: { suggested: JoinableGroup[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = async (groupId: string) => {
    if (pendingId) return;
    setPendingId(groupId);
    setError(null);
    const fd = new FormData();
    fd.set("groupId", groupId);
    const res: GroupFormState | undefined = await joinGroupById({}, fd);
    setPendingId(null);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.push(`/groups?g=${groupId}`);
  };

  if (suggested.length === 0) return null;

  return (
    <Card className="mt-8 border-brand-200 bg-brand-50/40">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Groups you can join
          </h2>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
            Your tutor already runs these for your course. Join in one tap — no
            code needed.
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {suggested.map((group) => (
          <li
            key={group.id}
            className="flex items-center gap-3 rounded-lg border border-brand-100 bg-white p-3"
          >
            <GroupAvatar name={group.name} className="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {group.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {group.courseName ?? group.ownerName}
                {" · "}
                {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void join(group.id)}
              disabled={pendingId !== null}
              className="shrink-0"
            >
              {pendingId === group.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Join"
              )}
            </Button>
          </li>
        ))}
      </ul>

      {error && (
        <p className="mt-3 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace                                                           */
/* ------------------------------------------------------------------ */

export function GroupsView({
  groups,
  activeId,
  thread,
  meta,
  members,
  myId,
  now,
  suggested,
  roster,
  canCreate,
}: {
  groups: GroupListItem[];
  activeId: string | null;
  thread: StudyGroupMessage[];
  meta: GroupMeta | null;
  members: GroupMemberView[];
  myId: string;
  now: number;
  /** Groups the student is entitled to join without a code. */
  suggested: JoinableGroup[];
  /** The tutor's students (id + name) for the "Add students" picker. */
  roster: { id: string; name: string }[];
  /** Tutors/admins create groups; students join them. */
  canCreate: boolean;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const addFormRef = useRef<HTMLFormElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [pendingMsgs, setPendingMsgs] = useState<PendingMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // Live updates stand down while a server action is in flight: a refresh
  // aborts the action's POST, and the aborted response leaves its pending
  // flag stuck (see lib/pollGate.ts).
  const pollGate = useRef<PollGate>({ locks: 0, until: 0 });
  const addPollRelease = useRef<(() => void) | null>(null);

  const [addState, addAction, adding] = useActionState<GroupFormState, FormData>(
    addGroupMembers,
    {},
  );

  const searchParams = useSearchParams();
  const threadOpen = Boolean(activeId) && searchParams.get("g") === activeId;
  const lastNav = useRef(0);

  const selectGroup = (id: string) => {
    lastNav.current = nowMs();
    router.push(`/groups?g=${id}`);
  };
  const closeThread = () => {
    lastNav.current = nowMs();
    setShowMembers(false);
    router.replace("/groups");
  };

  const threadHasBody = (body: string) =>
    thread.some((m) => m.sender_id === myId && m.body === body);
  const visiblePending = pendingMsgs.filter((p) => !threadHasBody(p.body));
  const rows = buildRows(thread, now);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = normalizedQuery
    ? groups.filter((group) =>
        `${group.name} ${group.courseName ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : groups;

  const activeUnread = groups.find((group) => group.id === activeId)?.unreadCount ?? 0;
  const memberIds = new Set(members.map((member) => member.profileId));
  const addable = roster.filter((student) => !memberIds.has(student.id));
  const nameByProfile = new Map(
    members.map((member) => [member.profileId, member.name]),
  );

  // Read receipts (0036): opening a group with unread messages stamps the
  // watermark and refreshes once, so the pill and the nav badge clear.
  useEffect(() => {
    if (!threadOpen || !activeId || activeUnread === 0) return;
    let cancelled = false;
    const releasePoll = pausePolling(pollGate.current);
    void markGroupRead(activeId)
      .then(() => {
        if (!cancelled) router.refresh();
      })
      .finally(releasePoll);
    return () => {
      cancelled = true;
      releasePoll();
    };
  }, [activeId, threadOpen, activeUnread, thread.length, router]);

  // `useActionState` can't be awaited, so the add form's hold is released when
  // its pending flag drops (the gate's deadline covers a submit that never
  // reaches the action at all).
  useEffect(() => {
    if (adding) return;
    addPollRelease.current?.();
    addPollRelease.current = null;
  }, [adding]);

  // After a successful add, clear the picker and pull the new roster in.
  useEffect(() => {
    if (!addState?.ok) return;
    addFormRef.current?.reset();
    router.refresh();
  }, [addState, router]);

  // Any form on the page (join, create, archive, leave) is a server action:
  // defer the poll so a tick can't cancel its POST mid-flight.
  useEffect(() => {
    const onAnySubmit = () => deferPolling(pollGate.current);
    document.addEventListener("submit", onAnySubmit, true);
    return () => document.removeEventListener("submit", onAnySubmit, true);
  }, []);

  useEffect(() => {
    if (groups.length === 0) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (pollingPaused(pollGate.current)) return;
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

    const releasePoll = pausePolling(pollGate.current);
    try {
      const res: GroupFormState | undefined = await sendGroupMessage(fd);

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
    } finally {
      releasePoll();
      setSending(false);
    }
  };

  const copy = (text: string, kind: "code" | "link") => {
    const write = navigator.clipboard?.writeText(text);
    if (!write) return;
    void write.then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <>
      <SuggestedGroups suggested={suggested} />

      {groups.length === 0 ? (
        <Card className="mt-8 p-8 text-center sm:p-16">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-slate-100">
            <Users className="h-6 w-6 text-slate-500" />
          </span>
          <h2 className="mt-4 font-display text-xl font-bold text-slate-900">
            No study groups yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
            {canCreate
              ? "Create a group for one of your courses below — then add the students you already teach. They get it in their list, plus an email and a text."
              : "When your tutor adds you to a group, it appears here — with a badge when there is something new. You can also join with the code your tutor shared, below."}
          </p>
        </Card>
      ) : (
        <div className="mt-8 lg:grid lg:grid-cols-[320px_1fr] lg:gap-6">
          {/* ── Groups list ─────────────────────────────────────────── */}
          <Card
            padded={false}
            className={cn(
              "flex max-h-[calc(100dvh-15rem)] flex-col overflow-hidden lg:h-[620px] lg:max-h-none",
              threadOpen ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="border-b border-slate-100 px-4 pb-3 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Study groups
                </h2>
                <Badge tone="brand">{groups.length}</Badge>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search groups"
                  aria-label="Search study groups"
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 transition focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                />
              </div>
            </div>

            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {visibleGroups.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs text-slate-500">
                  No group matches “{query.trim()}”.
                </li>
              ) : (
                visibleGroups.map((g) => {
                  const active = g.id === activeId;
                  const unread = g.unreadCount > 0;
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => selectGroup(g.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition duration-150",
                          active ? "bg-brand-50/70" : "hover:bg-slate-50",
                        )}
                      >
                        <GroupAvatar name={g.name} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-sm text-slate-900",
                                unread ? "font-bold" : "font-semibold",
                              )}
                            >
                              {g.name}
                            </span>
                            {g.lastMessage && (
                              <span
                                className={cn(
                                  "shrink-0 text-[11px]",
                                  unread
                                    ? "font-semibold text-brand-700"
                                    : "text-slate-400",
                                )}
                              >
                                {chatTimestamp(new Date(g.lastMessage.createdAt))}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-xs",
                                unread ? "text-slate-700" : "text-slate-500",
                              )}
                            >
                              {g.lastMessage
                                ? `${
                                    g.lastMessage.senderId === myId
                                      ? "You"
                                      : g.lastMessage.senderName
                                  }: ${g.lastMessage.body}`
                                : `${g.memberCount} member${
                                    g.memberCount === 1 ? "" : "s"
                                  } — say hello.`}
                            </span>
                            {unread && (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
                                {g.unreadCount > 99 ? "99+" : g.unreadCount}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </Card>

          {/* ── Feed ────────────────────────────────────────────────── */}
          <Card
            padded={false}
            className={cn(
              "relative h-[calc(100dvh-15rem)] min-h-96 flex-col overflow-hidden lg:h-[620px] lg:min-h-0",
              !threadOpen ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-3 sm:px-4">
              <button
                type="button"
                onClick={closeThread}
                aria-label="Back to groups"
                className="-ml-1 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <GroupAvatar name={meta?.name ?? "Group"} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {meta?.name ?? ""}
                </p>
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  {meta?.courseName && (
                    <span className="truncate">{meta.courseName}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowMembers(true)}
                    className="inline-flex shrink-0 items-center gap-1 rounded px-1 transition hover:text-slate-900"
                  >
                    <Users className="h-3 w-3" />
                    {meta?.memberCount ?? members.length}
                  </button>
                  {meta?.isArchived && <Badge tone="neutral">Archived</Badge>}
                </p>
              </div>

              {/* Owner tools: invite code + archive. Members: leave. */}
              {meta && (
                <div className="flex items-center gap-1.5">
                  {meta.isOwner && meta.joinCode && !meta.isArchived && (
                    <span className="hidden sm:inline-flex">
                      <JoinCodeChip code={meta.joinCode} />
                    </span>
                  )}
                  {meta.isOwner ? (
                    <form
                      action={archiveGroup}
                      onSubmit={(e) => {
                        if (
                          !window.confirm(
                            "Archive this group? Members keep the history but can't post.",
                          )
                        ) {
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
              className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-5 sm:px-5"
            >
              {rows.length === 0 && visiblePending.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <MessageSquare className="h-8 w-8 text-slate-300" />
                  <p className="mt-3 max-w-xs text-sm text-slate-500">
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
                      <MessageRow
                        key={row.message.id}
                        message={row.message}
                        myId={myId}
                        senderName={
                          nameByProfile.get(row.message.sender_id) ?? "Member"
                        }
                      />
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
              className="border-t border-slate-100 bg-white p-3 sm:p-4"
            >
              <div className="flex items-end gap-2">
                <textarea
                  name="body"
                  rows={1}
                  maxLength={2000}
                  disabled={meta?.isArchived}
                  placeholder={
                    meta?.isArchived
                      ? "This group is archived"
                      : "Message the group…"
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

            {/* ── Members sheet (covers the feed) ───────────────────── */}
            {showMembers && meta && (
              <div className="absolute inset-0 z-20 flex flex-col bg-white">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
                  <button
                    type="button"
                    onClick={() => setShowMembers(false)}
                    aria-label="Close members"
                    className="-ml-1 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      Group members
                    </p>
                    <p className="text-xs text-slate-500">
                      {meta.memberCount} member{meta.memberCount === 1 ? "" : "s"}
                      {meta.courseName ? ` · ${meta.courseName}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <ul className="space-y-1">
                    {members.map((member) => (
                      <li
                        key={member.profileId}
                        className="flex items-center gap-3 rounded-md px-1 py-2"
                      >
                        <GroupAvatar
                          name={member.name}
                          className="h-9 w-9 text-xs"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                          {member.name}
                          {member.profileId === myId && (
                            <span className="text-slate-400"> (you)</span>
                          )}
                        </span>
                        {member.role === "owner" && (
                          <Badge tone="petrol">Tutor</Badge>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Invite: the code still works for anyone not on the roster. */}
                  {meta.isOwner && !meta.isArchived && meta.joinCode && (
                    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-700">
                        Invite by code or link
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Anyone with this code can join — useful for a coursemate
                        who isn&apos;t on your roster yet.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-slate-900">
                          {meta.joinCode}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => copy(meta.joinCode, "code")}
                        >
                          {copied === "code" ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          Copy code
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            copy(
                              `${window.location.origin}/groups?code=${meta.joinCode}`,
                              "link",
                            )
                          }
                        >
                          {copied === "link" ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Link2 className="h-3.5 w-3.5" />
                          )}
                          Copy link
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Tutor adds students straight from their roster. */}
                  {meta.isOwner && !meta.isArchived && (
                    <form
                      ref={addFormRef}
                      action={addAction}
                      onSubmit={() => {
                        // Hold the poll for the whole action; released by the
                        // `adding` effect once the response lands.
                        addPollRelease.current?.();
                        addPollRelease.current = pausePolling(pollGate.current);
                      }}
                      className="mt-5 border-t border-slate-100 pt-4"
                    >
                      <input type="hidden" name="groupId" value={meta.id} />
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-slate-500" />
                        <p className="text-xs font-semibold text-slate-700">
                          Add students
                        </p>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Pick from the students you already teach. They get the
                        group in their list, plus an email and a text.
                      </p>

                      {addable.length === 0 ? (
                        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          Everyone on your roster is already in this group.
                        </p>
                      ) : (
                        <ul className="mt-3 max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-slate-200 p-1">
                          {addable.map((student) => (
                            <li key={student.id}>
                              <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 transition hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  name="studentId"
                                  value={student.id}
                                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                                />
                                <GroupAvatar
                                  name={student.name}
                                  className="h-7 w-7 text-[10px]"
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                                  {student.name}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}

                      {addState?.error && (
                        <p
                          className="mt-2 text-xs font-medium text-red-600"
                          role="alert"
                        >
                          {addState.error}
                        </p>
                      )}
                      {addState?.ok && addState.added === 0 && (
                        <p className="mt-2 text-xs text-slate-500">
                          Those students are already in the group.
                        </p>
                      )}
                      {addState?.ok && (addState.added ?? 0) > 0 && (
                        <p className="mt-2 text-xs font-medium text-emerald-700">
                          Added {addState.added} student
                          {addState.added === 1 ? "" : "s"}. They&apos;ve been
                          notified.
                        </p>
                      )}

                      {addable.length > 0 && (
                        <Button
                          type="submit"
                          size="sm"
                          disabled={adding}
                          className="mt-3"
                        >
                          {adding ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          )}
                          Add selected
                        </Button>
                      )}
                    </form>
                  )}

                  {!meta.isOwner && (
                    <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                      Your tutor adds students to this group. Ask them if a
                      coursemate should be here.
                    </p>
                  )}
                </div>
              </div>
            )}

          </Card>
        </div>
      )}
    </>
  );
}
