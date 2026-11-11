"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  addDays,
  addMonths,
  formatDMY,
  isSameDay,
  monthLabel,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateKey,
} from "@/lib/dates";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
/** The popover's width in px (w-72) — needed to decide which side it opens on. */
const POPOVER_W = 288;

/** Date picker that always displays DD.MM.YYYY and opens a month calendar. */
export default function DateField({
  value,
  onChange,
  onClear,
  maxDate,
}: {
  value: Date | null;
  onChange: (date: Date) => void;
  /** When provided, an empty state ("No date") with a clear button is offered. */
  onClear?: () => void;
  /** Days after this are shown but not selectable (e.g. no future journal entries). */
  maxDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  // A field near the right edge opens its calendar leftwards, so it never
  // hangs off the screen.
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    setAlignRight(
      rect ? rect.left + POPOVER_W > window.innerWidth - 8 && rect.right >= POPOVER_W : false,
    );
    setOpen(true);
  }

  // Close on a press anywhere else — mouse or touch.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Inside a scrolling dialog the calendar can open below the fold: bring it in.
  useEffect(() => {
    if (open) popoverRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          // Close the calendar only — not the dialog it may sit in.
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div className="flex w-full items-center rounded-xl bg-neutral-800 focus-within:ring-2 focus-within:ring-accent/40">
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm outline-none transition-opacity active:opacity-70"
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-neutral-500" />
          <span className={value ? "text-neutral-100" : "text-neutral-500"}>
            {value ? formatDMY(value) : "No date"}
          </span>
        </button>
        {value && onClear && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => {
              setOpen(false);
              onClear();
            }}
            className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-200 active:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Choose a date"
          className={`absolute z-[60] mt-1.5 w-72 max-w-[calc(100vw-2rem)] scroll-mb-3 rounded-2xl bg-neutral-800 p-2.5 shadow-2xl ring-1 ring-white/10 ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          <MonthCalendar
            value={value}
            maxDate={maxDate}
            onChange={(day) => {
              onChange(day);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A month to pick a day from: pager, grid and a "Today" shortcut. It opens on
 * the month of the current value. Used in the date field's popover and inline
 * in forms.
 */
export function MonthCalendar({
  value,
  onChange,
  maxDate,
}: {
  value: Date | null;
  onChange: (date: Date) => void;
  /** Days after this are shown but not selectable. */
  maxDate?: Date;
}) {
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(value ?? new Date()),
  );
  const today = startOfDay(new Date());
  const todayDisabled = maxDate ? today.getTime() > maxDate.getTime() : false;
  const cells = Array.from({ length: 42 }, (_, i) =>
    addDays(startOfWeek(startOfMonth(viewMonth)), i),
  );

  return (
    <>
    <div className="flex items-center justify-between pb-1.5">
      <button
        type="button"
        onClick={() => setViewMonth((m) => addMonths(m, -1))}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-100 active:opacity-50"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-semibold text-neutral-100">
        {monthLabel(viewMonth)}
      </span>
      <button
        type="button"
        onClick={() => setViewMonth((m) => addMonths(m, 1))}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-100 active:opacity-50"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
    <div className="grid grid-cols-7 pb-1">
      {WEEKDAY_INITIALS.map((d, i) => (
        <span
          key={i}
          className="py-1 text-center text-[11px] font-medium text-neutral-500"
        >
          {d}
        </span>
      ))}
    </div>
    <div className="grid grid-cols-7 gap-0.5">
      {cells.map((day) => {
        const inMonth = day.getMonth() === viewMonth.getMonth();
        const selected = value ? isSameDay(day, value) : false;
        const isToday = isSameDay(day, today);
        const disabled = maxDate ? day.getTime() > maxDate.getTime() : false;
        return (
          <button
            key={toDateKey(day)}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            aria-current={isToday ? "date" : undefined}
            onClick={() => onChange(day)}
            className={`h-9 rounded-lg text-sm tabular-nums transition-colors sm:h-8 sm:text-xs ${
              disabled
                ? "cursor-not-allowed text-neutral-700"
                : selected
                  ? "bg-accent font-semibold text-white"
                  : isToday
                    ? "font-semibold text-accent-bright hover:bg-neutral-700"
                    : inMonth
                      ? "text-neutral-200 hover:bg-neutral-700"
                      : "text-neutral-600 hover:bg-neutral-700"
            }`}
          >
            {day.getDate()}
          </button>
        );
      })}
    </div>
    <div className="mt-1.5 flex justify-end border-t border-neutral-700/70 pt-1.5">
      <button
        type="button"
        disabled={todayDisabled}
        onClick={() => onChange(today)}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-accent-bright transition-colors hover:bg-neutral-700 active:opacity-50 disabled:opacity-40"
      >
        Today
      </button>
    </div>
    </>
  );
}
