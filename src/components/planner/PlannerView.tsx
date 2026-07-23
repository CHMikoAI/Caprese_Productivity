"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FolderKanban,
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
import PlanModal from "@/components/planner/PlanModal";
import ProjectsModal from "@/components/tasks/ProjectsModal";
import RewardToast, { useRewardToast } from "@/components/RewardToast";
import Toast, { useToast } from "@/components/Toast";
import { formatDMY, formatTime } from "@/lib/dates";
import { ENTRY_TYPE_ICON } from "@/lib/entryIcons";
import { isResolved, phaseOf, STATUS_LABEL } from "@/lib/entryStatus";
import { useShortcuts } from "@/lib/useShortcuts";
import { type Category, type Entry, type EntryStatus } from "@/lib/types";

const inputClass =
  "rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none";

type ModalState = { mode: "create" } | { mode: "edit"; entry: Entry };
type TypeFilter = "all" | "task" | "todo" | "goal";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "task", label: "Tasks" },
  { key: "todo", label: "To do" },
  { key: "goal", label: "Goals" },
];

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
}: {
  initialEntries: Entry[];
  initialCategories: Category[];
}) {
  const router = useRouter();
  const { message: toast, show: showError } = useToast();
  const { reward, showReward } = useRewardToast();

  const [entries, setEntries] = useState(initialEntries);
  const [categories, setCategories] = useState(initialCategories);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [planEntry, setPlanEntry] = useState<Entry | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  // Collapsed section keys ("review" | "upcoming" | "toPlan"). Empty = all open.
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
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showEvents, setShowEvents] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [busy, setBusy] = useState(false);

  const quickAddRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
    "/": () => {
      setSearchOpen(true);
      // Focus also when the field is already expanded (autoFocus only fires
      // on mount).
      requestAnimationFrame(() => searchRef.current?.focus());
    },
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
    return { review, upcoming, toPlan, todos, archive };
  }, [entries, now, typeFilter, projectFilter, showEvents, search]);

  // ----- mutations -----

  function patchLocal(id: string, patch: Partial<Entry>) {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function resolve(entry: Entry, status: EntryStatus) {
    const prev = entries;
    patchLocal(entry.id, { status });
    setEntryStatus(entry.id, status)
      .then(({ picksAwarded }) => {
        router.refresh();
        if (picksAwarded > 0) showReward(picksAwarded);
      })
      .catch(() => {
        setEntries(prev);
        showError("Could not update the entry.");
      });
  }

  /** Plan dialog result: a concrete slot. Also revives overdue items. */
  function schedule(entry: Entry, start: Date, end: Date) {
    const prev = entries;
    patchLocal(entry.id, {
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: false,
      status: "active",
    });
    setPlanEntry(null);
    postponeEntry(entry.id, start.toISOString(), end.toISOString())
      .then(() => router.refresh())
      .catch(() => {
        setEntries(prev);
        showError("Could not plan the entry.");
      });
  }

  /** Plan dialog result: no date — park the entry under "To plan". */
  function unschedule(entry: Entry) {
    const prev = entries;
    patchLocal(entry.id, {
      start_at: null,
      end_at: null,
      all_day: false,
      status: "active",
    });
    setPlanEntry(null);
    updateEntry(entry.id, {
      start_at: null,
      end_at: null,
      all_day: false,
      status: "active",
    })
      .then(() => router.refresh())
      .catch(() => {
        setEntries(prev);
        showError("Could not move the entry.");
      });
  }

  function remove(entry: Entry) {
    const prev = entries;
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    deleteEntry(entry.id)
      .then(() => router.refresh())
      .catch(() => {
        setEntries(prev);
        showError("Could not delete the entry.");
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
      showError("Could not add the to-do.");
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
          showError("Could not create the entry.");
        });
    } else {
      const id = current.entry.id;
      const prev = entries;
      patchLocal(id, {
        type: result.type,
        title: result.title,
        category_id: result.categoryId,
        start_at: result.startAt,
        end_at: result.endAt,
        all_day: result.allDay,
        description: result.description,
      });
      updateEntry(id, {
        type: result.type,
        title: result.title,
        category_id: result.categoryId,
        start_at: result.startAt,
        end_at: result.endAt,
        all_day: result.allDay,
        description: result.description,
      })
        .then(() => router.refresh())
        .catch(() => {
          setEntries(prev);
          showError("Could not save the entry.");
        });
    }
  }

  // ----- row rendering -----

  const ghostBtn =
    "flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 sm:px-2.5 sm:py-1.5";
  const primaryBtn =
    "flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 sm:px-2.5 sm:py-1.5";
  // Touch has no hover, so the reveal-on-hover trick would leave these buttons
  // invisible on phones — show them there, keep the desktop hover-reveal.
  const iconBtn =
    "rounded-lg p-2 text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-200 sm:p-1.5 sm:text-neutral-600 sm:opacity-0 sm:group-hover:opacity-100";

  function Row({
    entry,
    struck,
    overdue,
    actions,
  }: {
    entry: Entry;
    struck?: boolean;
    overdue?: boolean;
    actions: React.ReactNode;
  }) {
    const project = entry.category_id
      ? categoryById.get(entry.category_id)
      : undefined;
    const TypeIcon = ENTRY_TYPE_ICON[entry.type];
    return (
      // On phones the action buttons wrap onto their own line so the title
      // keeps its room; from sm on everything sits on one line as before.
      <li className="group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 transition-colors hover:border-neutral-700">
        <TypeIcon
          className="h-4 w-4 shrink-0 text-neutral-500"
          aria-label={entry.type}
        />
        <button
          onClick={() => setModal({ mode: "edit", entry })}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className={`truncate text-sm text-neutral-100 ${struck ? "text-neutral-500 line-through" : ""}`}
          >
            {entry.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
            {project && <span>{project.name}</span>}
            {entry.type === "todo"
              ? todoDeadline(entry) && (
                  <span
                    className={`flex items-center gap-1 ${overdue ? "text-accent/80" : ""}`}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {overdue ? "was due " : "due "}
                    {formatDMY(todoDeadline(entry)!)}
                  </span>
                )
              : entry.start_at && (
                  <span
                    className={`flex items-center gap-1 ${overdue ? "text-accent/80" : ""}`}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {overdue ? "was due " : ""}
                    {formatDMY(new Date(entry.start_at))}
                    {entry.all_day
                      ? allDayRangeSuffix(entry)
                      : ` · ${formatTime(new Date(entry.start_at))}`}
                  </span>
                )}
          </div>
        </button>
        <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
          {actions}
        </div>
      </li>
    );
  }

  /** Done / Plan / Cancel (tasks) — Achieved / Plan / Not achieved (goals).
   * Todos resolve like tasks but never get a Plan button (no calendar slot). */
  function decisionActions(entry: Entry, planPrimary = false) {
    const isGoal = entry.type === "goal";
    const doneBtn = (
      <button
        onClick={() => resolve(entry, isGoal ? "achieved" : "done")}
        className={planPrimary ? ghostBtn : primaryBtn}
      >
        {isGoal ? (
          <Trophy className="h-3.5 w-3.5" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        {isGoal ? "Achieved" : "Done"}
      </button>
    );
    const cancelBtn = (
      <button
        onClick={() => resolve(entry, isGoal ? "missed" : "cancelled")}
        className={ghostBtn}
      >
        {isGoal ? <X className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
        {isGoal ? "Not achieved" : "Cancel"}
      </button>
    );
    if (entry.type === "todo") {
      return (
        <>
          {doneBtn}
          {cancelBtn}
        </>
      );
    }
    const planBtn = (
      <button
        onClick={() => setPlanEntry(entry)}
        className={planPrimary ? primaryBtn : ghostBtn}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Plan
      </button>
    );
    return planPrimary ? (
      <>
        {planBtn}
        {doneBtn}
        {cancelBtn}
      </>
    ) : (
      <>
        {doneBtn}
        {planBtn}
        {cancelBtn}
      </>
    );
  }

  function eventActions(entry: Entry) {
    return (
      <button
        onClick={() => remove(entry)}
        className={`${iconBtn} hover:text-accent`}
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  // ----- sections (composed into the two-column board below) -----

  const reviewSection = (
    <Section
      title="To review"
      count={groups.review.length}
      hint="Time's up — mark it done, plan it again, or cancel it."
      collapsed={collapsed.has("review")}
      onToggle={() => toggleSection("review")}
    >
      {groups.review.length === 0 ? (
        <EmptyHint text="Nothing to review — all caught up." />
      ) : (
        groups.review.map((entry) => (
          <Row
            key={entry.id}
            entry={entry}
            overdue
            actions={decisionActions(entry)}
          />
        ))
      )}
    </Section>
  );

  const upcomingSection = (
    <Section
      title="Upcoming"
      count={groups.upcoming.length}
      collapsed={collapsed.has("upcoming")}
      onToggle={() => toggleSection("upcoming")}
    >
      {groups.upcoming.length === 0 ? (
        <EmptyHint text="Nothing scheduled yet." />
      ) : (
        groups.upcoming.map((entry) => (
          <Row
            key={entry.id}
            entry={entry}
            actions={
              entry.type === "event"
                ? eventActions(entry)
                : decisionActions(entry)
            }
          />
        ))
      )}
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
      {groups.toPlan.length === 0 ? (
        <EmptyHint text="No unplanned items." />
      ) : (
        groups.toPlan.map((entry) => (
          <Row
            key={entry.id}
            entry={entry}
            actions={decisionActions(entry, true)}
          />
        ))
      )}
    </Section>
  );

  // Quick add lives with the To do list — it only creates to-dos. Hidden on
  // phones (add via "New"), matching the rest of the planner's mobile layout.
  const todoQuickAdd = (
    <form onSubmit={quickAdd} className="mt-2 hidden gap-2 sm:flex">
      <input
        ref={quickAddRef}
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        placeholder="Quick add a to-do…"
        title="Quick add a to-do (Q)"
        className={`${inputClass} min-w-0 flex-1`}
      />
      <select
        value={newCategoryId}
        onChange={(e) => setNewCategoryId(e.target.value)}
        className={`${inputClass} w-36 shrink-0`}
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
        className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-40"
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
      beforeList={todoQuickAdd}
    >
      {groups.todos.length === 0 ? (
        <EmptyHint text="No reminders yet — quick add one above." />
      ) : (
        groups.todos.map((entry) => {
          const dl = todoDeadline(entry);
          const overdue = dl != null && dl.getTime() <= now.getTime();
          return (
            <Row
              key={entry.id}
              entry={entry}
              overdue={overdue}
              actions={decisionActions(entry)}
            />
          );
        })
      )}
    </Section>
  );

  return (
    <div className="w-full flex-1 px-4 py-8 sm:px-6">
      {/* header */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
          Planner
        </h1>
        <span className="text-sm text-neutral-500">
          {groups.review.length} to review
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setProjectsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
          >
            <FolderKanban className="h-4 w-4" />
            Projects
          </button>
          <button
            onClick={() => setModal({ mode: "create" })}
            title="New entry (N)"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-800/80 pb-4">
        <div className="flex rounded-lg border border-neutral-800 bg-neutral-900/60 p-0.5 text-xs">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={
                typeFilter === f.key
                  ? "rounded-md bg-neutral-800 px-3 py-1 font-medium text-neutral-100"
                  : "rounded-md px-3 py-1 text-neutral-400 transition-colors hover:text-neutral-200"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowEvents((v) => !v)}
          disabled={typeFilter !== "all"}
          title={
            typeFilter !== "all"
              ? "Events show with the All filter"
              : "Show upcoming events in the list"
          }
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
            showEvents && typeFilter === "all"
              ? "border-neutral-600 bg-neutral-800 text-neutral-100"
              : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
          }`}
        >
          {showEvents ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          Events
        </button>
        {categories.length > 0 && (
          <>
            {/* desktop: chips. phones: a compact dropdown so the projects
                don't eat several rows of the filter bar. */}
            <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
              <ProjectChip
                active={projectFilter === "all"}
                onClick={() => setProjectFilter("all")}
                label="All projects"
              />
              {categories.map((c) => (
                <ProjectChip
                  key={c.id}
                  active={projectFilter === c.id}
                  onClick={() => setProjectFilter(c.id)}
                  label={c.name}
                />
              ))}
            </div>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
              className={`${inputClass} max-w-40 py-1.5 text-xs sm:hidden`}
            >
              <option value="all">All projects</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        )}
        {/* search: an icon that expands on demand and collapses when empty */}
        <div className="ml-auto">
          {searchOpen || search ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
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
                placeholder="Search…"
                className={`${inputClass} w-40 py-1.5 pl-8 text-xs sm:w-52`}
              />
              {search && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-500 hover:text-neutral-200"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-lg border border-neutral-800 p-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
              aria-label="Search"
              title="Search (/)"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Two-column board on wide screens: the left column holds everything
          time-driven (review decisions, what's coming up), the right column
          the backlog (unplanned items, quick reminders). Stacks below xl.
          Quick add lives inside the To do section (see todoQuickAdd). */}
      {typeFilter === "todo" ? (
        todoSection
      ) : (
        <div className="grid items-start gap-x-10 xl:grid-cols-2">
          <div>
            {reviewSection}
            {upcomingSection}
          </div>
          <div>
            {toPlanSection}
            {typeFilter === "all" && todoSection}
          </div>
        </div>
      )}

      {/* archive */}
      {groups.archive.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showArchive ? "" : "-rotate-90"}`}
            />
            Archive
            <span className="text-neutral-600">{groups.archive.length}</span>
          </button>
          {showArchive && (
            <ul className="mt-3 flex flex-col gap-2">
              {groups.archive.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  struck
                  actions={
                    <>
                      <span className="mr-1 rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
                        {STATUS_LABEL[entry.status]}
                      </span>
                      <button
                        onClick={() => resolve(entry, "active")}
                        className={iconBtn}
                        aria-label="Reopen"
                        title="Reopen"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(entry)}
                        className={`${iconBtn} hover:text-accent`}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  }
                />
              ))}
            </ul>
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
                  defaultStart(),
                  typeFilter === "goal",
                )
          }
          categories={categories}
          onSave={onModalSave}
          onDelete={
            modal.mode === "edit"
              ? () => {
                  remove((modal as { entry: Entry }).entry);
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
          onSchedule={(start, end) => schedule(planEntry, start, end)}
          onUnschedule={() => unschedule(planEntry)}
          onClose={() => setPlanEntry(null)}
        />
      )}

      {projectsOpen && (
        <ProjectsModal
          categories={categories}
          setCategories={setCategories}
          tasks={entries.filter((e) => e.status === "active" && e.type !== "event")}
          onError={showError}
          onClose={() => setProjectsOpen(false)}
        />
      )}

      <Toast message={toast} />
      <RewardToast reward={reward} />
    </div>
  );
}

function ProjectChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-neutral-600 bg-neutral-800 text-neutral-100"
          : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}

function Section({
  title,
  count,
  hint,
  collapsed,
  onToggle,
  beforeList,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Rendered between the header and the list (e.g. an inline add form). */
  beforeList?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      {/* the whole header toggles the section (same pattern as Archive) */}
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
        {title}
        <span className="font-normal text-neutral-600">{count}</span>
        {hint && !collapsed && (
          <span className="ml-2 hidden font-normal normal-case tracking-normal text-neutral-600 sm:inline">
            {hint}
          </span>
        )}
      </button>
      {!collapsed && (
        <>
          {beforeList}
          <ul className="mt-2 flex flex-col gap-2">{children}</ul>
        </>
      )}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <li className="rounded-xl border border-dashed border-neutral-800 px-4 py-4 text-center text-sm text-neutral-600">
      {text}
    </li>
  );
}

function defaultStart() {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
}
