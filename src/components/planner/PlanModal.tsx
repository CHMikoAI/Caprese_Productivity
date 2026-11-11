"use client";

import { useState } from "react";
import { CalendarClock, CalendarOff } from "lucide-react";
import DateField from "@/components/DateField";
import Sheet from "@/components/Sheet";
import Switch from "@/components/Switch";
import {
  addDays,
  addMinutes,
  durationLabel,
  formatTime,
  isSameDay,
  startOfDay,
  startOfWeek,
  withMinutes,
} from "@/lib/dates";
import type { Entry } from "@/lib/types";

const DURATIONS = [30, 60, 90, 120, 180, 240];
const DAY_MS = 86_400_000;

const labelClass = "flex flex-col gap-1.5 text-xs font-medium text-neutral-500";

/**
 * Quick planning dialog: give a task/goal a (new) date and time, or park it
 * without a date under "To plan". An all-day entry stays all-day — it is moved
 * to the chosen day, keeping its length in days — instead of turning into a
 * midnight-to-midnight block on the time grid.
 */
export default function PlanModal({
  entry,
  onSchedule,
  onUnschedule,
  onClose,
}: {
  entry: Entry;
  onSchedule: (start: Date, end: Date, allDay: boolean) => void;
  onUnschedule: () => void;
  onClose: () => void;
}) {
  const startAt = entry.start_at ? new Date(entry.start_at) : null;
  const endAt = entry.end_at ? new Date(entry.end_at) : null;

  // Stay on a future date the entry already has; anything overdue (or undated)
  // starts from tomorrow.
  const [date, setDate] = useState<Date>(() =>
    startAt && startAt.getTime() > Date.now()
      ? startOfDay(startAt)
      : startOfDay(addDays(new Date(), 1)),
  );
  const [allDay, setAllDay] = useState(entry.all_day && startAt !== null);
  const [time, setTime] = useState(() =>
    startAt && !entry.all_day ? formatTime(startAt) : "09:00",
  );
  const [duration, setDuration] = useState(() => {
    if (!startAt || !endAt || entry.all_day) return 60;
    return Math.max(15, Math.round((endAt.getTime() - startAt.getTime()) / 60_000));
  });
  // How many days an all-day entry covers (a multi-day goal keeps its span).
  const spanDays =
    entry.all_day && startAt && endAt
      ? Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / DAY_MS))
      : 1;

  const durations = DURATIONS.includes(duration)
    ? DURATIONS
    : [...DURATIONS, duration].sort((a, b) => a - b);

  const today = startOfDay(new Date());
  const quickDates: { label: string; date: Date }[] = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "Next week", date: addDays(startOfWeek(today), 7) },
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (allDay) {
      const start = startOfDay(date);
      onSchedule(start, addDays(start, spanDays), true);
      return;
    }
    if (!time) return;
    const [h, m] = time.split(":").map(Number);
    const start = withMinutes(date, (h || 0) * 60 + (m || 0));
    onSchedule(start, addMinutes(start, duration), false);
  }

  return (
    <Sheet
      title="Plan"
      icon={<CalendarClock className="h-5 w-5 shrink-0 text-neutral-400" />}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {entry.start_at && (
            <button
              type="button"
              onClick={onUnschedule}
              className="btn-ghost -ml-2 px-2.5"
              title="Remove the date and park it under To plan"
            >
              <CalendarOff className="h-4 w-4" />
              No date
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!allDay && !time}
              className="btn-primary"
            >
              Schedule
            </button>
          </div>
        </>
      }
    >
      <p className="line-clamp-2 text-sm text-neutral-400">{entry.title}</p>

      <div className="mt-4 flex flex-col gap-4">
        {/* the three dates that cover most replanning, one tap each */}
        <div className="flex gap-2">
          {quickDates.map((quick) => (
            <button
              key={quick.label}
              type="button"
              onClick={() => setDate(quick.date)}
              aria-pressed={isSameDay(quick.date, date)}
              className="chip chip-raised flex-1 justify-center py-2.5 text-sm"
            >
              {quick.label}
            </button>
          ))}
        </div>

        <label className={labelClass}>
          Date
          <DateField value={date} onChange={(d) => setDate(startOfDay(d))} />
        </label>

        <div className="rounded-xl bg-neutral-800 px-3.5">
          <Switch checked={allDay} onChange={setAllDay} label="All day" />
        </div>

        {allDay ? (
          spanDays > 1 && (
            <p className="-mt-2 text-xs text-neutral-500">
              Keeps its length: {spanDays} days from the date above.
            </p>
          )
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Start
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="field"
              />
            </label>
            <label className={labelClass}>
              Duration
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="field"
              >
                {durations.map((d) => (
                  <option key={d} value={d}>
                    {durationLabel(d)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    </Sheet>
  );
}
