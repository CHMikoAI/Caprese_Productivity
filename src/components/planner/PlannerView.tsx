"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Ban,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderCog,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import {
  createEntry,
  deleteEntry,
  postponeEntry,
  restoreEntry,
  setEntryStatus,
  updateEntry,
} from "@/app/actions";
import EntryModal, {
  type EntryFormResult,
} from "@/components/calendar/EntryModal";
import {
  createInitial,
  editInitial,
} from "@/components/calendar/entryModalInitial";
import PageHeader from "@/components/PageHeader";
import PlanModal from "@/components/planner/PlanModal";
import ProjectChips from "@/components/ProjectChips";
import ProjectsModal from "@/components/tasks/ProjectsModal";
import RewardToast, { useRewardToast } from "@/components/RewardToast";
import Section from "@/components/Section";
import Toast, { useToast } from "@/components/Toast";
import { formatDMY, formatTime, nextHalfHour } from "@/lib/dates";
import { ENTRY_TYPE_ICON } from "@/lib/entryIcons";
import { isResolved, phaseOf, STATUS_LABEL } from "@/lib/entryStatus";
import { scrollAppToTop } from "@/lib/scroll";
import { useShortcuts } from "@/lib/useShortcuts";
import { type Category, type Entry, type EntryStatus } from "@/lib/types";

type ModalState = { mode: "create" } | { mode: "edit"; entry: Entry };
type TypeFilter = "all" | "task" | "todo" | "goal";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "task", label: "Tasks" },
  { key: "todo", label: "To do" },
  { key: "goal", label: "Goals" },
];

// How far ahead "Upcoming" looks. A week keeps the list short and actionable;
// widen it when you want the bigger picture. Rolling windows (not calendar
// weeks/months) so the horizon never collapses to "almost nothing" on a Sunday.
type Horizon = "week" | "month" | "year";

const HORIZONS: { key: Horizon; label: string; noun: string }[] = [
  { key: "week", label: "Week", noun: "week" },
  { key: "month", label: "Month", noun: "month" },
  { key: "year", label: "Year", noun: "year" },
];

const NEXT_HORIZON: Record<Horizon, Horizon | null> = {
  week: "month",
  month: "year",
  year: null,
};

const listClass = "flex flex-col gap-2";

/** What the toast says once an entry has been resolved (or brought back). */
const STATUS_TOAST: Record<EntryStatus, string> = {
  active: "Reopened",
  done: "Marked done",
  cancelled: "Cancelled",
  achieved: "Goal achieved",
  missed: "Marked not achieved",
};

