"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  formatTime,
  isSameDay,
  startOfMonth,
  startOfWeek,
  toDateKey,
  WEEKDAYS_SHORT,
} from "@/lib/dates";
import JournalDayMarker from "./JournalDayMarker";
import { blockPalette, goalFrame } from "@/lib/colorContrast";
import { isFinished } from "@/lib/entryStatus";
import type { Category, Entry, JournalEntry } from "@/lib/types";

const MAX_CHIPS = 3;

export default function MonthView({
  anchor,
  now,
  entries,
  categoryById,
  journalByDate,
  dragTask,
  onCreateAt,
  onSelectEntry,
  onDropTaskOnDay,
}: {
  anchor: Date;
  now: Date;
  entries: Entry[];
  categoryById: Map<string, Category>;
  journalByDate: Map<string, JournalEntry>;
  dragTask: Entry | null;
  onCreateAt: (day: Date) => void;
  onSelectEntry: (entry: Entry) => void;
  onDropTaskOnDay: (day: Date) => void;
}) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const cells = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchor));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const add = (key: string, entry: Entry) => {
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    };
    for (const entry of entries) {
      if (!entry.start_at) continue;
      const start = new Date(entry.start_at);
      const end = entry.end_at ? new Date(entry.end_at) : start;
      // Show a multi-day entry on every day it covers (midnight end excluded).
      const endInclusive = new Date(Math.max(end.getTime() - 1, start.getTime()));
      const lastKey = toDateKey(endInclusive);
      let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      for (let guard = 0; guard < 400; guard++) {
        const key = toDateKey(cursor);
        add(key, entry);
        if (key === lastKey) break;
        cursor = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + 1,
        );
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => ((a.start_at ?? "") < (b.start_at ?? "") ? -1 : 1));
    }
    return map;
  }, [entries]);

  const month = anchor.getMonth();

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 sm:px-4 sm:pb-4">
      <div className="grid grid-cols-7 border-b border-neutral-800/80">
        {WEEKDAYS_SHORT.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-xs font-medium text-neutral-500"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {cells.map((day) => {
          const key = toDateKey(day);
          const inMonth = day.getMonth() === month;
          const isToday = isSameDay(day, now);
          const dayEntries = entriesByDay.get(key) ?? [];
          const isDropTarget = dragTask && dragOverKey === key;

          return (
            <div
              key={key}
              onClick={() => onCreateAt(day)}
              onDragOver={(e) => {
                if (!dragTask) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverKey(key);
              }}
              onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
              onDrop={(e) => {
                if (!dragTask) return;
                e.preventDefault();
                setDragOverKey(null);
                onDropTaskOnDay(day);
              }}
              className={`flex min-h-0 min-w-0 cursor-pointer flex-col gap-1 border-b border-r border-neutral-800/50 p-1.5 transition-colors hover:bg-neutral-900/40 ${
                inMonth ? "" : "bg-neutral-950/60"
              } ${isDropTarget ? "bg-accent/10 ring-1 ring-inset ring-accent/50" : ""}`}
            >
              <div className="flex items-center justify-end gap-1">
                <JournalDayMarker entry={journalByDate.get(key)} />
                <span
                  className={
                    isToday
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white"
                      : `text-[11px] ${inMonth ? "text-neutral-400" : "text-neutral-600"}`
                  }
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                {dayEntries.slice(0, MAX_CHIPS).map((entry) => {
                  const category = entry.category_id
                    ? categoryById.get(entry.category_id)
                    : undefined;
                  const finished = isFinished(entry, now);
                  const struck = finished && entry.type !== "event";
                  const color = category?.color ?? "#6B7280";
                  const pal = blockPalette(color);
                  return (
                    <button
                      key={entry.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEntry(entry);
                      }}
                      className={`flex items-center gap-1 truncate rounded-[4px] px-1 py-0.5 text-left text-[11px] leading-tight transition-[filter] hover:brightness-125 ${
                        finished ? "opacity-60" : ""
                      }`}
                      style={{
                        backgroundColor: pal.bg,
                        color: pal.title,
                        border:
                          entry.type === "goal"
                            ? `1.5px solid ${goalFrame(color)}`
                            : "1px solid rgba(0,0,0,0.2)",
                      }}
                    >
                      <span
                        className="hidden shrink-0 sm:inline"
                        style={{ color: pal.sub }}
                      >
                        {formatTime(new Date(entry.start_at!))}
                      </span>
                      <span className={`truncate ${struck ? "line-through" : ""}`}>
                        {entry.title}
                      </span>
                    </button>
                  );
                })}
                {dayEntries.length > MAX_CHIPS && (
                  <span className="px-1 text-[10px] text-neutral-500">
                    +{dayEntries.length - MAX_CHIPS} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
