"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Hourglass,
  Plus,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import Section from "@/components/Section";
import {
  addDays,
  formatDayMonth,
  formatTime,
  fromDateKey,
  isoWeek,
  isSameDay,
  relativeWeekLabel,
  toDateKey,
  weekKey,
  weekRangeLabel,
  WEEKDAYS_SHORT,
} from "@/lib/dates";
import { ENTRY_TYPE_ICON } from "@/lib/entryIcons";
import { STATUS_LABEL } from "@/lib/entryStatus";
import { PICKS_FOR } from "@/lib/rewards";
import type { Category, Entry, WeekReview } from "@/lib/types";
import { REVIEW_OPENS_AFTER_DAYS, reviewWindow } from "@/lib/weekReview";

const SECTIONS_STORAGE_KEY = "caprese_plan_sections";
const NEUTRAL = "#6B7280"; // an entry without a project
const MAX_DAY_DOTS = 4;

type SectionKey = "backlog" | "tasks" | "events";

/** Which of the fold-away sections are open. They start folded — the week's
 * to-dos are the point; the rest is there when it is wanted — and remember
 * how they were left. */
function useOpenSections() {
  const [open, setOpen] = useState<Set<SectionKey>>(() => {
    try {
      const stored = localStorage.getItem(SECTIONS_STORAGE_KEY);
      if (stored) return new Set(JSON.parse(stored) as SectionKey[]);
    } catch {
      /* storage unavailable or unreadable — start folded */
    }
    return new Set();
  });
  useEffect(() => {
    try {
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify([...open]));
    } catch {
      /* not remembered, then */
    }
  }, [open]);
  const toggle = (key: SectionKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return { open, toggle };
}

function isDone(entry: Entry) {
  return entry.status === "done" || entry.status === "achieved";
}

/** "Wed 11" plus the time for a timed entry — where it sits in the week. */
function whenLabel(entry: Entry): string {
  if (!entry.start_at) return "";
  const start = new Date(entry.start_at);
  const day = `${WEEKDAYS_SHORT[(start.getDay() + 6) % 7]} ${start.getDate()}`;
  if (entry.all_day) return day;
  const end = entry.end_at ? new Date(entry.end_at) : null;
  return `${day} · ${formatTime(start)}${end ? `–${formatTime(end)}` : ""}`;
}

/**
 * The week plan: what this calendar week is for. Its to-dos lead — a to-do can
 * be given a week, and this is where that week's show up, get ticked off, or
 * move on. The week's tasks, goals and events fold away underneath for the
 * review, and at the end of the week it is closed: a good week, or not.
 *
 * `panel` is the side panel next to the desktop grid, `page` the phone's own
 * view (which adds the week at a glance, since no week grid fits there).
 */