function horizonEnd(from: Date, horizon: Horizon): Date {
  const d = new Date(from);
  if (horizon === "week") d.setDate(d.getDate() + 7);
  else if (horizon === "month") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** A todo's deadline date, recovered from its next-midnight end_at. */
function todoDeadline(entry: Entry): Date | null {
  return entry.end_at ? new Date(new Date(entry.end_at).getTime() - 1) : null;
}

/** " – 16.07.2026" for multi-day all-day entries, "" for single-day ones. */
function allDayRangeSuffix(entry: Entry): string {
  if (!entry.start_at || !entry.end_at) return "";
  const start = new Date(entry.start_at);
  const endInclusive = new Date(new Date(entry.end_at).getTime() - 1);
  const spansDays =
    endInclusive.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
  return spansDays ? ` – ${formatDMY(endInclusive)}` : "";
}

export default function PlannerView({
  initialEntries,
  initialCategories,
  archivedPartnerGoals = 0,
}: {
  initialEntries: Entry[];
  initialCategories: Category[];
  /** Goals on the archived Partner track — the archive links to them. */
  archivedPartnerGoals?: number;
}) {
  const router = useRouter();
  const { message: toast, show: showToast, dismiss: dismissToast } = useToast();
  const { reward, showReward } = useRewardToast();

  const [entries, setEntries] = useState(initialEntries);
  const [categories, setCategories] = useState(initialCategories);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [planEntry, setPlanEntry] = useState<Entry | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  // Collapsed section keys ("review" | "upcoming" | "toPlan" | "todo").
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [now, setNow] = useState(() => new Date());

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [horizon, setHorizon] = useState<Horizon>("week");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showEvents, setShowEvents] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [busy, setBusy] = useState(false);

  const quickAddRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function openSearch() {
    setSearchOpen(true);
    scrollAppToTop();
    // Focus also when the field is already there (autoFocus only fires on mount).
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  useShortcuts({
    n: () => setModal({ mode: "create" }),
    q: () => {
      // Quick add lives in the To do section — make sure it's expanded, then
      // focus its input on the next frame (it may have just mounted).
      setCollapsed((prev) => {
        if (!prev.has("todo")) return prev;
        const next = new Set(prev);
        next.delete("todo");
        return next;
      });
      requestAnimationFrame(() => quickAddRef.current?.focus());
    },
    "/": openSearch,
  });

  // Re-adopt server state whenever a fresh payload arrives (router.refresh).
  const [syncedEntries, setSyncedEntries] = useState(initialEntries);
  if (syncedEntries !== initialEntries) {
    setSyncedEntries(initialEntries);
    setEntries(initialEntries);
  }
  const [syncedCategories, setSyncedCategories] = useState(initialCategories);
  if (syncedCategories !== initialCategories) {
    setSyncedCategories(initialCategories);
    setCategories(initialCategories);
  }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  // ----- grouping -----
  // review:   dated task/goal whose time has passed — decide done/plan/cancel
  // upcoming: dated task/goal in the future (+ future events when toggled on)
  // toPlan:   task/goal without a date — drag them onto the calendar or plan here
  // todos:    reminders (never on the calendar), sorted by deadline
  // archive:  resolved (done/cancelled/achieved/missed)
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (e: Entry) =>
      (!q || e.title.toLowerCase().includes(q)) &&
      (projectFilter === "all" || e.category_id === projectFilter);

    const review: Entry[] = [];
    const upcoming: Entry[] = [];
    const toPlan: Entry[] = [];
    const todos: Entry[] = [];
    const archive: Entry[] = [];
    for (const e of entries) {
      if (!matches(e)) continue;
      if (e.type === "todo") {
        if (typeFilter !== "all" && typeFilter !== "todo") continue;
        if (isResolved(e.status)) archive.push(e);
        else todos.push(e);
        continue;
      }
      if (e.type === "event") {
        if (
          showEvents &&
          typeFilter === "all" &&
          phaseOf(e, now) === "event-upcoming"
        ) {
          upcoming.push(e);
        }
        continue;
      }
      if (typeFilter !== "all" && e.type !== typeFilter) continue;
      const phase = phaseOf(e, now);
      if (phase === "open") review.push(e);
      else if (phase === "upcoming") upcoming.push(e);
      else if (phase === "unplanned") toPlan.push(e);
      else archive.push(e);
    }
    const byStart = (a: Entry, b: Entry) =>
      (a.start_at ?? "") < (b.start_at ?? "") ? -1 : 1;
    review.sort(byStart);
    upcoming.sort(byStart);
    toPlan.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    // Todos: soonest deadline first, undated last, then newest.
    todos.sort((a, b) => {
      const ka = a.end_at ?? "￿";
      const kb = b.end_at ?? "￿";
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
    archive.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    // Keep "Upcoming" to the chosen horizon; anything further out is counted
    // separately so it can be revealed on demand instead of flooding the list.
    const cutoff = horizonEnd(now, horizon).getTime();
    const withinHorizon: Entry[] = [];
    const later: Entry[] = [];
    for (const e of upcoming) {
      const start = e.start_at ? new Date(e.start_at).getTime() : 0;
      (start <= cutoff ? withinHorizon : later).push(e);
    }

    return { review, upcoming: withinHorizon, later, toPlan, todos, archive };
  }, [entries, now, typeFilter, projectFilter, showEvents, search, horizon]);

  // ----- mutations (optimistic; a failure puts back exactly what it changed) -----

  function patchLocal(id: string, patch: Partial<Entry>) {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  /**
   * Resolve an entry (done / cancelled / achieved / missed) or reopen it. One
   * tap is all it takes, so a resolution always comes with an Undo.
   */
  function resolve(entry: Entry, status: EntryStatus) {
    const previous = entry.status;
    patchLocal(entry.id, { status });
    setEntryStatus(entry.id, status)
      .then(({ picksAwarded }) => {
        router.refresh();
        if (picksAwarded > 0) showReward(picksAwarded);
      })
      .catch(() => {
        patchLocal(entry.id, { status: previous });
        showToast("Could not update the entry.");
      });
    showToast(
      STATUS_TOAST[status],
      status === "active"
        ? undefined
        : { label: "Undo", run: () => resolve({ ...entry, status }, "active") },
    );
  }

  /** Plan dialog result: a slot (or whole days). Also revives overdue items. */
  function schedule(entry: Entry, start: Date, end: Date, allDay: boolean) {
    const before = {
      start_at: entry.start_at,
      end_at: entry.end_at,
      all_day: entry.all_day,
      status: entry.status,
    };
    patchLocal(entry.id, {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: allDay,
      status: "active",
    });
    setPlanEntry(null);
    postponeEntry(entry.id, start.toISOString(), end.toISOString(), allDay)
      .then(() => router.refresh())
      .catch(() => {
        patchLocal(entry.id, before);
        showToast("Could not plan the entry.");
      });
  }

  /** Plan dialog result: no date — park the entry under "To plan". */
  function unschedule(entry: Entry) {
    const before = {
      start_at: entry.start_at,
      end_at: entry.end_at,
      all_day: entry.all_day,
      status: entry.status,
    };
    const patch = {
      start_at: null,
      end_at: null,
      all_day: false,
      status: "active" as const,
    };
    patchLocal(entry.id, patch);
    setPlanEntry(null);
    updateEntry(entry.id, patch)
      .then(() => router.refresh())
      .catch(() => {
        patchLocal(entry.id, before);
        showToast("Could not move the entry.");
      });
  }

  /** Delete an entry. It is gone for good on the server, so offer the way back. */
  function remove(entry: Entry) {
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    const deleted = deleteEntry(entry.id)
      .then(() => router.refresh())
      .catch(() => {
        setEntries((list) =>
          list.some((e) => e.id === entry.id) ? list : [entry, ...list],
        );
        showToast("Could not delete the entry.");
      });
    showToast("Entry deleted", {
      label: "Undo",
      run: () => {
        setEntries((list) =>
          list.some((e) => e.id === entry.id) ? list : [entry, ...list],
        );
        // Wait for the delete to land first, or the two would cross.
        deleted
          .then(() => restoreEntry(entry))
          .then(() => router.refresh())
          .catch(() => {
            setEntries((list) => list.filter((e) => e.id !== entry.id));
            showToast("Could not restore the entry.");
          });
      },
    });
  }

  // Quick add creates a To do (a short reminder with no deadline). Anything
  // that needs a date/time is created via the full "New" dialog instead.
  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const created = await createEntry({
        type: "todo",
        title,
        categoryId: newCategoryId || null,
        startAt: null,
        endAt: null,
        allDay: true,
        description: null,
      });
      setEntries((list) => [created, ...list]);
      setNewTitle("");
      router.refresh();
    } catch {
      showToast("Could not add the to-do.");
    }
    setBusy(false);
  }

  function onModalSave(result: EntryFormResult) {
    if (!modal) return;
    const current = modal;
    setModal(null);
    if (current.mode === "create") {
      const tempId = `temp-${Date.now()}`;
      const optimistic: Entry = {
        id: tempId,
        type: result.type,
        title: result.title,
        category_id: result.categoryId,
        start_at: result.startAt,
        end_at: result.endAt,
        all_day: result.allDay,
        description: result.description,
        status: "active",
        created_at: new Date().toISOString(),
      };
      setEntries((list) => [optimistic, ...list]);
      createEntry({
        type: result.type,
        title: result.title,
        categoryId: result.categoryId,
        startAt: result.startAt,
        endAt: result.endAt,
        allDay: result.allDay,
        description: result.description,
      })
        .then((created) => {
          setEntries((list) => list.map((e) => (e.id === tempId ? created : e)));
          router.refresh();
        })
        .catch(() => {
          setEntries((list) => list.filter((e) => e.id !== tempId));
          showToast("Could not create the entry.");
        });
    } else {
      const entry = current.entry;
      const patch = {
        type: result.type,
        title: result.title,
        category_id: result.categoryId,
        start_at: result.startAt,
        end_at: result.endAt,
        all_day: result.allDay,
        description: result.description,
      };
      patchLocal(entry.id, patch);
      updateEntry(entry.id, patch)
        .then(() => router.refresh())
        .catch(() => {
          patchLocal(entry.id, {
            type: entry.type,
            title: entry.title,
            category_id: entry.category_id,
            start_at: entry.start_at,
            end_at: entry.end_at,
            all_day: entry.all_day,
            description: entry.description,
          });
          showToast("Could not save the entry.");
        });
    }
  }

  // ----- rows -----

  /** A row for an entry that can still be resolved: the check, then Plan / Cancel. */
  function activeRow(
    entry: Entry,
    opts: { overdue?: boolean; plan?: "icon" | "primary" | "none" } = {},
  ) {
    const isGoal = entry.type === "goal";
    const plan = entry.type === "todo" ? "none" : (opts.plan ?? "icon");
    // Entries still being created have no id on the server to act on yet.
    const pending = entry.id.startsWith("temp-");
    return (
      <EntryRow
        key={entry.id}
        entry={entry}
        project={entry.category_id ? categoryById.get(entry.category_id) : undefined}
        overdue={opts.overdue}
        onOpen={() => setModal({ mode: "edit", entry })}
        leading={
          <CheckButton
            entry={entry}
            disabled={pending}
            onClick={() => resolve(entry, isGoal ? "achieved" : "done")}
          />
        }
        actions={
          <>
            {plan === "primary" && (
              <button
                onClick={() => setPlanEntry(entry)}
                disabled={pending}
                className="mr-1 flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-2 text-xs font-semibold text-accent-bright transition-opacity active:opacity-60 disabled:opacity-40 sm:py-1.5"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Plan
              </button>
            )}
            {plan === "icon" && (
              <button
                onClick={() => setPlanEntry(entry)}
                disabled={pending}
                className="icon-btn disabled:opacity-40"
                aria-label="Plan"
                title="Plan — give it a new date"
              >
                <CalendarClock className="h-[18px] w-[18px]" />
              </button>
            )}
            <button
              onClick={() => resolve(entry, isGoal ? "missed" : "cancelled")}
              disabled={pending}
              className="icon-btn disabled:opacity-40"
              aria-label={isGoal ? "Not achieved" : "Cancel"}
              title={isGoal ? "Not achieved" : "Cancel — drop it"}
            >
              {isGoal ? (
                <X className="h-[18px] w-[18px]" />
              ) : (
                <Ban className="h-[18px] w-[18px]" />
              )}
            </button>
          </>
        }
      />
    );
  }

  /** Events only show up for reference (the Events toggle): nothing to resolve. */
  function eventRow(entry: Entry) {
    return (
      <EntryRow
        key={entry.id}
        entry={entry}
        project={entry.category_id ? categoryById.get(entry.category_id) : undefined}
        onOpen={() => setModal({ mode: "edit", entry })}
        leading={<TypeGlyph entry={entry} />}
        actions={
          <button
            onClick={() => remove(entry)}
            className="icon-btn"
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        }
      />
    );
  }

  function archiveRow(entry: Entry) {
    return (
      <EntryRow
        key={entry.id}
        entry={entry}
        project={entry.category_id ? categoryById.get(entry.category_id) : undefined}
        struck
        onOpen={() => setModal({ mode: "edit", entry })}
        leading={<TypeGlyph entry={entry} />}
        actions={
          <>
            <span className="mr-1 hidden rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400 sm:inline">
              {STATUS_LABEL[entry.status]}
            </span>
            <button
              onClick={() => resolve(entry, "active")}
              className="icon-btn"
              aria-label="Reopen"
              title="Reopen"
            >
              <RotateCcw className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => remove(entry)}
              className="icon-btn"
              aria-label="Delete"
              title="Delete"
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </button>
          </>
        }
      />
    );
  }

  // ----- sections (composed into the two-column board below) -----

  const reviewSection = (
    <Section
      title="To review"
      count={groups.review.length}
      hint="Time's up — tick it off, plan it again, or cancel it."
      collapsed={collapsed.has("review")}
      onToggle={() => toggleSection("review")}
    >
      <ul className={listClass}>
        {groups.review.length === 0 ? (
          <EmptyHint text="Nothing to review — all caught up." />
        ) : (
          groups.review.map((entry) => activeRow(entry, { overdue: true }))
        )}
      </ul>
    </Section>
  );

  const horizonNoun =
    HORIZONS.find((h) => h.key === horizon)?.noun ?? "week";
  const nextHorizon = NEXT_HORIZON[horizon];

  // Week / Month / Year — how far ahead Upcoming looks. Sits in the section
  // header because it only scopes this list, not the whole planner.
  const horizonToggle = (
    <div className="segmented shrink-0">
      {HORIZONS.map((h) => (
        <button
          key={h.key}
          onClick={() => setHorizon(h.key)}
          aria-pressed={horizon === h.key}
        >
          {h.label}
        </button>
      ))}
    </div>
  );

  const upcomingSection = (
    <Section
      title="Upcoming"
      count={groups.upcoming.length}
      collapsed={collapsed.has("upcoming")}
      onToggle={() => toggleSection("upcoming")}
      action={horizonToggle}
    >
      <ul className={listClass}>
        {groups.upcoming.length === 0 ? (
          <EmptyHint text={`Nothing in the next ${horizonNoun}.`} />
        ) : (
          groups.upcoming.map((entry) =>
            entry.type === "event" ? eventRow(entry) : activeRow(entry),
          )
        )}
        {groups.later.length > 0 &&
          (nextHorizon ? (
            <li>
              <button
                onClick={() => setHorizon(nextHorizon)}
                className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-center text-xs font-medium text-accent-bright transition-opacity active:opacity-60"
              >
                +{groups.later.length} beyond this {horizonNoun} — show{" "}
                {nextHorizon === "month" ? "the month" : "the year"}
              </button>
            </li>
          ) : (
            <li className="px-4 py-2 text-center text-xs text-neutral-600">
              +{groups.later.length} more than a year out
            </li>
          ))}
      </ul>
    </Section>
  );

  const toPlanSection = (
    <Section
      title="To plan"
      count={groups.toPlan.length}
      hint="No date yet. Plan them here or drag them onto the calendar."
      collapsed={collapsed.has("toPlan")}
      onToggle={() => toggleSection("toPlan")}
    >
      <ul className={listClass}>
        {groups.toPlan.length === 0 ? (
          <EmptyHint text="No unplanned items." />
        ) : (
          groups.toPlan.map((entry) => activeRow(entry, { plan: "primary" }))
        )}
      </ul>
    </Section>
  );

  // Quick add lives with the To do list — it only creates to-dos. The project
  // picker is a desktop extra; on a phone it is title and go.
  const todoQuickAdd = (
    <form onSubmit={quickAdd} className="flex gap-2">
      <input
        ref={quickAddRef}
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        placeholder="Quick add a to-do…"
        title="Quick add a to-do (Q)"
        aria-label="Quick add a to-do"
        enterKeyHint="done"
        className="field min-w-0 flex-1"
      />
      <select
        value={newCategoryId}
        onChange={(e) => setNewCategoryId(e.target.value)}
        className="field hidden w-40 shrink-0 sm:block"
        aria-label="Project"
      >
        <option value="">No project</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !newTitle.trim()}
        className="btn-plain shrink-0 px-3.5"
      >
        <Plus className="h-4 w-4" />
        Add
      </button>
    </form>
  );

  const todoSection = (
    <Section
      title="To do"
      count={groups.todos.length}
      hint="Quick reminders — every 3 you finish earns a pick."
      collapsed={collapsed.has("todo")}
      onToggle={() => toggleSection("todo")}
    >
      {todoQuickAdd}
      <ul className={`${listClass} mt-2`}>
        {groups.todos.length === 0 ? (
          <EmptyHint text="No reminders yet — quick add one above." />
        ) : (
          groups.todos.map((entry) => {
            const dl = todoDeadline(entry);
            return activeRow(entry, {
              overdue: dl != null && dl.getTime() <= now.getTime(),
            });
          })
        )}
      </ul>
    </Section>
  );

  const newButton = (
    <button
      onClick={() => setModal({ mode: "create" })}
      title="New entry (N)"
      className="btn-primary px-3.5 sm:py-1.5"
    >
      <Plus className="h-4 w-4" strokeWidth={2.5} />
      New
    </button>
  );

  const hasArchive = groups.archive.length > 0 || archivedPartnerGoals > 0;

  return (
    // Centred like the other tabs; only the xl two-column board goes full-width.
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 pt-5 pb-page sm:px-6 sm:pt-6 xl:max-w-none">
      <PageHeader
        title="Planner"
        meta={
          // The section headers carry the counts; on a phone the title row
          // only has room for the actions.
          groups.review.length > 0 && (
            <span className="hidden sm:inline">
              {groups.review.length} to review
            </span>
          )
        }
        actions={
          <>
            <button
              onClick={() => (searchOpen ? setSearchOpen(false) : openSearch())}
              className="icon-btn bg-neutral-800 text-neutral-200"
              aria-label="Search"
              aria-expanded={searchOpen}
              title="Search (/)"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => setProjectsOpen(true)}
              className="btn-plain px-3 sm:py-1.5"
              aria-label="Projects"
              title="Projects"
            >
              <FolderCog className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Projects</span>
            </button>
            {newButton}
          </>
        }
        compactActions={newButton}
      />

      {/* search: opens on demand and gets out of the way when empty */}
      {(searchOpen || search) && (
        <div className="relative mt-3 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => {
              if (!search.trim()) setSearchOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                setSearchOpen(false);
              }
            }}
            placeholder="Search by title…"
            aria-label="Search by title"
            enterKeyHint="search"
            className="field pl-10 pr-11"
          />
          <button
            // Keep the focus in the field while clearing it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setSearch("");
              setSearchOpen(false);
            }}
            className="icon-btn absolute right-0.5 top-1/2 -translate-y-1/2"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="segmented">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              aria-pressed={typeFilter === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowEvents((v) => !v)}
          disabled={typeFilter !== "all"}
          aria-pressed={showEvents && typeFilter === "all"}
          title={
            typeFilter !== "all"
              ? "Events show with the All filter"
              : "Show upcoming events in the list"
          }
          className="chip disabled:opacity-40"
        >
          {showEvents && typeFilter === "all" ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          Events
        </button>
      </div>
      <div className="mt-2.5 border-b border-neutral-800/80 pb-4">
        <ProjectChips
          categories={categories}
          value={projectFilter}
          onChange={setProjectFilter}
        />
      </div>

      {/* Two-column board on wide screens: the left column holds everything
          time-driven (review decisions, what's coming up), the right column
          the backlog (unplanned items, quick reminders). Stacks below xl.
          Quick add lives inside the To do section (see todoQuickAdd). */}
      {typeFilter === "todo" ? (
        todoSection
      ) : (
        // min-w-0 on the columns: a grid item defaults to its content's
        // min-content width, which a long entry title pushed past the phone
        // viewport.
        <div className="grid items-start gap-x-10 xl:grid-cols-2">
          <div className="min-w-0">
            {reviewSection}
            {upcomingSection}
          </div>
          <div className="min-w-0">
            {toPlanSection}
            {typeFilter === "all" && todoSection}
          </div>
        </div>
      )}

      {/* archive */}
      {hasArchive && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="-ml-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showArchive ? "" : "-rotate-90"}`}
            />
            Archive
            {groups.archive.length > 0 && (
              <span className="font-normal text-neutral-600">
                {groups.archive.length}
              </span>
            )}
          </button>
          {showArchive && (
            <>
              {groups.archive.length > 0 && (
                <ul className="mt-1 flex flex-col gap-2">
                  {groups.archive.map(archiveRow)}
                </ul>
              )}
              {archivedPartnerGoals > 0 && (
                // The Partner track left the tab bar; its record lives on here.
                <Link
                  href="/partner"
                  className="card mt-2 flex items-center gap-3 px-4 py-3 transition-opacity active:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
                    <Archive className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-100">
                      Partner track
                    </span>
                    <span className="block text-xs text-neutral-500">
                      Archived · {archivedPartnerGoals} weekly{" "}
                      {archivedPartnerGoals === 1 ? "goal" : "goals"} and their
                      notes
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" />
                </Link>
              )}
            </>
          )}
        </div>
      )}

      {modal && (
        <EntryModal
          mode={modal.mode}
          initial={
            modal.mode === "edit"
              ? editInitial(modal.entry)
              : createInitial(
                  typeFilter === "goal"
                    ? "goal"
                    : typeFilter === "todo"
                      ? "todo"
                      : "task",
                  nextHalfHour(),
                  typeFilter === "goal",
                )
          }
          categories={categories}
          onSave={onModalSave}
          onDelete={
            modal.mode === "edit"
              ? () => {
                  remove(modal.entry);
                  setModal(null);
                }
              : undefined
          }
          onClose={() => setModal(null)}
        />
      )}

      {planEntry && (
        <PlanModal
          entry={planEntry}
          onSchedule={(start, end, allDay) =>
            schedule(planEntry, start, end, allDay)
          }
          onUnschedule={() => unschedule(planEntry)}
          onClose={() => setPlanEntry(null)}
        />
      )}

      {projectsOpen && (
        <ProjectsModal
          categories={categories}
          setCategories={setCategories}
          tasks={entries.filter((e) => e.status === "active" && e.type !== "event")}
          onError={showToast}
          onClose={() => setProjectsOpen(false)}
        />
      )}

      <Toast message={toast} onDismiss={dismissToast} />
      <RewardToast reward={reward} />
    </div>
  );
}

