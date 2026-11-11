"use client";

import { useRef, useState } from "react";
import { Maximize2, Minimize2, Trash2 } from "lucide-react";
import DateField from "@/components/DateField";
import RichTextEditor from "@/components/RichTextEditor";
import Sheet from "@/components/Sheet";
import Switch from "@/components/Switch";
import {
  addDays,
  addMinutes,
  durationLabel,
  isSameDay,
  minutesSinceMidnight,
  startOfDay,
  withMinutes,
} from "@/lib/dates";
import { ENTRY_TYPE_ICON } from "@/lib/entryIcons";
import { TODO_BATCH } from "@/lib/rewards";
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
  allDay: boolean;
  description: string | null;
};

export type EntryModalInitial = {
  type: EntryType;
  title: string;
  categoryId: string | null;
  scheduled: boolean;
  start: Date;
  durationMin: number;
  allDay: boolean;
  deadline: Date | null; // todo only
  description: string;
};

const DURATIONS = [30, 60, 90, 120, 180, 240, 480];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);
/** Last half-hour slot of a day. */
const LAST_SLOT = 23 * 60 + 30;

function timeLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** `list` plus `value` when it is not one of the presets, in order. */
function withValue(list: number[], value: number): number[] {
  return list.includes(value) ? list : [...list, value].sort((a, b) => a - b);
}

const labelClass = "flex flex-col gap-1.5 text-xs font-medium text-neutral-500";
const hintClass = "text-xs font-normal leading-relaxed text-neutral-500";

function TimeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (min: number) => void;
}) {
  // An entry can sit off the half-hour grid (planned for 09:10, say). Its real
  // time has to be on the list — a select with no matching option silently
  // shows the first one, i.e. "00:00".
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="field"
    >
      {withValue(TIME_OPTIONS, value).map((min) => (
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
  const [startMin, setStartMin] = useState(() =>
    minutesSinceMidnight(initial.start),
  );
  // Until the time has been chosen on purpose — by picking it here, or by
  // opening the dialog on a calendar slot — it follows the date (see pickStart).
  const [timeChosen, setTimeChosen] = useState(initial.scheduled);

  // A length that is not one of the presets and runs past a working day is
  // clearer as an end date and time than as "26 h".
  const [endMode, setEndMode] = useState<"duration" | "end">(() =>
    !DURATIONS.includes(initial.durationMin) && initial.durationMin > 8 * 60
      ? "end"
      : "duration",
  );
  const [durationMin, setDurationMin] = useState(initial.durationMin);
  const [endDate, setEndDate] = useState(() =>
    startOfDay(addMinutes(initial.start, initial.durationMin)),
  );
  const [endMin, setEndMin] = useState(() =>
    minutesSinceMidnight(addMinutes(initial.start, initial.durationMin)),
  );

  const [allDay, setAllDay] = useState(initial.allDay);
  // Inclusive end date for all-day entries (same day = single-day entry).
  // Derived from duration so editing a stored multi-day span shows the last
  // covered day, not the exclusive next midnight.
  const [allDayEnd, setAllDayEnd] = useState(() =>
    startOfDay(addMinutes(initial.start, Math.max(initial.durationMin - 1, 0))),
  );
  const [deadline, setDeadline] = useState<Date | null>(initial.deadline);

  const [error, setError] = useState<string | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  function fail(message: string) {
    setError(message);
    requestAnimationFrame(() =>
      errorRef.current?.scrollIntoView({ block: "nearest" }),
    );
  }

  function pickStart(day: Date) {
    const d = startOfDay(day);
    setStartDate(d);
    // keep the all-day range valid when start moves past it
    if (allDayEnd.getTime() < d.getTime()) setAllDayEnd(d);
    if (!timeChosen) {
      // A sensible time for the day picked: the next half hour if that is
      // today, the start of the working day otherwise.
      const now = new Date();
      setStartMin(
        isSameDay(d, now)
          ? Math.min(Math.ceil(minutesSinceMidnight(now) / 30) * 30, LAST_SLOT)
          : 9 * 60,
      );
    }
  }

  function changeType(t: EntryType) {
    setType(t);
    setError(null);
    // Events must be dated — give them one the moment they're selected.
    if (t === "event" && !startDate) pickStart(initial.start);
    // Goals are date-only by default.
    if (t === "goal") setAllDay(true);
    // Todos never sit on the calendar — only an optional deadline.
    if (t === "todo") setStartDate(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      fail("Give it a title.");
      return;
    }

    let startAt: string | null = null;
    let endAt: string | null = null;
    let allDayOut = false;

    if (type === "todo") {
      // Off-calendar reminder: no start, an optional date-only deadline.
      allDayOut = true;
      if (deadline) endAt = addDays(startOfDay(deadline), 1).toISOString();
    } else if (startDate && allDay) {
      // Date-only entry: covers start day through the (inclusive) end day.
      const s = startOfDay(startDate);
      const end = startOfDay(allDayEnd.getTime() < s.getTime() ? s : allDayEnd);
      startAt = s.toISOString();
      endAt = addDays(end, 1).toISOString();
      allDayOut = true;
    } else if (startDate) {
      const start = withMinutes(startDate, startMin);
      const end =
        endMode === "duration"
          ? addMinutes(start, durationMin)
          : withMinutes(endDate, endMin);
      if (end.getTime() <= start.getTime()) {
        fail("End must be after start.");
        return;
      }
      startAt = start.toISOString();
      endAt = end.toISOString();
    } else if (type === "event") {
      fail("Events need a date and time.");
      return;
    }

    onSave({
      type,
      title: trimmed,
      categoryId: categoryId || null,
      startAt,
      endAt,
      allDay: allDayOut,
      description: description.replace(/<[^>]*>/g, "").trim() ? description : null,
    });
  }

  const typeLabel = ENTRY_TYPE_LABEL[type].toLowerCase();

  return (
    <Sheet
      title={mode === "create" ? `New ${typeLabel}` : `Edit ${typeLabel}`}
      size="lg"
      onClose={onClose}
      onSubmit={submit}
      // Typed input should not vanish on a stray tap next to the dialog.
      dismissOnBackdrop={false}
      fill={notesExpanded}
      bodyClassName={notesExpanded ? "flex flex-col" : ""}
      headerExtra={
        <div className="px-5 pb-3 sm:px-6">
          <div className="segmented flex w-full sm:inline-flex sm:w-auto" role="group" aria-label="Type">
            {ENTRY_TYPES.map((t) => {
              const Icon = ENTRY_TYPE_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => changeType(t)}
                  aria-pressed={type === t}
                  className={`flex flex-1 items-center justify-center gap-1.5 sm:flex-none ${
                    type === t ? "bg-accent text-white" : ""
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {ENTRY_TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>
      }
      footer={(close) => (
        <>
          {mode === "edit" && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="btn-ghost -ml-2 px-2.5 hover:text-accent-bright"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={close} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary px-6">
              Save
            </button>
          </div>
        </>
      )}
    >
      <div
        className={`flex flex-col gap-4 pt-0.5 ${notesExpanded ? "min-h-0 flex-1" : ""}`}
        onKeyDown={(e) => {
          // The notes editor has no Enter-to-submit; ⌘/Ctrl+Enter saves.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.closest("form")?.requestSubmit();
          }
        }}
      >
        {!notesExpanded && (
          <>
            <input
              // On a phone, editing should open the entry — not the keyboard.
              autoFocus={mode === "create"}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Title"
              aria-label="Title"
              enterKeyHint="done"
              className="field text-base"
            />

            <label className={labelClass}>
              Project
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="field"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            {type === "todo" ? (
              <div className="rounded-2xl bg-neutral-950/40 p-3.5">
                <label className={labelClass}>
                  Deadline
                  <DateField
                    value={deadline}
                    onChange={setDeadline}
                    onClear={() => setDeadline(null)}
                  />
                  <span className={hintClass}>
                    Optional — a quick reminder, never on the calendar. Finish{" "}
                    {TODO_BATCH} to earn a pick.
                  </span>
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 rounded-2xl bg-neutral-950/40 p-3.5">
                {/* start — optional for tasks/goals (leave empty), required for events */}
                {startDate ? (
                  <div
                    className={
                      allDay
                        ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                        : "grid grid-cols-[1fr_7rem] gap-3"
                    }
                  >
                    <label className={labelClass}>
                      {allDay ? "Date" : "Start date"}
                      <DateField
                        value={startDate}
                        onChange={pickStart}
                        onClear={
                          type === "event" ? undefined : () => setStartDate(null)
                        }
                      />
                    </label>
                    {allDay ? (
                      <label className={labelClass}>
                        End date
                        <DateField
                          value={allDayEnd}
                          onChange={(d) => setAllDayEnd(startOfDay(d))}
                        />
                        <span className={hintClass}>
                          Same day = a single-day entry.
                        </span>
                      </label>
                    ) : (
                      <label className={labelClass}>
                        Time
                        <TimeSelect
                          value={startMin}
                          onChange={(min) => {
                            setStartMin(min);
                            setTimeChosen(true);
                          }}
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <label className={labelClass}>
                    Start date
                    <DateField value={null} onChange={pickStart} />
                    <span className={hintClass}>
                      Optional — without a date it waits under “To plan”.
                    </span>
                  </label>
                )}

                {startDate && (
                  <div className="rounded-xl bg-neutral-800 px-3.5">
                    <Switch checked={allDay} onChange={setAllDay} label="All day" />
                  </div>
                )}

                {startDate && !allDay && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-neutral-500">
                        Ends by
                      </span>
                      <div className="segmented">
                        {(["duration", "end"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setEndMode(m)}
                            aria-pressed={endMode === m}
                          >
                            {m === "duration" ? "Duration" : "End date"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {endMode === "duration" ? (
                      <label className={labelClass}>
                        Duration
                        {/* The entry's own length is always on the list, even
                            when it isn't a preset (dragged to 2.5 h, say). */}
                        <select
                          value={durationMin}
                          onChange={(e) => setDurationMin(Number(e.target.value))}
                          className="field"
                        >
                          {withValue(DURATIONS, durationMin).map((minutes) => (
                            <option key={minutes} value={minutes}>
                              {durationLabel(minutes)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="grid grid-cols-[1fr_7rem] gap-3">
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
          </>
        )}

        {/* description — a div, not a <label>: wrapping the editor in a
            label routes clicks to its first button (Bold) and toggles it. */}
        <div
          className={`flex flex-col gap-1.5 ${notesExpanded ? "min-h-0 flex-1" : ""}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Notes</span>
            <button
              type="button"
              onClick={() => setNotesExpanded((v) => !v)}
              title={notesExpanded ? "Shrink notes" : "Expand notes"}
              aria-label={notesExpanded ? "Shrink notes" : "Expand notes"}
              className="icon-btn -my-2 -mr-2"
            >
              {notesExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </div>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Add details…"
            ariaLabel="Notes"
            expanded={notesExpanded}
          />
        </div>

        {error && (
          <p ref={errorRef} role="alert" className="text-sm font-medium text-accent-bright">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
