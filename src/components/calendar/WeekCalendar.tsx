"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, PanelRight, Plus } from "lucide-react";
import {
  createEntry,
  deleteEntry,
  restoreEntry,
  scheduleEntry,
  updateEntry,
} from "@/app/actions";
import { TAB_RESELECT_EVENT } from "@/components/BottomNav";
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

/** The views a layout offers (phones and desktop each have their own set). */
function allowedViews(mobile: boolean): View[] {
  return VIEW_OPTIONS.filter((v) =>
    mobile ? v.showOn !== "desktop" : v.showOn !== "mobile",
  ).map((v) => v.key);
}

/** Each layout remembers its own last view, so rotating a phone into the wide
 * layout and back returns to where each one was. */
function viewStorageKey(mobile: boolean) {
  return mobile ? `${VIEW_STORAGE_KEY}_phone` : VIEW_STORAGE_KEY;
}

/** The last view used on this layout, or its default (Day on phones, Week on
 * desktop) when there is none — or the stored one doesn't exist here. */
function restoreView(mobile: boolean): View {
  let stored: string | null = null;
  try {
    stored =
      localStorage.getItem(viewStorageKey(mobile)) ??
      localStorage.getItem(VIEW_STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode) — fall through to the default */
  }
  if (stored && allowedViews(mobile).includes(stored as View)) {
    return stored as View;
  }
  return mobile ? "day" : "week";
}

// Phone paging. The vertical (time) axis is its own scroll container; the
// horizontal (day) axis is a transform-based pager driven by touch. A gesture
// locks to a single axis on its first move, so a swipe is *either* vertical or
// horizontal — never a diagonal mixture — and a sideways swipe never disturbs
// the vertical position. The grid renders one page either side of the visible
// one so a swipe slides into already-rendered days; on settle the anchor moves
// and the pager silently recentres before paint.
const GUTTER_PX = 56; // the w-14 time gutter
const PAGES_EACH_SIDE = 1;
const AXIS_LOCK_PX = 8; // finger travel before a swipe commits to one axis
// A touch on the grid only counts as "tap to create" when the finger barely
// moved, the grid didn't scroll under it, and the whole thing was over
// quickly. Without these, every vertical scroll ended in the new-entry dialog.
const TAP_SLOP_PX = 10; // finger travel a tap may drift
const TAP_MAX_MS = 500; // longer than this is a press, not a tap
const SCROLL_QUIET_MS = 350; // a tap this soon after scrolling is a fling stop
const SWIPE_MS = 260;
const SWIPE_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const SWIPE_TRANSITION = `transform ${SWIPE_MS}ms ${SWIPE_EASE}`;

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

/** Where the time grid rests: 07:00 at the top — unless that would leave the
 * current time below the fold, then far enough down to bring "now" in. */