export default function WeekPlan({
  variant,
  weekStart,
  now,
  entries,
  categoryById,
  review,
  reviewBusy,
  onPrevWeek,
  onNextWeek,
  onClosePanel,
  onOpenEntry,
  onOpenDay,
  onToggle,
  onMoveTodos,
  onAddTodo,
  onCloseWeek,
  onReopenWeek,
}: {
  variant: "panel" | "page";
  weekStart: Date;
  now: Date;
  entries: Entry[];
  categoryById: Map<string, Category>;
  review: WeekReview | undefined;
  reviewBusy: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onClosePanel?: () => void;
  onOpenEntry: (entry: Entry) => void;
  onOpenDay: (day: Date) => void;
  /** Tick an entry off, or bring a resolved one back. */
  onToggle: (entry: Entry) => void;
  /** Give to-dos a week (its Monday as yyyy-mm-dd) or take it away (null). */
  onMoveTodos: (todos: Entry[], week: string | null) => void;
  /** Quick add: a to-do for this week. Resolves once it is saved. */
  onAddTodo: (title: string) => Promise<boolean>;
  onCloseWeek: (successful: boolean) => void;
  onReopenWeek: () => void;
}) {
  const { open, toggle } = useOpenSections();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const key = toDateKey(weekStart);
  const kw = isoWeek(weekStart);
  const isCurrent = key === weekKey(now);
  const nextWeek = addDays(weekStart, 7);
  const window_ = reviewWindow(weekStart, now);

  const data = useMemo(() => {
    const weekEnd = addDays(weekStart, 7).getTime();
    const from = weekStart.getTime();
    const todos: Entry[] = [];
    const leftovers: Entry[] = [];
    const backlog: Entry[] = [];
    const tasks: Entry[] = [];
    const events: Entry[] = [];
    for (const e of entries) {
      if (e.type === "todo") {
        if (e.plan_week === key) todos.push(e);
        else if (e.status !== "active") continue;
        else if (!e.plan_week) backlog.push(e);
        // Still open from a week that is over: the current week picks it up.
        else if (isCurrent && e.plan_week < key) leftovers.push(e);
        continue;
      }
      if (!e.start_at) continue;
      const start = new Date(e.start_at).getTime();
      const end = e.end_at ? new Date(e.end_at).getTime() : start + 1;
      if (start >= weekEnd || end <= from) continue;
      (e.type === "event" ? events : tasks).push(e);
    }
    const rank = (e: Entry) => (e.status === "active" ? 0 : isDone(e) ? 1 : 2);
    todos.sort(
      (a, b) => rank(a) - rank(b) || (a.created_at < b.created_at ? -1 : 1),
    );
    leftovers.sort((a, b) =>
      a.plan_week === b.plan_week
        ? a.created_at < b.created_at
          ? -1
          : 1
        : (a.plan_week ?? "") < (b.plan_week ?? "")
          ? -1
          : 1,
    );
    backlog.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const byStart = (a: Entry, b: Entry) =>
      (a.start_at ?? "") < (b.start_at ?? "") ? -1 : 1;
    tasks.sort(byStart);
    events.sort(byStart);

    // Cancelled items are out of the count: they are neither done nor owed.
    const counted = (list: Entry[]) =>
      list.filter((e) => e.status !== "cancelled" && e.status !== "missed");
    const todoCounted = counted(todos);
    const taskCounted = counted(tasks);
    return {
      todos,
      leftovers,
      backlog,
      tasks,
      events,
      todoTotal: todoCounted.length,
      todoDone: todoCounted.filter(isDone).length,
      taskTotal: taskCounted.length,
      taskDone: taskCounted.filter(isDone).length,
    };
  }, [entries, key, weekStart, isCurrent]);

  /** The week at a glance: per day, the colours of what is on. */
  const dayDots = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const from = day.getTime();
      const to = addDays(day, 1).getTime();
      const colors: string[] = [];
      for (const e of [...data.events, ...data.tasks]) {
        const start = new Date(e.start_at!).getTime();
        const end = e.end_at ? new Date(e.end_at).getTime() : start + 1;
        if (start >= to || end <= from) continue;
        colors.push(
          (e.category_id && categoryById.get(e.category_id)?.color) || NEUTRAL,
        );
      }
      return { day, colors };
    });
  }, [weekStart, data.events, data.tasks, categoryById]);

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    if (await onAddTodo(title)) setNewTitle("");
    setAdding(false);
  }

  const project = (entry: Entry) =>
    entry.category_id ? categoryById.get(entry.category_id) : undefined;

  const summary =
    data.todoTotal === 0
      ? "No to-dos planned yet"
      : `${data.todoDone} of ${data.todoTotal} ${
          data.todoTotal === 1 ? "to-do" : "to-dos"
        } done`;
  const sideNote = [
    data.taskTotal > 0
      ? `${data.taskDone}/${data.taskTotal} ${data.taskTotal === 1 ? "task" : "tasks"}`
      : null,
    data.events.length > 0
      ? `${data.events.length} ${data.events.length === 1 ? "event" : "events"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const weekNav = (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={onPrevWeek}
        className="icon-btn"
        aria-label="Previous week"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onNextWeek}
        className="icon-btn"
        aria-label="Next week"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <div
      className={
        variant === "panel"
          ? "flex h-full min-h-0 flex-col"
          : "min-h-0 flex-1 overflow-y-auto overscroll-contain"
      }
    >
      {variant === "panel" && (
        <div className="flex shrink-0 items-center gap-1 pb-1 pl-5 pr-2 pt-3">
          <div className="min-w-0 flex-1">
            <p className="section-label">Week plan</p>
            <h2 className="flex items-baseline gap-2 truncate text-lg font-semibold text-neutral-50">
              KW {kw}
              <span className="truncate text-sm font-normal text-neutral-500">
                {weekRangeLabel(weekStart)}
              </span>
            </h2>
          </div>
          {weekNav}
          {onClosePanel && (
            <button
              type="button"
              onClick={onClosePanel}
              className="icon-btn"
              aria-label="Close the week plan"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      )}

      <div
        className={
          variant === "panel"
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2"
            : "mx-auto w-full max-w-xl px-4 pt-4 pb-page"
        }
      >
        {/* ---- the week in one look ---- */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-4 p-4">
            <ProgressRing done={data.todoDone} total={data.todoTotal} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-neutral-50">
                {relativeWeekLabel(weekStart, now)}
                {review && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold leading-4 ${
                      review.successful
                        ? "bg-accent/20 text-accent-bright"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {review.successful ? "Good week" : "Closed"}
                  </span>
                )}
              </p>
              <p className="text-sm text-neutral-400">{summary}</p>
              {sideNote && <p className="text-xs text-neutral-500">{sideNote}</p>}
            </div>
            {variant === "page" && weekNav}
          </div>

          {variant === "page" && (
            <div
              className="grid grid-cols-7 border-t border-neutral-800 px-1.5 pb-2 pt-1.5"
              role="group"
              aria-label="Days of this week"
            >
              {dayDots.map(({ day, colors }, i) => {
                const today = isSameDay(day, now);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onOpenDay(day)}
                    aria-label={`Open ${WEEKDAYS_SHORT[i]} ${day.getDate()}${
                      colors.length > 0
                        ? ` — ${colors.length} ${colors.length === 1 ? "entry" : "entries"}`
                        : ""
                    }`}
                    className="flex flex-col items-center gap-1 rounded-xl py-1.5 transition-opacity active:opacity-50"
                  >
                    <span
                      className={`text-[0.6875rem] font-medium leading-4 ${
                        today ? "text-accent-bright" : "text-neutral-500"
                      }`}
                    >
                      {WEEKDAYS_SHORT[i]}
                    </span>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                        today ? "bg-accent text-white" : "text-neutral-100"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    <span className="flex h-1.5 items-center gap-[3px]">
                      {colors.slice(0, MAX_DAY_DOTS).map((color, d) => (
                        <span
                          key={d}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- this week's to-dos ---- */}
        <section className="mt-5" aria-label="To-dos of this week">
          <h3 className="flex items-baseline gap-2 px-1 pb-2 text-base font-semibold text-neutral-50">
            To-dos
            {data.todoTotal > 0 && (
              <span className="text-sm font-normal tabular-nums text-neutral-500">
                {data.todoDone}/{data.todoTotal}
              </span>
            )}
          </h3>

          {data.todos.length > 0 ? (
            <ul className="card list-group overflow-hidden">
              {data.todos.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  meta={project(entry)?.name}
                  onOpen={() => onOpenEntry(entry)}
                  onToggle={() => onToggle(entry)}
                  action={
                    entry.status === "active" && (
                      <button
                        type="button"
                        onClick={() => onMoveTodos([entry], toDateKey(nextWeek))}
                        disabled={entry.id.startsWith("temp-")}
                        className="icon-btn disabled:opacity-40"
                        aria-label={`Move to KW ${isoWeek(nextWeek)}: ${entry.title}`}
                        title={`Not this week — move to KW ${isoWeek(nextWeek)}`}
                      >
                        <ChevronsRight className="h-[18px] w-[18px]" />
                      </button>
                    )
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="card px-4 py-5 text-center text-sm text-neutral-500">
              Nothing planned for KW {kw} yet.
            </p>
          )}

          <form onSubmit={submitNew} className="mt-2 flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`Add a to-do for KW ${kw}`}
              aria-label={`Add a to-do for KW ${kw}`}
              enterKeyHint="done"
              autoComplete="off"
              className="field min-w-0 flex-1"
            />
            <button
              type="submit"
              disabled={adding || !newTitle.trim()}
              className="btn-plain shrink-0 px-3.5"
              aria-label="Add the to-do"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>

          {data.leftovers.length > 0 && (
            <div className="mt-4">
              <div className="flex min-h-9 items-center justify-between gap-2 px-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Left from earlier weeks
                  <span className="ml-1.5 font-normal text-neutral-600">
                    {data.leftovers.length}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => onMoveTodos(data.leftovers, key)}
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-accent-bright transition-opacity active:opacity-50"
                >
                  Move all here
                </button>
              </div>
              <ul className="card list-group overflow-hidden">
                {data.leftovers.map((entry) => (
                  <Row
                    key={entry.id}
                    entry={entry}
                    meta={project(entry)?.name}
                    flag={`KW ${isoWeek(fromDateKey(entry.plan_week!))}`}
                    onOpen={() => onOpenEntry(entry)}
                    onToggle={() => onToggle(entry)}
                    action={
                      <button
                        type="button"
                        onClick={() => onMoveTodos([entry], key)}
                        className="icon-btn"
                        aria-label={`Move to KW ${kw}: ${entry.title}`}
                        title={`Move to KW ${kw}`}
                      >
                        <Plus className="h-[18px] w-[18px]" />
                      </button>
                    }
                  />
                ))}
              </ul>
            </div>
          )}

          {data.backlog.length > 0 && (
            <Section
              title="No week yet"
              count={data.backlog.length}
              collapsed={!open.has("backlog")}
              onToggle={() => toggle("backlog")}
              className="mt-3"
            >
              <ul className="card list-group overflow-hidden">
                {data.backlog.map((entry) => (
                  <Row
                    key={entry.id}
                    entry={entry}
                    meta={project(entry)?.name}
                    onOpen={() => onOpenEntry(entry)}
                    onToggle={() => onToggle(entry)}
                    action={
                      <button
                        type="button"
                        onClick={() => onMoveTodos([entry], key)}
                        disabled={entry.id.startsWith("temp-")}
                        className="icon-btn disabled:opacity-40"
                        aria-label={`Add to KW ${kw}: ${entry.title}`}
                        title={`Add to KW ${kw}`}
                      >
                        <Plus className="h-[18px] w-[18px]" />
                      </button>
                    }
                  />
                ))}
              </ul>
            </Section>
          )}
        </section>

        {/* ---- the rest of the week, folded away ---- */}
        {data.tasks.length > 0 && (
          <Section
            title="Tasks & goals"
            count={data.tasks.length}
            collapsed={!open.has("tasks")}
            onToggle={() => toggle("tasks")}
            className="mt-4"
          >
            <ul className="card list-group overflow-hidden">
              {data.tasks.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  meta={[whenLabel(entry), project(entry)?.name]
                    .filter(Boolean)
                    .join(" · ")}
                  onOpen={() => onOpenEntry(entry)}
                  onToggle={() => onToggle(entry)}
                />
              ))}
            </ul>
          </Section>
        )}

        {data.events.length > 0 && (
          <Section
            title="Events"
            count={data.events.length}
            collapsed={!open.has("events")}
            onToggle={() => toggle("events")}
            className={data.tasks.length > 0 ? "mt-1" : "mt-4"}
          >
            <ul className="card list-group overflow-hidden">
              {data.events.map((entry) => {
                const past =
                  entry.end_at != null &&
                  new Date(entry.end_at).getTime() <= now.getTime();
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onOpenEntry(entry)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-opacity active:opacity-60 ${
                        past ? "opacity-55" : ""
                      }`}
                    >
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: project(entry)?.color ?? NEUTRAL }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-neutral-100">
                          {entry.title}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {[whenLabel(entry), project(entry)?.name]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* ---- closing the week ---- */}
        <section className="mt-5" aria-label="Week review">
          {review ? (
            <div
              className={`flex items-center gap-3 rounded-2xl p-4 ${
                review.successful ? "bg-accent/15" : "bg-neutral-900"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  review.successful
                    ? "bg-accent text-white"
                    : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {review.successful ? (
                  <Trophy className="h-5 w-5" />
                ) : (
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-50">
                  {review.successful ? "A good week" : "Week closed"}
                </p>
                <p className="text-xs text-neutral-400">
                  {review.successful
                    ? `Closed — it earned ${PICKS_FOR.weekReview} picks.`
                    : "Closed as not a good one. On to the next."}
                </p>
              </div>
              <button
                type="button"
                onClick={onReopenWeek}
                disabled={reviewBusy}
                className="btn-ghost shrink-0 px-2.5 text-xs disabled:opacity-40"
                title="Reopen this week"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reopen
              </button>
            </div>
          ) : window_ === "open" ? (
            <div className="card p-4">
              <p className="text-base font-semibold text-neutral-50">
                How was KW {kw}?
              </p>
              <p className="mt-0.5 text-sm text-neutral-400">
                {[summary, sideNote].filter(Boolean).join(" · ")}. Close the week
                when you are done with it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onCloseWeek(true)}
                  disabled={reviewBusy}
                  className="btn-primary flex-1 whitespace-nowrap"
                >
                  <Trophy className="h-4 w-4" />
                  A good week
                  <span className="rounded-full bg-white/20 px-1.5 text-xs font-semibold leading-5">
                    +{PICKS_FOR.weekReview}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onCloseWeek(false)}
                  disabled={reviewBusy}
                  className="btn-plain flex-1 whitespace-nowrap"
                >
                  Not this time
                </button>
              </div>
            </div>
          ) : window_ === "running" ? (
            <p className="flex items-center gap-2.5 rounded-2xl bg-neutral-900 px-4 py-3.5 text-sm text-neutral-500">
              <Hourglass className="h-4 w-4 shrink-0" />
              The review opens on Friday,{" "}
              {formatDayMonth(addDays(weekStart, REVIEW_OPENS_AFTER_DAYS))} — a good
              week earns {PICKS_FOR.weekReview} picks.
            </p>
          ) : window_ === "expired" ? (
            <p className="rounded-2xl bg-neutral-900 px-4 py-3.5 text-sm text-neutral-500">
              This week went by without a review.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** To-dos done out of the week's total, as a ring. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? done / total : 0;
  const complete = total > 0 && done === total;
  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={total > 0 ? `${done} of ${total} to-dos done` : "No to-dos planned"}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-neutral-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          className="stroke-accent transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums text-neutral-50">
        {complete ? (
          <Check className="h-6 w-6 text-accent-bright" strokeWidth={3} />
        ) : total > 0 ? (
          `${done}/${total}`
        ) : (
          <span className="text-neutral-600">–</span>
        )}
      </span>
    </span>
  );
}

/**
 * One line of the plan: the check (square for a to-do, round for a task, a
 * trophy for a goal — filled once it is done), the title, and room for one
 * action. Tapping the title opens the entry.
 */
function Row({
  entry,
  meta,
  flag,
  onOpen,
  onToggle,
  action,
}: {
  entry: Entry;
  meta?: string;
  /** A short marker in the accent colour (the week a leftover belongs to). */
  flag?: string;
  onOpen: () => void;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  const done = isDone(entry);
  const resolved = entry.status !== "active";
  const isGoal = entry.type === "goal";
  const pending = entry.id.startsWith("temp-");
  const TypeIcon = ENTRY_TYPE_ICON[entry.type];
  const label = resolved ? "Reopen" : isGoal ? "Mark achieved" : "Mark done";
  return (
    <li className="flex items-center pl-0.5 pr-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={`${label}: ${entry.title}`}
        title={label}
        className="group/check flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40"
      >
        <span
          className={`flex h-[22px] w-[22px] items-center justify-center border-[1.5px] transition-colors ${
            entry.type === "todo" ? "rounded-[7px]" : "rounded-full"
          } ${
            done
              ? "border-accent bg-accent text-white"
              : resolved
                ? "border-neutral-700 text-neutral-600"
                : "border-neutral-600 text-transparent group-hover/check:border-accent-bright group-hover/check:text-accent-bright"
          }`}
        >
          {isGoal ? (
            <Trophy
              className={`h-3 w-3 ${done ? "text-white" : "text-neutral-500 group-hover/check:text-accent-bright"}`}
            />
          ) : resolved && !done ? (
            <X className="h-3 w-3" strokeWidth={3} />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpen}
        disabled={pending}
        className="min-w-0 flex-1 py-2.5 pr-2 text-left"
      >
        <span
          className={`line-clamp-2 text-sm leading-snug ${
            resolved ? "text-neutral-500 line-through" : "text-neutral-100"
          }`}
        >
          {entry.title}
        </span>
        {(meta || flag || (resolved && !done) || entry.type !== "todo") && (
          <span className="mt-0.5 flex min-w-0 items-center gap-x-2 text-xs text-neutral-500">
            {entry.type !== "todo" && (
              <TypeIcon className="h-3 w-3 shrink-0" aria-label={entry.type} />
            )}
            {flag && (
              <span className="shrink-0 font-medium text-accent-bright">{flag}</span>
            )}
            {resolved && !done && (
              <span className="shrink-0 font-medium text-neutral-400">
                {STATUS_LABEL[entry.status]}
              </span>
            )}
            {meta && <span className="min-w-0 truncate">{meta}</span>}
          </span>
        )}
      </button>
      {action && <span className="flex shrink-0 items-center">{action}</span>}
    </li>
  );
}
