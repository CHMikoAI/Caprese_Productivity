"use client";

import { useState } from "react";
import { CalendarClock, CalendarOff, X } from "lucide-react";
import DateField from "@/components/DateField";
import { addDays, addMinutes, formatTime, startOfDay, withMinutes } from "@/lib/dates";
import { useEscape } from "@/lib/useShortcuts";
import type { Entry } from "@/lib/types";

const inputClass =
  "rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none";

const DURATIONS = [30, 60, 90, 120, 180, 240];

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${(minutes / 60).toFixed(1)} h`;
}

/**
 * Quick planning dialog: give a task/goal a (new) date and time, or park it
 * without a date under "To plan".
 */
export default function PlanModal({
  entry,
  onSchedule,
  onUnschedule,
  onClose,
}: {
  entry: Entry;
  onSchedule: (start: Date, end: Date) => void;
  onUnschedule: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const startAt = entry.start_at ? new Date(entry.start_at) : null;
  const [date, setDate] = useState<Date>(() =>
    startAt && startAt.getTime() > Date.now()
      ? startOfDay(startAt)
      : startOfDay(addDays(new Date(), 1)),
  );
  const [time, setTime] = useState(() => (startAt ? formatTime(startAt) : "09:00"));
  const [duration, setDuration] = useState(() => {
    if (!entry.start_at || !entry.end_at) return 60;
    return Math.max(
      15,
      Math.round(
        (new Date(entry.end_at).getTime() - new Date(entry.start_at).getTime()) /
          60_000,
      ),
    );
  });

  const durations = DURATIONS.includes(duration)
    ? DURATIONS
    : [...DURATIONS, duration].sort((a, b) => a - b);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!time) return;
    const [h, m] = time.split(":").map(Number);
    const start = withMinutes(date, (h || 0) * 60 + (m || 0));
    onSchedule(start, addMinutes(start, duration));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="my-auto w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <CalendarClock className="h-4 w-4 text-neutral-400" />
            Plan
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 truncate text-sm text-neutral-400">{entry.title}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="min-w-40 flex-1">
            <DateField value={date} onChange={setDate} />
          </div>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={`${inputClass} w-28`}
            aria-label="Start time"
          />
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className={`${inputClass} w-24`}
            aria-label="Duration"
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {durationLabel(d)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {entry.start_at && (
            <button
              type="button"
              onClick={onUnschedule}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              <CalendarOff className="h-3.5 w-3.5" />
              No date — plan later
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!time}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Schedule
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