function restingScrollTop(el: HTMLElement, showsToday: boolean): number {
  const base = SCROLL_TO_HOUR * HOUR_PX;
  if (!showsToday) return base;
  const nowY = (minutesSinceMidnight(new Date()) / 30) * SLOT_PX;
  const visible = el.clientHeight * 0.8; // the rest sits under bars
  return nowY < base + visible ? base : nowY - visible * 0.6;
}

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
  const { message: toast, show: showToast, dismiss: dismissToast } = useToast();

  // The calendar only ever renders in the browser (see ClientOnly on the page),
  // so the layout and the last view used are known for the very first frame —
  // no desktop week that snaps to Day a moment later on a phone.
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_MEDIA).matches,
  );
  const [view, setView] = useState<View>(() =>
    restoreView(window.matchMedia(MOBILE_MEDIA).matches),
  );
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
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
  const [viewportW, setViewportW] = useState(0);
  const [monthW, setMonthW] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<HTMLDivElement | null>(null);
  // Phone pager: the three horizontally-translated strips (day headers, the
  // all-day band, the columns) plus the element the swipe gesture listens on.
  const mobileRootRef = useRef<HTMLDivElement | null>(null);
  const headerStripRef = useRef<HTMLDivElement | null>(null);
  const allDayStripRef = useRef<HTMLDivElement | null>(null);
  const bodyStripRef = useRef<HTMLDivElement | null>(null);
  const animatingRef = useRef(false);
  // Month pager (phones): a strip of prev/current/next months translated by the
  // same axis-locked swipe. `suppressClickRef` swallows the day-cell click that
  // would otherwise fire at the end of a swipe.
  const monthRootRef = useRef<HTMLDivElement | null>(null);
  const monthStripRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
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
    startClientX: number;
    startClientY: number;
    startedAt: number;
    startScrollTop: number;
    moved: boolean; // a pointer drag that sizes the new entry
    panned: boolean; // the finger travelled — this was a scroll, not a tap
  } | null>(null);
  /** When the grid last scrolled, so a tap that stops a fling doesn't create. */
  const lastScrollAtRef = useRef(0);
  const createDragStateRef = useRef<{
    day: number;
    startMin: number;
    endMin: number;
  } | null>(null);

  // Re-adopt server state whenever a fresh payload arrives (router.refresh).
  const [syncedEntries, setSyncedEntries] = useState(initialEntries);
  if (syncedEntries !== initialEntries) {
    setSyncedEntries(initialEntries);
    setEntries(initialEntries);
  }

  useEffect(() => {
    if (!allowedViews(isMobile).includes(view)) return;
    try {
      localStorage.setItem(viewStorageKey(isMobile), view);
    } catch {
      /* storage unavailable — the view just isn't remembered */
    }
  }, [view, isMobile]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Track the phone breakpoint: on mobile the day columns fit the viewport and
  // the grid pages via horizontal swipe instead of scrolling. Crossing it (a
  // phone rotated, a window resized) switches to that layout's own view — the
  // week view has no business on a portrait phone, nor "3 days" on desktop.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA);
    const update = () => {
      setIsMobile(mq.matches);
      setView(restoreView(mq.matches));
    };
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const showsTodayRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (view !== "month" && el) {
      el.scrollTo({ top: restingScrollTop(el, showsTodayRef.current) });
    }
  }, [view, isMobile]);

  // Tapping the Calendar tab while it is open jumps back to today.
  useEffect(() => {
    const onReselect = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "/calendar") return;
      setAnchor(startOfDay(new Date()));
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: restingScrollTop(el, true), behavior: "smooth" });
    };
    window.addEventListener(TAB_RESELECT_EVENT, onReselect);
    return () => window.removeEventListener(TAB_RESELECT_EVENT, onReselect);
  }, []);

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

  // A layout effect, so the flag is current before the scroll effect reads it.
  useLayoutEffect(() => {
    showsTodayRef.current = visibleDays.some((d) => isSameDay(d, new Date()));
  }, [visibleDays]);

  /** Whether the phone paging (windowed days + transform pager) is in effect. */
  const paging = isMobile && (view === "day" || view === "3day");

  /** Phone month view pages between months with the same swipe gesture. */
  const monthPaging = isMobile && view === "month";

  /**
   * Days actually rendered. On phones that's the visible page plus one page
   * either side, so a swipe slides into already-rendered content instead of
   * re-rendering the grid mid-gesture.
   */
  const days = useMemo(() => {
    if (!paging) return visibleDays;
    const start = addDays(anchor, -PAGES_EACH_SIDE * daysPerPage);
    const total = daysPerPage * (1 + 2 * PAGES_EACH_SIDE);
    return Array.from({ length: total }, (_, i) => addDays(start, i));
  }, [paging, visibleDays, anchor, daysPerPage]);

  // Measure the scroll port so a page can be sized to exactly fill it. The
  // layout pass measures synchronously (no empty first frame); the observer
  // keeps it in sync on later resizes / rotation.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) setViewportW(el.clientWidth);
  }, [view, isMobile]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, isMobile]);

  const dayWidth =
    paging && viewportW > 0 ? (viewportW - GUTTER_PX) / daysPerPage : 0;
  const pageWidth = dayWidth * daysPerPage;
  const stripWidth = dayWidth * days.length;
  // The pager only knows its pixel page width once the scroll port has been
  // measured, and that cannot happen while another view owns the screen —
  // coming from the month view there is no measurement yet. Percentages give
  // the strip the right shape immediately: one page wide per rendered page,
  // equal columns, parked on the middle page. Without them the columns fell
  // back to flex-1, so switching out of the month view squeezed every rendered
  // page onto one screen with no offset: the day headers named the wrong day,
  // and in the 3-day view they were far too narrow to read.
  const PAGES = 1 + 2 * PAGES_EACH_SIDE;
  const stripPercent = `${(days.length / daysPerPage) * 100}%`;
  const columnPercent = `${100 / days.length}%`;
  const restingOffset = `translate3d(-${100 / PAGES}%, 0, 0)`;

  // ----- phone pager: transform + axis-locked swipe -----

  const setStripTransform = (x: number) => {
    const t = `translate3d(${x}px, 0, 0)`;
    for (const el of [
      headerStripRef.current,
      allDayStripRef.current,
      bodyStripRef.current,
    ]) {
      if (el) el.style.transform = t;
    }
  };

  const setStripTransition = (value: string) => {
    for (const el of [
      headerStripRef.current,
      allDayStripRef.current,
      bodyStripRef.current,
    ]) {
      if (el) el.style.transition = value;
    }
  };

  // Recentre the pager on the middle page whenever the anchor (a settled swipe)
  // or the page width changes. Runs before paint so the recentre is invisible.
  useLayoutEffect(() => {
    if (!paging || !pageWidth) return;
    setStripTransition("none");
    setStripTransform(-pageWidth);
  }, [anchor, pageWidth, paging, view]);

  /** Animate to the previous/next page, then commit the anchor. */
  function animateToPage(delta: -1 | 1): boolean {
    if (!paging || !pageWidth) return false;
    if (animatingRef.current) return true;
    animatingRef.current = true;
    setStripTransition(SWIPE_TRANSITION);
    setStripTransform(-pageWidth - delta * pageWidth);
    window.setTimeout(() => {
      setStripTransition("none");
      animatingRef.current = false;
      setAnchor((a) => addDays(a, delta * daysPerPage));
    }, SWIPE_MS + 20);
    return true;
  }

  // The swipe gesture. `touch-action: pan-y` lets the browser own vertical
  // scrolling while it hands us the horizontal component; we pick the axis on
  // the first meaningful move and, once horizontal, drive the transform and
  // preventDefault so the vertical axis stays put.
  useEffect(() => {
    if (!paging || !pageWidth) return;
    const root = mobileRootRef.current;
    if (!root) return;
    let startX = 0;
    let startY = 0;
    let axis: "x" | "y" | null = null;

    const onStart = (e: TouchEvent) => {
      if (animatingRef.current || e.touches.length !== 1) {
        axis = "y"; // ignore multi-touch / in-flight animations
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      axis = null;
      setStripTransition("none");
    };

    const onMove = (e: TouchEvent) => {
      if (axis === "y" || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (axis === null) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "x") {
          // A horizontal swipe pages the grid, so abort any pending tap / create
          // / entry interaction — its trailing pointerup then does nothing.
          dragRef.current = null;
          dragStateRef.current = null;
          createDragRef.current = null;
          createDragStateRef.current = null;
          setDrag(null);
          setCreateDrag(null);
        }
      }
      if (axis === "x") {
        e.preventDefault();
        setStripTransform(-pageWidth + dx);
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (axis !== "x") {
        axis = null;
        return;
      }
      axis = null;
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
      const commit = Math.max(pageWidth * 0.18, 44);
      const delta = dx <= -commit ? 1 : dx >= commit ? -1 : 0;
      animatingRef.current = true;
      setStripTransition(SWIPE_TRANSITION);
      setStripTransform(-pageWidth - delta * pageWidth);
      window.setTimeout(() => {
        setStripTransition("none");
        animatingRef.current = false;
        if (delta !== 0) setAnchor((a) => addDays(a, delta * daysPerPage));
        else setStripTransform(-pageWidth);
      }, SWIPE_MS + 20);
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [paging, pageWidth, daysPerPage]);

  // ----- month pager (phones): swipe left/right to change month -----

  // Measure the month pager port so each month is sized to exactly fill it.
  useLayoutEffect(() => {
    const el = monthRootRef.current;
    if (el) setMonthW(el.clientWidth);
  }, [view, isMobile]);
  useEffect(() => {
    const el = monthRootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMonthW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, isMobile]);

  // Recentre the month strip on the middle (current) month before paint.
  useLayoutEffect(() => {
    if (!monthPaging || !monthW) return;
    const el = monthStripRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translate3d(${-monthW}px, 0, 0)`;
    }
  }, [anchor, monthW, monthPaging]);

  useEffect(() => {
    if (!monthPaging || !monthW) return;
    const root = monthRootRef.current;
    const strip = monthStripRef.current;
    if (!root || !strip) return;
    let startX = 0;
    let startY = 0;
    let axis: "x" | "y" | null = null;

    const onStart = (e: TouchEvent) => {
      if (animatingRef.current || e.touches.length !== 1) {
        axis = "y";
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      axis = null;
      strip.style.transition = "none";
    };
    const onMove = (e: TouchEvent) => {
      if (axis === "y" || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (axis === null) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axis === "x") {
        e.preventDefault();
        strip.style.transform = `translate3d(${-monthW + dx}px, 0, 0)`;
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (axis !== "x") {
        axis = null;
        return;
      }
      axis = null;
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
      // A real horizontal swipe must not also fire the tapped day cell's click.
      if (Math.abs(dx) > AXIS_LOCK_PX) {
        suppressClickRef.current = true;
        window.setTimeout(() => (suppressClickRef.current = false), 400);
      }
      const commit = Math.max(monthW * 0.18, 44);
      const delta = dx <= -commit ? 1 : dx >= commit ? -1 : 0;
      animatingRef.current = true;
      strip.style.transition = SWIPE_TRANSITION;
      strip.style.transform = `translate3d(${-monthW - delta * monthW}px, 0, 0)`;
      window.setTimeout(() => {
        strip.style.transition = "none";
        animatingRef.current = false;
        if (delta !== 0) setAnchor((a) => addMonths(a, delta));
        else strip.style.transform = `translate3d(${-monthW}px, 0, 0)`;
      }, SWIPE_MS + 20);
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [monthPaging, monthW]);

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
    // On phones a touch over a block pans/pages the grid — the swipe gesture
    // owns it. Moving/resizing a block stays a pointer-device (mouse/pen)
    // affordance; tapping still opens the editor.
    if (e.pointerType === "touch") return;
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
        showToast("Could not update the entry.");
      });
  }

  function onEntryPointerCancel() {
    dragRef.current = null;
    dragStateRef.current = null;
    setDrag(null);
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
    // Capturing a touch keeps the slot receiving events through a scroll, so
    // the gesture ends in a pointerup here instead of a pointercancel. Only
    // pointer devices (which drag to size a new entry) need the capture.
    if (e.pointerType !== "touch") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    createDragRef.current = {
      dayIndex,
      anchorMin: slotIndex * 30,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startedAt: e.timeStamp,
      startScrollTop: scrollRef.current?.scrollTop ?? 0,
      moved: false,
      panned: false,
    };
  }

  function onSlotPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = createDragRef.current;
    if (!d) return;
    if (
      Math.abs(e.clientX - d.startClientX) > TAP_SLOP_PX ||
      Math.abs(e.clientY - d.startClientY) > TAP_SLOP_PX
    ) {
      d.panned = true;
    }
    // On phones the grid pages/scrolls under a touch; drag-to-create is a
    // pointer-device affordance (tap still creates at that slot).
    if (e.pointerType === "touch") return;
    if (!colsRef.current) return;
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
    e: React.PointerEvent<HTMLButtonElement>,
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
      if (e.pointerType === "touch" && !isTap(d, e.timeStamp)) return;
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

  function markScrolled(e: React.UIEvent) {
    lastScrollAtRef.current = e.timeStamp;
  }

  /**
   * Did this touch end as a tap? Scrolling the grid drags the finger across
   * slots and still ends in a pointerup on one of them, so a tap has to have
   * stayed put, left the scroll position alone, and been quick — and must not
   * be the tap that catches a fling.
   */
  function isTap(
    d: { startedAt: number; startScrollTop: number; panned: boolean },
    endedAt: number,
  ) {
    if (d.panned) return false;
    if (endedAt - d.startedAt > TAP_MAX_MS) return false;
    if (endedAt - lastScrollAtRef.current < SCROLL_QUIET_MS) return false;
    const sc = scrollRef.current;
    if (sc && Math.abs(sc.scrollTop - d.startScrollTop) > 2) return false;
    return true;
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
        : visibleDays.some((d) => isSameDay(d, current));
    if (inView && view !== "month") {
      const next = new Date(current);
      const m = current.getMinutes();
      next.setMinutes(m % 30 === 0 ? m : m + (30 - (m % 30)), 0, 0);
      return next;
    }
    const base = view === "month" ? startOfMonth(anchor) : visibleDays[0];
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
        showToast("Could not schedule the task.");
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
          showToast("Could not create the entry.");
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
          showToast("Could not save the entry.");
        });
    }
  }

  function onModalDelete() {
    if (!modal || modal.mode !== "edit" || !modal.entryId) return;
    const entry = entries.find((e) => e.id === modal.entryId);
    setModal(null);
    if (!entry) return;
    const putBack = () =>
      setEntries((list) =>
        list.some((e) => e.id === entry.id) ? list : [...list, entry],
      );
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    const deleted = deleteEntry(entry.id)
      .then(() => router.refresh())
      .catch(() => {
        putBack();
        showToast("Could not delete the entry.");
      });
    // One tap in the dialog and it is gone for good — offer the way back.
    showToast("Entry deleted", {
      label: "Undo",
      run: () => {
        putBack();
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

  // ----- navigation -----

  const stepDays = view === "day" ? 1 : view === "3day" ? 3 : 7;

  function goPrev() {
    if (animateToPage(-1)) return;
    setAnchor((a) =>
      view === "month" ? addMonths(a, -1) : addDays(a, -stepDays),
    );
  }
  function goNext() {
    if (animateToPage(1)) return;
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
    w: () => setView(isMobile ? "3day" : "week"),
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

  // While paging each column is exactly one page-slice wide; otherwise the
  // columns share the row as before.
  const dayColStyle = paging ? { width: dayWidth || columnPercent } : undefined;
  const dayColClass = paging ? "shrink-0" : "flex-1 basis-0";

  // ----- shared grid pieces (used by both the desktop grid and the phone pager) -----

  const dayHeaderCell = (day: Date, i: number) => {
    const isToday = isSameDay(day, now);
    return (
      <div
        key={i}
        style={dayColStyle}
        className={`flex items-center justify-center gap-1.5 border-l border-neutral-800/40 py-2.5 text-sm ${dayColClass}`}
      >
        <span className={isToday ? "text-neutral-100" : "text-neutral-500"}>
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
  };

  const allDayBarEls = allDay.bars.map((bar) => {
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
          top: bar.row * (ALLDAY_BAR_H + ALLDAY_BAR_GAP) + ALLDAY_BAR_GAP,
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
          borderBottomLeftRadius: bar.continuesLeft ? 0 : undefined,
          borderTopRightRadius: bar.continuesRight ? 0 : undefined,
          borderBottomRightRadius: bar.continuesRight ? 0 : undefined,
        }}
      >
        <span className="truncate font-medium">{bar.entry.title}</span>
      </div>
    );
  });

  const allDayHeight =
    allDay.rows * (ALLDAY_BAR_H + ALLDAY_BAR_GAP) + ALLDAY_BAR_GAP;

  const slotLines = Array.from({ length: 48 }, (_, i) => (
    <div
      key={i}
      className={`pointer-events-none absolute inset-x-0 ${
        i % 2 === 0
          ? "border-t border-neutral-800/60"
          : "border-t border-dashed border-neutral-800/35"
      }`}
      style={{ top: i * SLOT_PX }}
    />
  ));

  const dayBodyColumn = (day: Date, di: number) => (
    <div
      key={di}
      className={`relative border-l border-neutral-800/40 ${dayColClass}`}
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
          onPointerCancel={onEntryPointerCancel}
          onResizePointerDown={(e, edge) => onEntryResizeDown(e, item, di, edge)}
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
          style={{ top: (minutesSinceMidnight(now) / 30) * SLOT_PX }}
        >
          <div className="relative border-t-2 border-accent">
            <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full bg-accent" />
          </div>
        </div>
      )}
    </div>
  );

  const hourGutter = (
    <>
      {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
        <span
          key={h}
          className="absolute right-2 -translate-y-1/2 text-[11px] text-neutral-600"
          style={{ top: h * HOUR_PX }}
        >
          {String(h).padStart(2, "0")}:00
        </span>
      ))}
    </>
  );

  const renderMonth = (monthAnchor: Date) => (
    <MonthView
      anchor={monthAnchor}
      now={now}
      entries={timedEntries}
      categoryById={categoryById}
      journalByDate={journalByDate}
      dragTask={dragTask}
      // Drill into a day: same gesture on phone and desktop. Creating an entry
      // from the month grid now goes through that day view (or the New button),
      // which keeps a tap unambiguous — especially next to the swipe pager.
      onOpenDay={(day) => {
        setAnchor(startOfDay(day));
        setView("day");
      }}
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
              ? { ...ev, start_at: start.toISOString(), end_at: end.toISOString() }
              : ev,
          ),
        );
        scheduleEntry(task.id, start.toISOString(), end.toISOString())
          .then(() => router.refresh())
          .catch(() => {
            setEntries(prev);
            showToast("Could not schedule the task.");
          });
      }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-neutral-800 px-4 pb-3 pt-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-baseline gap-x-2.5 sm:flex-none">
          <h1 className="shrink-0 text-xl font-bold tracking-tight text-neutral-50">
            {headerMain}
          </h1>
          {headerSub && (
            <span className="truncate text-sm text-neutral-500">{headerSub}</span>
          )}
        </div>

        {/* On a phone New closes the title row, like on every other page; on
            desktop it follows the navigation controls (hence the order). */}
        <button
          onClick={() =>
            setModal({
              mode: "create",
              initial: createInitial("event", defaultNewStart(), true),
            })
          }
          title="New entry (N)"
          className="btn-primary shrink-0 px-3.5 sm:order-2 sm:py-1.5"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New
        </button>

        {/* The view set differs per breakpoint (see VIEW_OPTIONS.showOn); on
            phones the controls take a clean row of their own. */}
        <div className="flex w-full items-center justify-between gap-1 sm:order-1 sm:ml-auto sm:w-auto sm:justify-start sm:gap-1.5">
          <div className="segmented">
            {VIEW_OPTIONS.map((option) => {
              const visibility =
                option.showOn === "mobile"
                  ? "sm:hidden"
                  : option.showOn === "desktop"
                    ? "hidden sm:block"
                    : "";
              return (
                <button
                  key={option.key}
                  onClick={() => setView(option.key)}
                  aria-pressed={view === option.key}
                  className={visibility}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={goToday}
            title="Today (T)"
            className="rounded-lg px-3 py-2 text-sm font-medium text-accent-bright transition-opacity active:opacity-50 sm:py-1.5"
          >
            Today
          </button>
          {/* Arrows are for pointer devices; on phones you swipe the grid. */}
          <button
            onClick={goPrev}
            className="icon-btn hidden sm:inline-flex"
            aria-label="Previous"
            title="Previous (←)"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goNext}
            className="icon-btn hidden sm:inline-flex"
            aria-label="Next"
            title="Next (→)"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* hidden on phones: dragging from the sidebar needs a mouse */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className={`icon-btn hidden sm:order-3 sm:inline-flex ${sidebarOpen ? "bg-neutral-800 text-neutral-100" : ""}`}
          aria-label="Toggle the To-plan sidebar"
          aria-pressed={sidebarOpen}
          title="To plan (S)"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {view === "month" ? (
          monthPaging ? (
            // ---- phone month pager: a prev/current/next strip driven by the
            // same axis-locked swipe as the day views ----
            <div
              ref={monthRootRef}
              className="relative min-h-0 flex-1 overflow-hidden"
              style={{ touchAction: "pan-y" }}
              onClickCapture={(e) => {
                // swallow the click a settled swipe would otherwise land on a cell
                if (suppressClickRef.current) {
                  e.stopPropagation();
                  e.preventDefault();
                }
              }}
            >
              <div
                ref={monthStripRef}
                className="flex h-full will-change-transform"
                style={{ width: monthW ? monthW * 3 : undefined }}
              >
                {[-1, 0, 1].map((off) => (
                  <div
                    key={off}
                    className="flex h-full shrink-0 flex-col"
                    style={{ width: monthW || undefined }}
                  >
                    {renderMonth(addMonths(anchor, off))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            renderMonth(anchor)
          )
        ) : paging ? (
          // ---- phone pager: fixed header band + vertical-only scrolling body,
          // with day columns/labels driven horizontally by the swipe gesture ----
          <div
            ref={mobileRootRef}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ touchAction: "pan-y" }}
          >
            <div className="shrink-0 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur">
              <div className="flex">
                <div className="w-14 shrink-0" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div
                    ref={headerStripRef}
                    className="flex will-change-transform"
                    style={{
                      width: stripWidth || stripPercent,
                      transform: dayWidth ? undefined : restingOffset,
                    }}
                  >
                    {days.map(dayHeaderCell)}
                  </div>
                </div>
              </div>

              {allDay.rows > 0 && (
                <div className="flex border-t border-neutral-800/60">
                  <div className="flex w-14 shrink-0 items-start justify-end pr-2 pt-1.5 text-[10px] uppercase tracking-wide text-neutral-600">
                    all day
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div
                      ref={allDayStripRef}
                      className="relative will-change-transform"
                      style={{
                        height: allDayHeight,
                        width: stripWidth || stripPercent,
                        transform: dayWidth ? undefined : restingOffset,
                      }}
                    >
                      {allDayBarEls}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              ref={scrollRef}
              onScroll={markScrolled}
              // pb-bar: the grid runs full-screen under the floating tab bar,
              // and this lets its last hours scroll clear of it.
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-bar"
            >
              <div className="flex">
                <div
                  className="relative w-14 shrink-0 bg-neutral-950"
                  style={{ height: GRID_HEIGHT }}
                >
                  {hourGutter}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div
                    ref={bodyStripRef}
                    className="relative flex will-change-transform"
                    style={{
                      width: stripWidth || stripPercent,
                      height: GRID_HEIGHT,
                      transform: dayWidth ? undefined : restingOffset,
                    }}
                  >
                    {slotLines}
                    {days.map(dayBodyColumn)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={markScrolled}
            className="min-w-0 flex-1 overflow-auto"
          >
            <div
              // pb-bar only bites on a phone held sideways (zero on desktop)
              className="pb-bar"
              style={{
                minWidth: view === "day" ? 360 : view === "3day" ? 540 : 640,
              }}
            >
              <div className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur">
                <div className="flex">
                  <div className="sticky left-0 z-10 w-14 shrink-0 bg-neutral-950/95 backdrop-blur" />
                  {days.map(dayHeaderCell)}
                </div>

                {allDay.rows > 0 && (
                  <div className="flex border-t border-neutral-800/60">
                    <div className="sticky left-0 z-10 flex w-14 shrink-0 items-start justify-end bg-neutral-950/95 pr-2 pt-1.5 text-[10px] uppercase tracking-wide text-neutral-600 backdrop-blur">
                      all day
                    </div>
                    <div className="relative flex-1" style={{ height: allDayHeight }}>
                      {allDayBarEls}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex">
                <div
                  className="sticky left-0 z-10 w-14 shrink-0 bg-neutral-950"
                  style={{ height: GRID_HEIGHT }}
                >
                  {hourGutter}
                </div>

                <div
                  ref={colsRef}
                  className="relative flex flex-1"
                  onDragOver={onGridDragOver}
                  onDrop={onGridDrop}
                >
                  {slotLines}
                  {days.map(dayBodyColumn)}
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

      <Toast message={toast} onDismiss={dismissToast} />
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