/**
 * The round (task), square (to-do) or trophy (goal) mark that resolves an entry
 * in one tap — the shape says what kind of thing it is. A full 44px target
 * around a quiet 22px ring.
 */
function CheckButton({
  entry,
  disabled,
  onClick,
}: {
  entry: Entry;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isGoal = entry.type === "goal";
  const label = isGoal ? "Mark achieved" : "Mark done";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${entry.title}`}
      title={label}
      className="group/check flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40"
    >
      <span
        className={`flex h-[22px] w-[22px] items-center justify-center border-[1.5px] border-neutral-600 text-transparent transition-colors group-hover/check:border-accent-bright group-hover/check:text-accent-bright group-active/check:border-accent group-active/check:bg-accent group-active/check:text-white ${
          entry.type === "todo" ? "rounded-[7px]" : "rounded-full"
        }`}
      >
        {isGoal ? (
          <Trophy className="h-3 w-3 text-neutral-500 transition-colors group-hover/check:text-accent-bright group-active/check:text-white" />
        ) : (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        )}
      </span>
    </button>
  );
}

/** The entry's type icon, parked where the check sits on rows that have one. */
function TypeGlyph({ entry }: { entry: Entry }) {
  const Icon = ENTRY_TYPE_ICON[entry.type];
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center text-neutral-500">
      <Icon className="h-4 w-4" aria-label={entry.type} />
    </span>
  );
}

function EntryRow({
  entry,
  project,
  struck,
  overdue,
  onOpen,
  leading,
  actions,
}: {
  entry: Entry;
  project?: Category;
  struck?: boolean;
  overdue?: boolean;
  onOpen: () => void;
  leading: React.ReactNode;
  actions: React.ReactNode;
}) {
  const deadline = entry.type === "todo" ? todoDeadline(entry) : null;
  return (
    <li className="card flex items-center py-1 pl-1 pr-1.5">
      {leading}
      <button onClick={onOpen} className="min-w-0 flex-1 py-2 pr-2 text-left">
        <p
          className={`line-clamp-2 text-sm leading-snug sm:line-clamp-1 ${
            struck ? "text-neutral-500 line-through" : "text-neutral-100"
          }`}
        >
          {entry.title}
        </p>
        {(project || deadline || (entry.type !== "todo" && entry.start_at)) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-neutral-500">
            {project && (
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                  aria-hidden
                />
                <span className="truncate">{project.name}</span>
              </span>
            )}
            {deadline && (
              <span className={overdue ? "text-accent-bright" : ""}>
                {overdue ? "was due " : "due "}
                {formatDMY(deadline)}
              </span>
            )}
            {entry.type !== "todo" && entry.start_at && (
              <span className={overdue ? "text-accent-bright" : ""}>
                {overdue ? "was due " : ""}
                {formatDMY(new Date(entry.start_at))}
                {entry.all_day
                  ? allDayRangeSuffix(entry)
                  : ` · ${formatTime(new Date(entry.start_at))}`}
              </span>
            )}
          </div>
        )}
      </button>
      <div className="flex shrink-0 items-center">{actions}</div>
    </li>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <li className="px-4 py-5 text-center text-sm text-neutral-500">
      {text}
    </li>
  );
}
