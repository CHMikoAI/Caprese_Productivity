"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, PanelRight, Plus } from "lucide-react";
import {
  createEntry,
  deleteEntry,
  scheduleEntry,
  updateEntry,
} from "@/app/actions";
import {
  addDays,
  addMinutes,
  addMonths,
  dateRangeLabel,
  formatDayLong,
  isSameDay,
  isoWeek,
  minutesSinceMidnight,
  monthLabel,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateKey,
  WEEKDAYS_SHORT,
} from "@/lib/dates";
import type { Category, Entry, JournalEntry } from "@/lib/types";
import Toast, { useToast } from "@/components/Toast";
import EntryModal, {
  type EntryFormResult,
  type EntryModalInitial,
} from "./EntryModal";
import JournalDayMarker from "./JournalDayMarker";
import MonthView from "./MonthView";
import TaskSidebar from "./TaskSidebar";
import EntryBlock, { type PositionedEntry } from "./EntryBlock";
import { createInitial, editInitial } from "./entryModalInitial";
import { blockPalette, goalFrame } from "@/lib/colorContrast";
import { isFinished } from "@/lib/entryStatus";
import { useShortcuts } from "@/lib/useShortcuts";

const SLOT_PX = 22;
const HOUR_PX = SLOT_PX * 2;
const GRID_HEIGHT = 24 * HOUR_PX;
const SCROLL_TO_HOUR = 7;
const TASK_DROP_DURATION = 60;
const VIEW_STORAGE_KEY = "caprese_view";

type View = "day" | "3day" | "workweek" | "week" | "month";

// `showOn` drives which breakpoint a view button appears on. Phones get a
// compact set (Day / 3 days / Month); desktop keeps the roomier week views.
const VIEW_OPTIONS: {
  key: View;
  label: string;
  showOn: "all" | "mobile" | "desktop";
}[] = [
  { key: "day", label: "Day", showOn: "all" },
  { key: "3day", label: "3 days", showOn: "mobile" },
  { key: "workweek", label: "Workweek", showOn: "desktop" },
  { key: "week", label: "Week", showOn: "desktop" },
  { key: "month", label: "Month", showOn: "all" },
];

const MOBILE_MEDIA = "(max-width: 639px)"; // Tailwind's `sm` breakpoint

// Phone paging: the grid renders one extra page on each side of the visible
// one and scrolls natively with scroll-snap. Swiping is therefore plain
// browser scrolling (smooth, with momentum) — no re-render while it happens.
// Once a swipe settles the anchor moves and the window is silently recentred.
const GUTTER_PX = 56; // the w-14 time gutter
const PAGES_EACH_SIDE = 1;

type ModalState = {
  mode: "create" | "edit";
  entryId?: string;
  initial: EntryModalInitial;
};

type DragState = {
  entryId: string;
  title: string;
  day: number;
  startMin: number;
  durationMin: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function minutesLabel(min: number) {
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

const NEUTRAL = "#6B7280"; // fallback project colour
const ALLDAY_BAR_H = 20;
const ALLDAY_BAR_GAP = 3;

/** An entry that starts and ends on different calendar days → shown as a banner
 * in the all-day row rather than in a time column, so the columns stay free. */
function isMultiDayEntry(entry: Entry): boolean {
  if (!entry.start_at || !entry.end_at) return false;
  const start = new Date(entry.start_at);
  const endInclusive = new Date(new Date(entry.end_at).getTime() - 1);
  return !isSameDay(start, endInclusive);
}

/** Assign overlapping entries to side-by-side columns within a day. */
function layoutColumns(items: PositionedEntry[]) {
  items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const active: PositionedEntry[] = [];
  let cluster: PositionedEntry[] = [];

  const closeCluster = () => {
    if (cluster.length === 0) return;
    const cols = Math.max(...cluster.map((c) => c.col)) + 1;
    for (const item of cluster) item.cols = cols;
    cluster = [];
  };

  for (const item of items) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].endMin <= item.startMin) active.splice(i, 1);
    }
    if (active.length === 0) closeCluster();
    const used = new Set(active.map((a) => a.col));
    let col = 0;
    while (used.has(col)) col++;
    item.col = col;
    active.push(item);
    cluster.push(item);
  }
  closeCluster();
}

