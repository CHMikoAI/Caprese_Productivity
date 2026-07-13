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
  startOfMonth,
  startOfWeek,
  toDateKey,
} from "@/lib/dates";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

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
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(value ?? new Date()),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setViewMonth(startOfMonth(value ?? new Date()));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cells = Array.from({ length: 42 }, (_, i) =>
    addDays(startOfWeek(startOfMonth(viewMonth)), i),
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm transition-colors hover:border-neutral-600 focus:border-accent focus:outline-none"
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-neutral-500" />
        <span className={value ? "text-neutral-100" : "text-neutral-600"}>
          {value ? formatDMY(value) : "No date"}
        </span>
        {value && onClear && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="ml-auto rounded p-0.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-[60] mt-1 w-64 rounded-xl border border-neutral-700 bg-neutral-900 p-2 shadow-2xl">
          <div className="flex items-center justify-between px-1 pb-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-neutral-100">
              {monthLabel(viewMonth)}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 pb-1">
            {WEEKDAY_INITIALS.map((d, i) => (
              <span
                key={i}
                className="py-1 text-center text-[10px] font-medium text-neutral-600"
              >
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day) => {
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const selected = value ? isSameDay(day, value) : false;
              const disabled = maxDate ? day.getTime() > maxDate.getTime() : false;
              return (
                <button
                  key={toDateKey(day)}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(day);
                    setOpen(false);
                  }}
                  className={`h-8 rounded-md text-xs transition-colors ${
                    disabled
                      ? "cursor-not-allowed text-neutral-700"
                      : selected
                        ? "bg-accent font-semibold text-white"
                        : inMonth
                          ? "text-neutral-200 hover:bg-neutral-800"
                          : "text-neutral-600 hover:bg-neutral-800"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
