"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { fromDateKey, toDateKey } from "@/lib/dates";
import type { Category } from "@/lib/types";

export type EventDraft = {
  title: string;
  startAt: string;
  endAt: string;
  categoryId: string | null;
};

const DURATIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 h" },
  { minutes: 90, label: "1.5 h" },
  { minutes: 120, label: "2 h" },
  { minutes: 180, label: "3 h" },
  { minutes: 240, label: "4 h" },
];

function timeLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export default function EventModal({
  mode,
  initialStart,
  initialDurationMin,
  initialTitle,
  initialCategoryId,
  linkedTask,
  categories,
  onSave,
  onDelete,
  onClose,
}: {
  mode: "create" | "edit";
  initialStart: Date;
  initialDurationMin: number;
  initialTitle: string;
  initialCategoryId: string | null;
  linkedTask: boolean;
  categories: Category[];
  onSave: (draft: EventDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [dateKey, setDateKey] = useState(() => toDateKey(initialStart));
  const [startMin, setStartMin] = useState(
    () => initialStart.getHours() * 60 + initialStart.getMinutes(),
  );
  const [durationMin, setDurationMin] = useState(initialDurationMin);
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? "");

  const timeOptions = useMemo(
    () => Array.from({ length: 48 }, (_, i) => i * 30),
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const start = fromDateKey(dateKey);
    start.setMinutes(startMin);
    const end = new Date(start.getTime() + durationMin * 60_000);
    onSave({
      title: trimmed,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      categoryId: categoryId || null,
    });
  }

  const inputClass =
    "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none";
  const labelClass = "flex flex-col gap-1.5 text-xs text-neutral-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold text-neutral-100">
          {mode === "create" ? "New event" : "Edit event"}
        </h2>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Date
              <input
                type="date"
                value={dateKey}
                onChange={(e) => e.target.value && setDateKey(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Start
              <select
                value={startMin}
                onChange={(e) => setStartMin(Number(e.target.value))}
                className={inputClass}
              >
                {timeOptions.map((min) => (
                  <option key={min} value={min}>
                    {timeLabel(min)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Duration
              <select
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className={inputClass}
              >
                {DURATIONS.map((d) => (
                  <option key={d.minutes} value={d.minutes}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Category
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputClass}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {linkedTask && (
            <p className="text-xs leading-relaxed text-neutral-500">
              Linked to a task — removing this event puts the task back into
              the open list.
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-accent"
              >
                <Trash2 className="h-4 w-4" />
                {linkedTask ? "Unschedule" : "Delete"}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
