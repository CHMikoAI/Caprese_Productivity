"use client";

import { useState } from "react";
import { Maximize2, Minimize2, Trash2 } from "lucide-react";
import DateField from "@/components/DateField";
import RichTextEditor from "@/components/RichTextEditor";
import { addMinutes, startOfDay, withMinutes } from "@/lib/dates";
import { ENTRY_TYPE_ICON } from "@/lib/entryIcons";
import { useEscape } from "@/lib/useShortcuts";
import {
  ENTRY_TYPES,
  ENTRY_TYPE_LABEL,
  type Category,
  type EntryType,
} from "@/lib/types";

export type EntryFormResult = {
  type: EntryType;
  title: string;
  categoryId: string | null;
  startAt: string | null;
  endAt: string | null;
  description: string | null;
};

export type EntryModalInitial = {
  type: EntryType;
  title: string;
  categoryId: string | null;
  scheduled: boolean;
  start: Date;
  durationMin: number;
  description: string;
};

const DURATIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 h" },
  { minutes: 90, label: "1.5 h" },
  { minutes: 120, label: "2 h" },
  { minutes: 180, label: "3 h" },
  { minutes: 240, label: "4 h" },
  { minutes: 480, label: "8 h" },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);

function timeLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

const inputClass =
  "w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none";
const labelClass = "flex flex-col gap-1.5 text-xs font-medium text-neutral-500";

function TimeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (min: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={inputClass}
    >
      {TIME_OPTIONS.map((min) => (
        <option key={min} value={min}>
          {timeLabel(min)}
        </option>
      ))}
    </select>
  );
}

export default function EntryModal({
  mode,
  initial,
  categories,
  onSave,
  onDelete,
  onClose,
}: {
  mode: "create" | "edit";
  initial: EntryModalInitial;
  categories: Category[];
  onSave: (result: EntryFormResult) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<EntryType>(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [description, setDescription] = useState(initial.description);

  // A null start date means "unscheduled" — allowed for tasks/goals, required
  // for events. The date field itself is the control (no separate toggle).
  const [startDate, setStartDate] = useState<Date | null>(() =>
    initial.scheduled ? startOfDay(initial.start) : null,
  );
  const [startMin, setStartMin] = useState(
    () => initial.start.getHours() * 60 + initial.start.getMinutes(),
  );

  const [endMode, setEndMode] = useState<"duration" | "end">("duration");
  const [durationMin, setDurationMin] = useState(initial.durationMin);
  const [endDate, setEndDate] = useState(() =>
    startOfDay(addMinutes(initial.start, initial.durationMin)),
  );
  const [endMin, setEndMin] = useState(() => {
    const e = addMinutes(initial.start, initial.durationMin);
    return e.getHours() * 60 + e.getMinutes();
  });

  const [error, setError] = useState<string | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);

  useEscape(onClose);

  function changeType(t: EntryType) {
    setType(t);
    // Events must be dated — give them one the moment they're selected.
    if (t === "event" && !startDate) setStartDate(startOfDay(initial.start));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give it a title.");
      return;
    }

    let startAt: string | null = null;
    let endAt: string | null = null;
    if (startDate) {
      const start = withMinutes(startDate, startMin);
      const end =
        endMode === "duration"
          ? addMinutes(start, durationMin)
          : withMinutes(endDate, endMin);
      if (end.getTime() <= start.getTime()) {
        setError("End must be after start.");
        return;
      }
      startAt = start.toISOString();
      endAt = end.toISOString();
    } else if (type === "event") {
      setError("Events need a date and time.");
      return;
    }

    onSave({
      type,
      title: trimmed,
      categoryId: categoryId || null,
      startAt,
      endAt,
      description: description.trim() ? description : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <div
        className={`my-auto w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl ${
          notesExpanded ? "flex h-[85vh] flex-col" : ""
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">
            {mode === "create" ? "New" : `Edit ${ENTRY_TYPE_LABEL[type].toLowerCase()}`}
          </h2>
          {/* type selector */}
          <div className="flex rounded-lg border border-neutral-800 bg-neutral-950 p-0.5 text-xs">
            {ENTRY_TYPES.map((t) => {
              const Icon = ENTRY_TYPE_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => changeType(t)}
                  className={
                    type === t
                      ? "flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-white"
                      : "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-neutral-400 transition-colors hover:text-neutral-200"
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {ENTRY_TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={submit}
          className={`flex flex-col gap-4 ${notesExpanded ? "min-h-0 flex-1" : ""}`}
        >
          {/* title + category */}
          {!notesExpanded && (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className={`${inputClass} text-base`}
          />
          )}

          {!notesExpanded && (
          <label className={labelClass}>
            Project
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
          )}

          {!notesExpanded && (
            <div className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
              {/* start — optional for tasks/goals (leave empty), required for events */}
              {startDate ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                  <label className={labelClass}>
                    Start date
                    <DateField
                      value={startDate}
                      onChange={setStartDate}
                      onClear={
                        type === "event" ? undefined : () => setStartDate(null)
                      }
                    />
                  </label>
                  <label className={labelClass}>
                    Time
                    <TimeSelect value={startMin} onChange={setStartMin} />
                  </label>
                </div>
              ) : (
                <label className={labelClass}>
                  Start date
                  <DateField value={null} onChange={setStartDate} />
                  <span className="text-[11px] font-normal text-neutral-600">
                    Optional — without a date it stays in your{" "}
                    {ENTRY_TYPE_LABEL[type].toLowerCase()} list.
                  </span>
                </label>
              )}

              {startDate && (
                <>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-neutral-500">Ends by</span>
                    <div className="flex rounded-lg border border-neutral-800 bg-neutral-950 p-0.5">
                      {(["duration", "end"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setEndMode(m)}
                          className={
                            endMode === m
                              ? "rounded-md bg-neutral-800 px-2.5 py-1 font-medium text-neutral-100"
                              : "rounded-md px-2.5 py-1 text-neutral-400 hover:text-neutral-200"
                          }
                        >
                          {m === "duration" ? "Duration" : "End date"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {endMode === "duration" ? (
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
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                      <label className={labelClass}>
                        End date
                        <DateField value={endDate} onChange={setEndDate} />
                      </label>
                      <label className={labelClass}>
                        Time
                        <TimeSelect value={endMin} onChange={setEndMin} />
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* description — a div, not a <label>: wrapping the editor in a
              label routes clicks to its first button (Bold) and toggles it. */}
          <div className={`${labelClass} ${notesExpanded ? "min-h-0 flex-1" : ""}`}>
            <div className="flex items-center justify-between">
              <span>Notes</span>
              <button
                type="button"
                onClick={() => setNotesExpanded((v) => !v)}
                title={notesExpanded ? "Shrink notes" : "Expand notes"}
                aria-label={notesExpanded ? "Shrink notes" : "Expand notes"}
                className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              >
                {notesExpanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Add details…"
              expanded={notesExpanded}
            />
          </div>

          {error && <p className="text-sm text-accent">{error}</p>}

          <div className="mt-1 flex items-center gap-2">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-accent"
              >
                <Trash2 className="h-4 w-4" />
                Delete
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
                className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
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
