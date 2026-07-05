"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, PanelRight, Plus } from "lucide-react";
import {
  createEvent,
  createTask,
  deleteEvent,
  scheduleTask,
  updateEvent,
} from "@/app/actions";
import {
  addDays,
  addMinutes,
  formatTime,
  isSameDay,
  isoWeek,
  minutesSinceMidnight,
  startOfWeek,
  weekRangeLabel,
  WEEKDAYS_SHORT,
} from "@/lib/dates";
import type { CalendarEvent, Category, Task } from "@/lib/types";
import Toast, { useToast } from "@/components/Toast";
import EventModal, { type EventDraft } from "./EventModal";
import TaskSidebar from "./TaskSidebar";

const SLOT_PX = 28; // height of one 30-min slot
const HOUR_PX = SLOT_PX * 2;
const GRID_HEIGHT = 24 * HOUR_PX;
const SCROLL_TO_HOUR = 7;
const TASK_DROP_DURATION = 60;

type ModalState =
  | { mode: "create"; start: Date; durationMin: number }
  | { mode: "edit"; event: CalendarEvent };

type DragState = {
  eventId: string;
  title: string;
  day: number;
  startMin: number;
  durationMin: number;
};

type Positioned = {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function minutesLabel(min: number) {
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Assign overlapping events to side-by-side columns within a day. */
function layoutColumns(items: Positioned[]) {
  items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const active: Positioned[] = [];
  let cluster: Positioned[] = [];

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
  initialEvents,
  initialTasks,
  categories,
}: {
  initialEvents: CalendarEvent[];
  initialTasks: Task[];
  categories: Category[];
}) {
  const router = useRouter();
  const { message: toast, show: showError } = useToast();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState(initialEvents);
  const [tasks, setTasks] = useState(initialTasks);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    day: number;
    startMin: number;
  } | null>(null);
  const [now, setNow] = useState(() => new Date());

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    event: CalendarEvent;
    durationMin: number;
    grabOffsetMin: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => setEvents(initialEvents), [initialEvents]);
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: SCROLL_TO_HOUR * HOUR_PX });
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const scheduledTaskIds = useMemo(
    () =>
      new Set(
        events.map((e) => e.task_id).filter((id): id is string => id !== null),
      ),
    [events],
  );

  const openTasks = useMemo(
    () => tasks.filter((t) => !t.done && !scheduledTaskIds.has(t.id)),
    [tasks, scheduledTaskIds],
  );

  const eventsByDay = useMemo(() => {
    const byDay: Positioned[][] = days.map(() => []);
    for (const event of events) {
      const start = new Date(event.start_at);
      const dayIndex = days.findIndex((d) => isSameDay(start, d));
      if (dayIndex === -1) continue;
      const end = new Date(event.end_at);
      const startMin = minutesSinceMidnight(start);
      const endMin = isSameDay(end, start)
        ? Math.max(minutesSinceMidnight(end), startMin + 30)
        : 24 * 60;
      byDay[dayIndex].push({ event, startMin, endMin, col: 0, cols: 1 });
    }
    for (const list of byDay) layoutColumns(list);
    return byDay;
  }, [events, days]);

  // ----- moving events (pointer drag with 30-min snapping) -----

  function onEventPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    item: Positioned,
  ) {
    if (e.button !== 0) return;
    if (item.event.id.startsWith("temp-")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      event: item.event,
      durationMin: item.endMin - item.startMin,
      grabOffsetMin: ((e.clientY - rect.top) / SLOT_PX) * 30,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
  }

  function onEventPointerMove(e: React.PointerEvent<HTMLDivElement>) {
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
    const colWidth = rect.width / 7;
    const day = clamp(Math.floor((e.clientX - rect.left) / colWidth), 0, 6);
    const rawStart = ((e.clientY - rect.top) / SLOT_PX) * 30 - d.grabOffsetMin;
    const startMin = clamp(
      Math.round(rawStart / 30) * 30,
      0,
      24 * 60 - d.durationMin,
    );
    const next: DragState = {
      eventId: d.event.id,
      title: d.event.title,
      day,
      startMin,
      durationMin: d.durationMin,
    };
    dragStateRef.current = next;
    setDrag(next);
  }

  function onEventPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      setModal({ mode: "edit", event: d.event });
      return;
    }
    const state = dragStateRef.current;
    dragStateRef.current = null;
    setDrag(null);
    if (!state || state.eventId !== d.event.id) return;

    const newStart = addMinutes(addDays(weekStart, state.day), state.startMin);
    const newEnd = addMinutes(newStart, state.durationMin);
    const prev = events;
    setEvents((list) =>
      list.map((ev) =>
        ev.id === d.event.id
          ? {
              ...ev,
              start_at: newStart.toISOString(),
              end_at: newEnd.toISOString(),
            }
          : ev,
      ),
    );
    updateEvent(d.event.id, {
      start_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
    })
      .then(() => router.refresh())
      .catch(() => {
        setEvents(prev);
        showError("Could not move the event.");
      });
  }

  // ----- click empty slot to create -----

  function onColumnClick(e: React.MouseEvent<HTMLDivElement>, day: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = clamp(
      Math.floor((e.clientY - rect.top) / SLOT_PX) * 30,
      0,
      24 * 60 - 30,
    );
    setModal({
      mode: "create",
      start: addMinutes(days[day], minutes),
      durationMin: 60,
    });
  }

  function defaultNewStart() {
    const current = new Date();
    if (days.some((d) => isSameDay(d, current))) {
      const next = new Date(current);
      const m = current.getMinutes();
      next.setMinutes(m % 30 === 0 ? m : m + (30 - (m % 30)), 0, 0);
      return next;
    }
    return addMinutes(weekStart, 9 * 60);
  }

  // ----- dropping tasks from the sidebar (HTML5 drag & drop) -----

  function taskDropPosition(e: React.DragEvent) {
    const rect = colsRef.current!.getBoundingClientRect();
    const colWidth = rect.width / 7;
    const day = clamp(Math.floor((e.clientX - rect.left) / colWidth), 0, 6);
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

    const start = addMinutes(addDays(weekStart, pos.day), pos.startMin);
    const end = addMinutes(start, TASK_DROP_DURATION);
    const tempId = `temp-${Date.now()}`;
    const optimistic: CalendarEvent = {
      id: tempId,
      title: task.title,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      category_id: task.category_id,
      task_id: task.id,
    };
    setEvents((list) => [...list, optimistic]);
    scheduleTask(task.id, start.toISOString(), end.toISOString())
      .then((created) => {
        setEvents((list) =>
          list.map((ev) => (ev.id === tempId ? created : ev)),
        );
        router.refresh();
      })
      .catch(() => {
        setEvents((list) => list.filter((ev) => ev.id !== tempId));
        showError("Could not schedule the task.");
      });
  }

  // ----- other mutations -----

  function onQuickAdd(title: string) {
    createTask(title, null)
      .then((task) => {
        setTasks((list) => [...list, task]);
        router.refresh();
      })
      .catch(() => showError("Could not add the task."));
  }

  function onModalSave(draft: EventDraft) {
    if (!modal) return;
    const current = modal;
    setModal(null);
    if (current.mode === "create") {
      const tempId = `temp-${Date.now()}`;
      const optimistic: CalendarEvent = {
        id: tempId,
        title: draft.title,
        start_at: draft.startAt,
        end_at: draft.endAt,
        category_id: draft.categoryId,
        task_id: null,
      };
      setEvents((list) => [...list, optimistic]);
      createEvent({
        title: draft.title,
        startAt: draft.startAt,
        endAt: draft.endAt,
        categoryId: draft.categoryId,
      })
        .then((created) => {
          setEvents((list) =>
            list.map((ev) => (ev.id === tempId ? created : ev)),
          );
          router.refresh();
        })
        .catch(() => {
          setEvents((list) => list.filter((ev) => ev.id !== tempId));
          showError("Could not create the event.");
        });
    } else {
      const id = current.event.id;
      const prev = events;
      setEvents((list) =>
        list.map((ev) =>
          ev.id === id
            ? {
                ...ev,
                title: draft.title,
                category_id: draft.categoryId,
                start_at: draft.startAt,
                end_at: draft.endAt,
              }
            : ev,
        ),
      );
      updateEvent(id, {
        title: draft.title,
        category_id: draft.categoryId,
        start_at: draft.startAt,
        end_at: draft.endAt,
      })
        .then(() => router.refresh())
        .catch(() => {
          setEvents(prev);
          showError("Could not save the event.");
        });
    }
  }

  function onModalDelete() {
    if (!modal || modal.mode !== "edit") return;
    const id = modal.event.id;
    setModal(null);
    const prev = events;
    setEvents((list) => list.filter((ev) => ev.id !== id));
    deleteEvent(id)
      .then(() => router.refresh())
      .catch(() => {
        setEvents(prev);
        showError("Could not delete the event.");
      });
  }

  // ----- render -----

  const kw = isoWeek(addDays(weekStart, 3));
  const headerButton =
    "rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* header bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-800/80 px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
          KW {kw}
        </h1>
        <span className="text-sm text-neutral-500">
          {weekRangeLabel(weekStart)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-100"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className={headerButton}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className={headerButton}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              setModal({
                mode: "create",
                start: defaultNewStart(),
                durationMin: 60,
              })
            }
            className="ml-1 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Event</span>
          </button>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className={`${headerButton} ${sidebarOpen ? "bg-neutral-900 text-neutral-100" : ""}`}
            aria-label="Toggle task sidebar"
            title="Open tasks"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* grid + sidebar */}
      <div className="relative flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto">
          <div className="min-w-[640px]">
            {/* day header */}
            <div className="sticky top-0 z-20 flex border-b border-neutral-800/80 bg-neutral-950/95 backdrop-blur">
              <div className="w-14 shrink-0" />
              {days.map((day, i) => {
                const isToday = isSameDay(day, now);
                return (
                  <div
                    key={i}
                    className="flex flex-1 basis-0 items-center justify-center gap-1.5 border-l border-neutral-800/40 py-2.5 text-sm"
                  >
                    <span
                      className={isToday ? "text-neutral-100" : "text-neutral-500"}
                    >
                      {WEEKDAYS_SHORT[i]}
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
                  </div>
                );
              })}
            </div>

            <div className="flex">
              {/* time gutter */}
              <div
                className="relative w-14 shrink-0"
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

              {/* day columns */}
              <div
                ref={colsRef}
                className="relative flex flex-1"
                onDragOver={onGridDragOver}
                onDrop={onGridDrop}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute inset-x-0 border-t border-neutral-800/60"
                    style={{ top: h * HOUR_PX }}
                  />
                ))}
                {days.map((day, di) => (
                  <div
                    key={di}
                    className="relative flex-1 basis-0 border-l border-neutral-800/40"
                    style={{ height: GRID_HEIGHT }}
                    onClick={(e) => onColumnClick(e, di)}
                  >
                    {eventsByDay[di].map((item) => (
                      <EventBlock
                        key={item.event.id}
                        item={item}
                        category={
                          item.event.category_id
                            ? categoryById.get(item.event.category_id)
                            : undefined
                        }
                        dimmed={drag?.eventId === item.event.id}
                        onPointerDown={(e) => onEventPointerDown(e, item)}
                        onPointerMove={onEventPointerMove}
                        onPointerUp={onEventPointerUp}
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

        <TaskSidebar
          open={sidebarOpen}
          tasks={openTasks}
          categoryById={categoryById}
          onQuickAdd={onQuickAdd}
          onDragStartTask={setDragTask}
          onDragEndTask={() => {
            setDragTask(null);
            setDropPreview(null);
          }}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {modal && (
        <EventModal
          mode={modal.mode}
          initialStart={
            modal.mode === "create"
              ? modal.start
              : new Date(modal.event.start_at)
          }
          initialDurationMin={
            modal.mode === "create"
              ? modal.durationMin
              : Math.max(
                  30,
                  Math.round(
                    (new Date(modal.event.end_at).getTime() -
                      new Date(modal.event.start_at).getTime()) /
                      60_000 /
                      30,
                  ) * 30,
                )
          }
          initialTitle={modal.mode === "edit" ? modal.event.title : ""}
          initialCategoryId={
            modal.mode === "edit" ? modal.event.category_id : null
          }
          linkedTask={modal.mode === "edit" && modal.event.task_id !== null}
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

function EventBlock({
  item,
  category,
  dimmed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  item: Positioned;
  category?: Category;
  dimmed: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const { event, startMin, endMin, col, cols } = item;
  const compact = endMin - startMin <= 30;
  const width = 100 / cols;
  return (
    <div
      className={`absolute z-[5] cursor-grab touch-none select-none overflow-hidden rounded-md border border-neutral-700/60 bg-neutral-800/95 px-1.5 text-left transition-colors hover:bg-neutral-700/90 active:cursor-grabbing ${
        compact ? "py-0.5" : "py-1"
      } ${dimmed ? "opacity-30" : ""}`}
      style={{
        top: (startMin / 30) * SLOT_PX + 1,
        height: Math.max(((endMin - startMin) / 30) * SLOT_PX - 2, SLOT_PX - 4),
        left: `calc(${col * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        borderLeftWidth: 3,
        borderLeftColor: category?.color ?? "#8E9196",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="truncate text-xs font-medium leading-tight text-neutral-100">
        {event.title}
      </p>
      {!compact && (
        <p className="truncate text-[10px] leading-tight text-neutral-400">
          {formatTime(new Date(event.start_at))} –{" "}
          {formatTime(new Date(event.end_at))}
        </p>
      )}
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