export default function WeekCalendar({
  initialEntries,
  categories,
  journalEntries,
}: {
  initialEntries: Entry[];
  categories: Category[];
  journalEntries: JournalEntry[];
}) {
  const router = useRouter();
  const { message: toast, show: showError } = useToast();

  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<View>("week");
  const [entries, setEntries] = useState(initialEntries);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragTask, setDragTask] = useState<Entry | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    day: number;
    startMin: number;
  } | null>(null);
  const [createDrag, setCreateDrag] = useState<{
    day: number;
    startMin: number;
    endMin: number;
  } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isMobile, setIsMobile] = useState(false);
  const [viewportW, setViewportW] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const gridInnerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    entry: Entry;
    mode: "move" | "resize-top" | "resize-bottom";
    dayIndex: number; // fixed day (used when resizing)
    durationMin: number;
    grabOffsetMin: number;
    origStartMin: number;
    origEndMin: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const createDragRef = useRef<{
    dayIndex: number;
    anchorMin: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const createDragStateRef = useRef<{
    day: number;
    startMin: number;
    endMin: number;
  } | null>(null);

  useEffect(() => setEntries(initialEntries), [initialEntries]);

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
    const isMobile = window.matchMedia(MOBILE_MEDIA).matches;
    const allowed = VIEW_OPTIONS.filter((v) =>
      isMobile ? v.showOn !== "desktop" : v.showOn !== "mobile",
    ).map((v) => v.key);
    // Restore the last view when it fits this breakpoint, otherwise fall back
    // to the breakpoint's default (Day on phones, Week on desktop).
    if (stored && allowed.includes(stored)) setView(stored);
    else setView(isMobile ? "day" : "week");
  }, []);
  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Track the phone breakpoint: on mobile the day columns fit the viewport and
  // the grid pages via horizontal swipe instead of scrolling.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (view !== "month") {
      scrollRef.current?.scrollTo({ top: SCROLL_TO_HOUR * HOUR_PX });
    }
  }, [view]);

  /** Days shown in one page (what the viewport holds at a time). */
  const daysPerPage = view === "day" ? 1 : view === "3day" ? 3 : 7;

  /** The days the user is looking at — drives the header, never the grid. */
  const visibleDays = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "3day")
      return Array.from({ length: 3 }, (_, i) => addDays(anchor, i));
    const weekStart = startOfWeek(anchor);
    const count = view === "workweek" ? 5 : 7;
    return Array.from({ length: count }, (_, i) => addDays(weekStart, i));
  }, [anchor, view]);

  /** Whether the phone paging (windowed days + scroll-snap) is in effect. */
  const paging = isMobile && (view === "day" || view === "3day");

  /**
   * Days actually rendered. On phones that's the visible page plus one page
   * either side, so a swipe scrolls into already-rendered content instead of
   * re-rendering the grid.
   */
  const days = useMemo(() => {
    if (!paging) return visibleDays;
    const start = addDays(anchor, -PAGES_EACH_SIDE * daysPerPage);
    const total = daysPerPage * (1 + 2 * PAGES_EACH_SIDE);
    return Array.from({ length: total }, (_, i) => addDays(start, i));
  }, [paging, visibleDays, anchor, daysPerPage]);

  // Measure the scroll port so a page can be sized to exactly fill it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const dayWidth =
    paging && viewportW > 0 ? (viewportW - GUTTER_PX) / daysPerPage : 0;
  const pageWidth = dayWidth * daysPerPage;

  // A settled swipe moves the anchor by whole pages…
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pageWidth) return;
    let timer: number | undefined;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const delta = Math.round(el.scrollLeft / pageWidth) - PAGES_EACH_SIDE;
        if (delta !== 0) setAnchor((a) => addDays(a, delta * daysPerPage));
      }, 120);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [pageWidth, daysPerPage]);

  // …and the window recentres before paint, so the jump is never visible.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pageWidth) return;
    el.scrollLeft = PAGES_EACH_SIDE * pageWidth;
  }, [anchor, pageWidth]);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const journalByDate = useMemo(
    () => new Map(journalEntries.map((e) => [e.entry_date, e])),
    [journalEntries],
  );

  // Everything that shows on the grid: has a date and isn't a todo (todos are
  // reminders, never placed on the calendar). All-day entries live in the
  // all-day band, timed ones in the day columns.
  const timedEntries = useMemo(
    () => entries.filter((e) => e.start_at && e.type !== "todo"),
    [entries],
  );

  // Sidebar holds unscheduled, still-active tasks and goals ("To plan" in the
  // planner) ready to be dropped onto the grid.
  const openTasks = useMemo(
    () =>
      entries.filter(
        (e) =>
          (e.type === "task" || e.type === "goal") &&
          e.status === "active" &&
          !e.start_at,
      ),
    [entries],
  );

  const entriesByDay = useMemo(() => {
    const byDay: PositionedEntry[][] = days.map(() => []);
    for (const entry of timedEntries) {
      // All-day and multi-day entries render in the all-day band, not columns.
      if (entry.all_day || isMultiDayEntry(entry)) continue;
      const start = new Date(entry.start_at!);
      const dayIndex = days.findIndex((d) => isSameDay(start, d));
      if (dayIndex === -1) continue;
      const end = entry.end_at ? new Date(entry.end_at) : addMinutes(start, 30);
      const startMin = minutesSinceMidnight(start);
      const endMin = isSameDay(end, start)
        ? Math.max(minutesSinceMidnight(end), startMin + 30)
        : 24 * 60;
      byDay[dayIndex].push({ entry, startMin, endMin, col: 0, cols: 1 });
    }
    for (const list of byDay) layoutColumns(list);
    return byDay;
  }, [timedEntries, days]);

  // All-day and multi-day entries laid out as horizontal banners spanning the
  // day columns.
  const allDay = useMemo(() => {
    if (days.length === 0) return { bars: [], rows: 0 };
    const weekStart = startOfDay(days[0]);
    const weekEnd = addDays(startOfDay(days[days.length - 1]), 1); // exclusive
    type Bar = {
      entry: Entry;
      firstCol: number;
      lastCol: number;
      row: number;
      continuesLeft: boolean;
      continuesRight: boolean;
    };
    const bars: Bar[] = [];
    for (const entry of timedEntries) {
      if (!entry.all_day && !isMultiDayEntry(entry)) continue;
      const start = new Date(entry.start_at!);
      const end = new Date(entry.end_at!);
      if (start >= weekEnd || end <= weekStart) continue; // not in view
      const endInclusive = new Date(end.getTime() - 1);
      const startIdx = days.findIndex((d) => isSameDay(d, start));
      const endIdx = days.findIndex((d) => isSameDay(d, endInclusive));
      bars.push({
        entry,
        firstCol: startIdx === -1 ? 0 : startIdx,
        lastCol: endIdx === -1 ? days.length - 1 : endIdx,
        row: 0,
        continuesLeft: start < weekStart,
        continuesRight: end > weekEnd,
      });
    }
    // Greedy row packing so bars that overlap in days stack instead of collide.
    bars.sort((a, b) => a.firstCol - b.firstCol || b.lastCol - a.lastCol);
    const rowEnds: number[] = [];
    for (const bar of bars) {
      let row = 0;
      while (row < rowEnds.length && rowEnds[row] >= bar.firstCol) row++;
      if (row === rowEnds.length) rowEnds.push(bar.lastCol);
      else rowEnds[row] = bar.lastCol;
      bar.row = row;
    }
    return { bars, rows: rowEnds.length };
  }, [timedEntries, days]);

  // ----- moving & resizing entries (pointer drag, 30-min snapping) -----

  function onEntryPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    item: PositionedEntry,
    dayIndex: number,
  ) {
    if (e.button !== 0) return;
    if (item.entry.id.startsWith("temp-")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      entry: item.entry,
      mode: "move",
      dayIndex,
      durationMin: item.endMin - item.startMin,
      grabOffsetMin: ((e.clientY - rect.top) / SLOT_PX) * 30,
      origStartMin: item.startMin,
      origEndMin: item.endMin,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
  }

  function onEntryResizeDown(
    e: React.PointerEvent<HTMLDivElement>,
    item: PositionedEntry,
    dayIndex: number,
    edge: "top" | "bottom",
  ) {
    if (e.button !== 0) return;
    if (item.entry.id.startsWith("temp-")) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      entry: item.entry,
      mode: edge === "top" ? "resize-top" : "resize-bottom",
      dayIndex,
      durationMin: item.endMin - item.startMin,
      grabOffsetMin: 0,
      origStartMin: item.startMin,
      origEndMin: item.endMin,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
  }

  function onEntryPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || !colsRef.current) return;
    if (!d.moved) {
      const dist = Math.hypot(
        e.clientX - d.startClientX,
        e.clientY - d.startClientY,
      );
      if (dist < 5) return;
      d.moved = true;
    }
    const sc = scrollRef.current;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (e.clientY < r.top + 56) sc.scrollTop -= 14;
      else if (e.clientY > r.bottom - 56) sc.scrollTop += 14;
    }
    const rect = colsRef.current.getBoundingClientRect();
    const pointerMin = clamp(
      Math.round((((e.clientY - rect.top) / SLOT_PX) * 30) / 30) * 30,
      0,
      24 * 60,
    );

    let day: number;
    let startMin: number;
    let durationMin: number;
    if (d.mode === "move") {
      const colWidth = rect.width / days.length;
      day = clamp(
        Math.floor((e.clientX - rect.left) / colWidth),
        0,
        days.length - 1,
      );
      const rawStart = ((e.clientY - rect.top) / SLOT_PX) * 30 - d.grabOffsetMin;
      startMin = clamp(Math.round(rawStart / 30) * 30, 0, 24 * 60 - d.durationMin);
      durationMin = d.durationMin;
    } else if (d.mode === "resize-bottom") {
      day = d.dayIndex;
      startMin = d.origStartMin;
      durationMin = clamp(pointerMin, d.origStartMin + 30, 24 * 60) - startMin;
    } else {
      day = d.dayIndex;
      startMin = clamp(pointerMin, 0, d.origEndMin - 30);
      durationMin = d.origEndMin - startMin;
    }

    const next: DragState = {
      entryId: d.entry.id,
      title: d.entry.title,
      day,
      startMin,
      durationMin,
    };
    dragStateRef.current = next;
    setDrag(next);
  }

  function onEntryPointerUp() {
    // Suppress the trailing pointerup of a horizontal page swipe.
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      // A plain click on the body opens the editor; a click on a resize grip
      // (no drag) does nothing.
      if (d.mode === "move") {
        setModal({
          mode: "edit",
          entryId: d.entry.id,
          initial: editInitial(d.entry),
        });
      }
      return;
    }
    const state = dragStateRef.current;
    dragStateRef.current = null;
    setDrag(null);
    if (!state || state.entryId !== d.entry.id) return;

    const newStart = addMinutes(days[state.day], state.startMin);
    const newEnd = addMinutes(newStart, state.durationMin);
    const prev = entries;
    setEntries((list) =>
      list.map((ev) =>
        ev.id === d.entry.id
          ? {
              ...ev,
              start_at: newStart.toISOString(),
              end_at: newEnd.toISOString(),
            }
          : ev,
      ),
    );
    updateEntry(d.entry.id, {
      start_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
    })
      .then(() => router.refresh())
      .catch(() => {
        setEntries(prev);
        showError("Could not update the entry.");
      });
  }

  // ----- create -----

  function openCreateAt(day: Date, minutes: number) {
    setModal({
      mode: "create",
      initial: createInitial("event", addMinutes(startOfDay(day), minutes), true),
    });
  }

  // ----- drag on an empty slot to create an event of exactly that length -----

  function onSlotPointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    dayIndex: number,
    slotIndex: number,
  ) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    createDragRef.current = {
      dayIndex,
      anchorMin: slotIndex * 30,
      startClientY: e.clientY,
      moved: false,
    };
  }

  function onSlotPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = createDragRef.current;
    if (!d || !colsRef.current) return;
    if (!d.moved) {
      if (Math.abs(e.clientY - d.startClientY) < 5) return;
      d.moved = true;
    }
    const sc = scrollRef.current;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (e.clientY < r.top + 56) sc.scrollTop -= 14;
      else if (e.clientY > r.bottom - 56) sc.scrollTop += 14;
    }
    const rect = colsRef.current.getBoundingClientRect();
    const pointerMin = clamp(
      Math.round((((e.clientY - rect.top) / SLOT_PX) * 30) / 30) * 30,
      0,
      24 * 60,
    );
    // The pressed slot is the anchor; drag up or down from it.
    const startMin = pointerMin > d.anchorMin ? d.anchorMin : pointerMin;
    const endMin =
      pointerMin > d.anchorMin
        ? Math.max(pointerMin, d.anchorMin + 30)
        : d.anchorMin + 30;
    const next = { day: d.dayIndex, startMin, endMin };
    createDragStateRef.current = next;
    setCreateDrag(next);
  }

  function onSlotPointerUp(
    _e: React.PointerEvent<HTMLButtonElement>,
    dayIndex: number,
    slotIndex: number,
  ) {
    // A page swipe ends with a pointerup on some slot — don't treat it as a tap.
    const d = createDragRef.current;
    createDragRef.current = null;
    const sel = createDragStateRef.current;
    createDragStateRef.current = null;
    setCreateDrag(null);
    if (!d) return;
    if (!d.moved || !sel) {
      openCreateAt(days[dayIndex], slotIndex * 30);
      return;
    }
    setModal({
      mode: "create",
      initial: createInitial(
        "event",
        addMinutes(days[sel.day], sel.startMin),
        true,
        sel.endMin - sel.startMin,
      ),
    });
  }

  function onSlotPointerCancel() {
    createDragRef.current = null;
    createDragStateRef.current = null;
    setCreateDrag(null);
  }

  function defaultNewStart() {
    const current = new Date();
    const inView =
      view === "month"
        ? current.getMonth() === anchor.getMonth() &&
          current.getFullYear() === anchor.getFullYear()
        : days.some((d) => isSameDay(d, current));
    if (inView && view !== "month") {
      const next = new Date(current);
      const m = current.getMinutes();
      next.setMinutes(m % 30 === 0 ? m : m + (30 - (m % 30)), 0, 0);
      return next;
    }
    const base = view === "month" ? startOfMonth(anchor) : days[0];
    return addMinutes(startOfDay(base), 9 * 60);
  }

  // ----- dropping tasks from the sidebar (HTML5 drag & drop) -----

  function taskDropPosition(e: React.DragEvent) {
    const rect = colsRef.current!.getBoundingClientRect();
    const colWidth = rect.width / days.length;
    const day = clamp(
      Math.floor((e.clientX - rect.left) / colWidth),
      0,
      days.length - 1,
    );
    const startMin = clamp(
      Math.floor((e.clientY - rect.top) / SLOT_PX) * 30,
      0,
      24 * 60 - TASK_DROP_DURATION,
    );
    return { day, startMin };
  }

  function onGridDragOver(e: React.DragEvent) {
    if (!dragTask || !colsRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropPreview(taskDropPosition(e));
  }

  function onGridDrop(e: React.DragEvent) {
    if (!dragTask || !colsRef.current) return;
    e.preventDefault();
    const pos = taskDropPosition(e);
    const task = dragTask;
    setDragTask(null);
    setDropPreview(null);

    const start = addMinutes(days[pos.day], pos.startMin);
    const end = addMinutes(start, TASK_DROP_DURATION);
    const prev = entries;
    setEntries((list) =>
      list.map((ev) =>
        ev.id === task.id
          ? { ...ev, start_at: start.toISOString(), end_at: end.toISOString() }
          : ev,
      ),
    );
    scheduleEntry(task.id, start.toISOString(), end.toISOString())
      .then(() => router.refresh())
      .catch(() => {
        setEntries(prev);
        showError("Could not schedule the task.");
      });
  }

  // ----- mutations -----

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
      setEntries((list) => [...list, optimistic]);
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
          setEntries((list) =>
            list.map((e) => (e.id === tempId ? created : e)),
          );
          router.refresh();
        })
        .catch(() => {
          setEntries((list) => list.filter((e) => e.id !== tempId));
          showError("Could not create the entry.");
        });
    } else {
      const id = current.entryId!;
      const prev = entries;
      setEntries((list) =>
        list.map((e) =>
          e.id === id
            ? {
                ...e,
                type: result.type,
                title: result.title,
                category_id: result.categoryId,
                start_at: result.startAt,
                end_at: result.endAt,
                all_day: result.allDay,
                description: result.description,
              }
            : e,
        ),
      );
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

  function onModalDelete() {
    if (!modal || modal.mode !== "edit" || !modal.entryId) return;
    const id = modal.entryId;
    setModal(null);
    const prev = entries;
    setEntries((list) => list.filter((e) => e.id !== id));
    deleteEntry(id)
      .then(() => router.refresh())
      .catch(() => {
        setEntries(prev);
        showError("Could not delete the entry.");
      });
  }

  // ----- navigation -----

  const stepDays = view === "day" ? 1 : view === "3day" ? 3 : 7;

  /** On phones the arrows scroll the grid; the settle handler moves the anchor. */
  function scrollPages(dir: -1 | 1): boolean {
    const el = scrollRef.current;
    if (!paging || !el || !pageWidth) return false;
    el.scrollBy({ left: dir * pageWidth, behavior: "smooth" });
    return true;
  }

  function goPrev() {
    if (scrollPages(-1)) return;
    setAnchor((a) =>
      view === "month" ? addMonths(a, -1) : addDays(a, -stepDays),
    );
  }
  function goNext() {
    if (scrollPages(1)) return;
    setAnchor((a) =>
      view === "month" ? addMonths(a, 1) : addDays(a, stepDays),
    );
  }
  function goToday() {
    setAnchor(startOfDay(new Date()));
  }

  // Google-Calendar-style keys; inactive while typing or in a dialog.
  useShortcuts({
    n: () =>
      setModal({
        mode: "create",
        initial: createInitial("event", defaultNewStart(), true),
      }),
    t: goToday,
    d: () => setView("day"),
    w: () => setView("week"),
    m: () => setView("month"),
    s: () => setSidebarOpen((v) => !v),
    ArrowLeft: goPrev,
    ArrowRight: goNext,
  });

  // ----- render -----

  // The header follows the page in view, not the wider rendered window.
  const kw = isoWeek(visibleDays[Math.min(3, visibleDays.length - 1)]);
  const headerMain = view === "month" ? monthLabel(anchor) : `KW ${kw}`;
  const headerSub =
    view === "month"
      ? ""
      : view === "day"
        ? formatDayLong(visibleDays[0])
        : dateRangeLabel(visibleDays[0], visibleDays[visibleDays.length - 1]);

  const headerButton =
    "rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 sm:p-2";

  // While paging each column is exactly one page-slice wide; otherwise the
  // columns share the row as before.
  const dayColStyle = paging && dayWidth ? { width: dayWidth } : undefined;
  const dayColClass = paging && dayWidth ? "shrink-0" : "flex-1 basis-0";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-800/80 px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
          {headerMain}
        </h1>
        {headerSub && (
          <span className="text-sm text-neutral-500">{headerSub}</span>
        )}

        {/* On phones the controls take a clean full row of their own. The view
            set differs per breakpoint (see VIEW_OPTIONS.showOn). */}
        <div className="flex w-full flex-wrap items-center justify-between gap-1 sm:ml-auto sm:w-auto sm:justify-start sm:gap-1.5">
          <div className="flex rounded-lg border border-neutral-800 bg-neutral-900/60 p-0.5 text-xs">
            {VIEW_OPTIONS.map((option) => {
              const visibility =
                option.showOn === "mobile"
                  ? "sm:hidden "
                  : option.showOn === "desktop"
                    ? "hidden sm:block "
                    : "";
              return (
                <button
                  key={option.key}
                  onClick={() => setView(option.key)}
                  className={`${visibility}${
                    view === option.key
                      ? "rounded-md bg-neutral-800 px-2.5 py-1 font-medium text-neutral-100"
                      : "rounded-md px-2.5 py-1 text-neutral-400 transition-colors hover:text-neutral-200"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={goToday}
            title="Today (T)"
            className="rounded-lg px-2 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-100 sm:px-3"
          >
            Today
          </button>
          <button onClick={goPrev} className={headerButton} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={goNext} className={headerButton} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              setModal({
                mode: "create",
                initial: createInitial("event", defaultNewStart(), true),
              })
            }
            title="New entry (N)"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:ml-1 sm:px-3"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </button>
          {/* hidden on phones: dragging from the sidebar needs a mouse */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className={`hidden sm:block ${headerButton} ${sidebarOpen ? "bg-neutral-900 text-neutral-100" : ""}`}
            aria-label="Toggle task sidebar"
            title="To plan (S)"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {view === "month" ? (
          <MonthView
            anchor={anchor}
            now={now}
            entries={timedEntries}
            categoryById={categoryById}
            journalByDate={journalByDate}
            dragTask={dragTask}
            onCreateAt={(day) =>
              setModal({
                mode: "create",
                initial: createInitial(
                  "event",
                  addMinutes(startOfDay(day), 9 * 60),
                  true,
                ),
              })
            }
            onSelectEntry={(entry) =>
              setModal({ mode: "edit", entryId: entry.id, initial: editInitial(entry) })
            }
            onDropTaskOnDay={(day) => {
              const task = dragTask;
              setDragTask(null);
              if (!task) return;
              const start = addMinutes(startOfDay(day), 9 * 60);
              const end = addMinutes(start, TASK_DROP_DURATION);
              const prev = entries;
              setEntries((list) =>
                list.map((ev) =>
                  ev.id === task.id
                    ? {
                        ...ev,
                        start_at: start.toISOString(),
                        end_at: end.toISOString(),
                      }
                    : ev,
                ),
              );
              scheduleEntry(task.id, start.toISOString(), end.toISOString())
                .then(() => router.refresh())
                .catch(() => {
                  setEntries(prev);
                  showError("Could not schedule the task.");
                });
            }}
          />
        ) : (
          <div
            ref={scrollRef}
            className={`min-w-0 flex-1 overflow-auto ${
              paging
                ? // native paging: snap a page at a time, keep the gutter clear
                  // of the snap position, and don't trigger browser back-swipe
                  "snap-x snap-mandatory scroll-pl-14 overscroll-x-contain"
                : ""
            }`}
          >
            {/* While paging, the window is sized so one page fills the port
                exactly; otherwise the wider desktop views keep a minimum. */}
            <div
              ref={gridInnerRef}
              style={
                paging && dayWidth
                  ? { width: GUTTER_PX + dayWidth * days.length }
                  : {
                      minWidth:
                        view === "day" ? 360 : view === "3day" ? 540 : 640,
                    }
              }
            >
              <div className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur">
                <div className="flex">
                <div className="sticky left-0 z-10 w-14 shrink-0 bg-neutral-950/95 backdrop-blur" />
                {days.map((day, i) => {
                  const isToday = isSameDay(day, now);
                  return (
                    <div
                      key={i}
                      style={dayColStyle}
                      className={`flex items-center justify-center gap-1.5 border-l border-neutral-800/40 py-2.5 text-sm ${dayColClass} ${
                        paging && i % daysPerPage === 0 ? "snap-start" : ""
                      }`}
                    >
                      <span
                        className={isToday ? "text-neutral-100" : "text-neutral-500"}
                      >
                        {WEEKDAYS_SHORT[(day.getDay() + 6) % 7]}
                      </span>
                      <span
                        className={
                          isToday
                            ? "flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white"
                            : "text-neutral-300"
                        }
                      >
                        {day.getDate()}
                      </span>
                      <JournalDayMarker entry={journalByDate.get(toDateKey(day))} />
                    </div>
                  );
                })}
                </div>

                {allDay.rows > 0 && (
                  <div className="flex border-t border-neutral-800/60">
                    <div className="sticky left-0 z-10 flex w-14 shrink-0 items-start justify-end bg-neutral-950/95 pr-2 pt-1.5 text-[10px] uppercase tracking-wide text-neutral-600 backdrop-blur">
                      all day
                    </div>
                    <div
                      className="relative flex-1"
                      style={{
                        height:
                          allDay.rows * (ALLDAY_BAR_H + ALLDAY_BAR_GAP) +
                          ALLDAY_BAR_GAP,
                      }}
                    >
                      {allDay.bars.map((bar) => {
                        const category = bar.entry.category_id
                          ? categoryById.get(bar.entry.category_id)
                          : undefined;
                        const pal = blockPalette(category?.color ?? NEUTRAL);
                        const past = isFinished(bar.entry, now);
                        return (
                          <div
                            key={bar.entry.id}
                            onClick={() =>
                              setModal({
                                mode: "edit",
                                entryId: bar.entry.id,
                                initial: editInitial(bar.entry),
                              })
                            }
                            className={`absolute flex cursor-pointer items-center overflow-hidden rounded-md border px-2 text-[11px] leading-none transition-[filter] hover:brightness-110 ${past ? "opacity-60" : ""}`}
                            style={{
                              top:
                                bar.row * (ALLDAY_BAR_H + ALLDAY_BAR_GAP) +
                                ALLDAY_BAR_GAP,
                              height: ALLDAY_BAR_H,
                              left: `calc(${(bar.firstCol / days.length) * 100}% + 2px)`,
                              width: `calc(${((bar.lastCol - bar.firstCol + 1) / days.length) * 100}% - 4px)`,
                              backgroundColor: pal.bg,
                              color: pal.title,
                              borderColor:
                                bar.entry.type === "goal"
                                  ? goalFrame(category?.color ?? NEUTRAL)
                                  : "rgba(0,0,0,0.2)",
                              borderWidth: bar.entry.type === "goal" ? 2 : 1,
                              borderTopLeftRadius: bar.continuesLeft ? 0 : undefined,
                              borderBottomLeftRadius: bar.continuesLeft
                                ? 0
                                : undefined,
                              borderTopRightRadius: bar.continuesRight
                                ? 0
                                : undefined,
                              borderBottomRightRadius: bar.continuesRight
                                ? 0
                                : undefined,
                            }}
                          >
                            <span className="truncate font-medium">
                              {bar.entry.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex">
                <div
                  className="sticky left-0 z-10 w-14 shrink-0 bg-neutral-950"
                  style={{ height: GRID_HEIGHT }}
                >
                  {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                    <span
                      key={h}
                      className="absolute right-2 -translate-y-1/2 text-[11px] text-neutral-600"
                      style={{ top: h * HOUR_PX }}
                    >
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>

                <div
                  ref={colsRef}
                  className="relative flex flex-1"
                  onDragOver={onGridDragOver}
                  onDrop={onGridDrop}
                >
                  {Array.from({ length: 48 }, (_, i) => (
                    <div
                      key={i}
                      className={`pointer-events-none absolute inset-x-0 ${
                        i % 2 === 0
                          ? "border-t border-neutral-800/60"
                          : "border-t border-dashed border-neutral-800/35"
                      }`}
                      style={{ top: i * SLOT_PX }}
                    />
                  ))}
                  {days.map((day, di) => (
                    <div
                      key={di}
                      className={`relative border-l border-neutral-800/40 ${dayColClass} ${
                        paging && di % daysPerPage === 0 ? "snap-start" : ""
                      }`}
                      style={{ height: GRID_HEIGHT, ...dayColStyle }}
                    >
                      {Array.from({ length: 48 }, (_, s) => (
                        <button
                          key={s}
                          onPointerDown={(e) => onSlotPointerDown(e, di, s)}
                          onPointerMove={onSlotPointerMove}
                          onPointerUp={(e) => onSlotPointerUp(e, di, s)}
                          onPointerCancel={onSlotPointerCancel}
                          className="group absolute inset-x-0 z-[1] flex items-center justify-center transition-colors hover:bg-neutral-800/25"
                          style={{ top: s * SLOT_PX, height: SLOT_PX }}
                          aria-label="Add event"
                        >
                          <Plus className="h-3 w-3 text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      ))}
                      {entriesByDay[di].map((item) => (
                        <EntryBlock
                          key={item.entry.id}
                          item={item}
                          category={
                            item.entry.category_id
                              ? categoryById.get(item.entry.category_id)
                              : undefined
                          }
                          slotPx={SLOT_PX}
                          now={now}
                          dimmed={drag?.entryId === item.entry.id}
                          onPointerDown={(e) => onEntryPointerDown(e, item, di)}
                          onPointerMove={onEntryPointerMove}
                          onPointerUp={onEntryPointerUp}
                          onResizePointerDown={(e, edge) =>
                            onEntryResizeDown(e, item, di, edge)
                          }
                        />
                      ))}
                      {drag && drag.day === di && (
                        <GhostBlock
                          startMin={drag.startMin}
                          durationMin={drag.durationMin}
                          label={drag.title}
                        />
                      )}
                      {dragTask && dropPreview && dropPreview.day === di && (
                        <GhostBlock
                          startMin={dropPreview.startMin}
                          durationMin={TASK_DROP_DURATION}
                          label={dragTask.title}
                        />
                      )}
                      {createDrag && createDrag.day === di && (
                        <GhostBlock
                          startMin={createDrag.startMin}
                          durationMin={createDrag.endMin - createDrag.startMin}
                          label="New event"
                        />
                      )}
                      {isSameDay(day, now) && (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-10"
                          style={{
                            top: (minutesSinceMidnight(now) / 30) * SLOT_PX,
                          }}
                        >
                          <div className="relative border-t-2 border-accent">
                            <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full bg-accent" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <TaskSidebar
          open={sidebarOpen}
          tasks={openTasks}
          categoryById={categoryById}
          onDragStartTask={setDragTask}
          onDragEndTask={() => {
            setDragTask(null);
            setDropPreview(null);
          }}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {modal && (
        <EntryModal
          mode={modal.mode}
          initial={modal.initial}
          categories={categories}
          onSave={onModalSave}
          onDelete={modal.mode === "edit" ? onModalDelete : undefined}
          onClose={() => setModal(null)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

function GhostBlock({
  startMin,
  durationMin,
  label,
}: {
  startMin: number;
  durationMin: number;
  label: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0.5 z-20 overflow-hidden rounded-md border border-accent/70 bg-accent/15 px-1.5 py-1"
      style={{
        top: (startMin / 30) * SLOT_PX + 1,
        height: (durationMin / 30) * SLOT_PX - 2,
      }}
    >
      <p className="truncate text-xs font-medium text-neutral-100">{label}</p>
      <p className="text-[10px] text-neutral-300">
        {minutesLabel(startMin)} – {minutesLabel(startMin + durationMin)}
      </p>
    </div>
  );
}
