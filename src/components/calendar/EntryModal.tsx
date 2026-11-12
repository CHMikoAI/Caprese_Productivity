"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  CalendarDays,
  Maximize2,
  Minimize2,
  Trash2,
} from "lucide-react";
import { MonthCalendar } from "@/components/DateField";
import RichTextEditor from "@/components/RichTextEditor";
import Sheet from "@/components/Sheet";
import Switch from "@/components/Switch";
import {
  addDays,
  addMinutes,
  durationLabel,
  formatDayLong,
  isSameDay,
  minutesSinceMidnight,
  startOfDay,
  toDateKey,
  WEEKDAYS_SHORT,
  withMinutes,
} from "@/lib/dates";
import { blockPalette } from "@/lib/colorContrast";
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

/** Lengths offered as one-tap chips. */
const DURATIONS = [30, 60, 90, 120, 240];
/** Days offered in the strip, from today on. */
const STRIP_DAYS = 14;
/** Last half-hour slot of a day. */
const LAST_SLOT = 23 * 60 + 30;

/** `list` plus `value` when it is not one of the presets, in order. */
function withValue(list: number[], value: number): number[] {
  return list.includes(value) ? list : [...list, value].sort((a, b) => a - b);
}

/** "Wed, 11 Nov" — with the year once it is not this one. */
function dayLabel(date: Date) {
  const label = formatDayLong(date);
  return date.getFullYear() === new Date().getFullYear()
    ? label
    : `${label} ${date.getFullYear()}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const rowClass = "flex min-h-[3.25rem] items-center justify-between gap-3";
const projectChip =
  "inline-flex shrink-0 items-center rounded-full px-3.5 py-2 text-sm font-medium transition-colors";
const pickChip =
  "inline-flex shrink-0 items-center rounded-full px-3.5 py-2 text-sm font-medium transition-colors aria-pressed:bg-neutral-100 aria-pressed:text-neutral-950";

/**
 * Keeps the selected chip of a sideways-scrolling row in sight — and otherwise
 * leaves the row alone: a chip that is already visible stays where the finger
 * found it. Sideways only (`scrollIntoView` would also move the form), and the
 * first placement is not animated.
 */
function useSelectedInView(key: string | number) {
  const scroller = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  useEffect(() => {
    const row = scroller.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;
    const margin = 12;
    const left = chip.offsetLeft - margin;
    const right = chip.offsetLeft + chip.offsetWidth + margin;
    let target: number | null = null;
    if (left < row.scrollLeft) target = left;
    else if (right > row.scrollLeft + row.clientWidth) target = right - row.clientWidth;
    if (target !== null) {
      row.scrollTo({
        left: Math.max(0, target),
        behavior: placed.current ? "smooth" : "auto",
      });
    }
    placed.current = true;
  }, [key]);
  return scroller;
}

/** Every half hour of the day, in minutes since midnight. */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);

function timeLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * One list of times — every half hour on the 24-hour clock. Under a finger it
 * is the system's own menu; under a mouse it is a list drawn to match the rest
 * of the dialog. An entry that sits between two half hours (dragged to 09:10,
 * say) keeps its real time on the list.
 */
function TimeSelect({
  value,
  onChange,
  label,
  invalid = false,
}: {
  value: number;
  onChange: (min: number) => void;
  label: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = ((value % 1440) + 1440) % 1440;
  const options = withValue(HALF_HOURS, current);

  // Close on a press anywhere else.
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

  // Open on the current time, with the list itself in view.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && selected) {
      list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
    }
    list?.scrollIntoView({ block: "nearest" });
  }, [open]);

  function step(delta: number) {
    const index = options.indexOf(current);
    const next = options[Math.min(options.length - 1, Math.max(0, index + delta))];
    if (next !== current) onChange(next);
  }

  // The arrow keys move the time while the list is open — keep it in sight.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, current]);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${timeLabel(current)}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            step(e.key === "ArrowDown" ? 1 : -1);
          } else if (e.key === "Escape" && open) {
            // Close the list only — not the dialog it sits in.
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "Tab") {
            setOpen(false);
          }
        }}
        className={`time-pill ${invalid ? "text-accent-bright" : ""} ${
          open ? "bg-neutral-600" : ""
        }`}
      >
        {timeLabel(current)}
      </button>

      {/* Under a finger: the system menu, laid invisibly over the pill. */}
      <select
        aria-label={label}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 hidden h-full w-full cursor-pointer opacity-0 [@media(pointer:coarse)]:block"
      >
        {options.map((min) => (
          <option key={min} value={min}>
            {timeLabel(min)}
          </option>
        ))}
      </select>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="time-list absolute right-0 top-full z-[60] mt-1.5 max-h-64 w-28 scroll-mb-3 overflow-y-auto overscroll-contain rounded-2xl bg-neutral-800 p-1.5 shadow-2xl ring-1 ring-white/15"
        >
          {options.map((min) => {
            const selected = min === current;
            return (
              <button
                key={min}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onClick={() => {
                  onChange(min);
                  setOpen(false);
                }}
                className={`flex h-9 w-full items-center justify-center rounded-lg text-sm tabular-nums transition-colors ${
                  selected
                    ? "bg-accent font-semibold text-white"
                    : "text-neutral-200 hover:bg-neutral-700"
                }`}
              >
                {timeLabel(min)}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

/**
 * The next two weeks as a row of days — the date most entries get is one tap
 * away. A date outside the row gets its own chip; the calendar button opens the
 * full month for everything else.
 */
function DayStrip({
  value,
  onPick,
  noneLabel,
  onNone,
  calendarOpen,
  onToggleCalendar,
}: {
  value: Date | null;
  onPick: (day: Date) => void;
  /** With a label, "no date" is a choice (tasks and goals). */
  noneLabel?: string;
  onNone?: () => void;
  calendarOpen: boolean;
  onToggleCalendar: () => void;
}) {
  const today = startOfDay(new Date());
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i));
  const last = days[days.length - 1];
  const before = value && value.getTime() < today.getTime() ? value : null;
  const after = value && value.getTime() > last.getTime() ? value : null;
  const scroller = useSelectedInView(value ? toDateKey(value) : "none");

  function chip(day: Date, top: string) {
    const selected = value ? isSameDay(day, value) : false;
    return (
      <button
        key={toDateKey(day)}
        type="button"
        onClick={() => onPick(day)}
        aria-pressed={selected}
        aria-label={dayLabel(day)}
        className={`flex h-[3.75rem] w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-2xl transition-colors ${
          selected ? "bg-accent text-white" : "bg-neutral-800 text-neutral-100"
        }`}
      >
        <span
          className={`text-[0.6875rem] font-medium leading-4 ${
            selected ? "text-white/85" : "text-neutral-500"
          }`}
        >
          {top}
        </span>
        <span className="text-lg font-semibold leading-6 tabular-nums">
          {day.getDate()}
        </span>
      </button>
    );
  }

  return (
    <div className="flex gap-1.5">
      {/* Pinned in front of the row: any date at all is always one tap away,
          however far the days have been scrolled. */}
      <button
        type="button"
        onClick={onToggleCalendar}
        aria-expanded={calendarOpen}
        aria-label="Pick another date"
        className={`flex h-[3.75rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl transition-colors ${
          calendarOpen ? "bg-neutral-600 text-white" : "bg-neutral-800 text-neutral-300"
        }`}
      >
        <CalendarDays className="h-5 w-5" />
      </button>
      <div
        ref={scroller}
        className="chip-scroller relative -mr-5 min-w-0 flex-1 rounded-l-2xl pr-5 sm:-mr-6 sm:pr-6"
        role="group"
        aria-label="Day"
      >
        {noneLabel && (
          <button
            type="button"
            onClick={onNone}
            aria-pressed={value === null}
            className={`flex h-[3.75rem] shrink-0 items-center rounded-2xl px-4 text-sm font-medium transition-colors ${
              value === null ? "bg-accent text-white" : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {noneLabel}
          </button>
        )}
        {before && chip(before, MONTHS[before.getMonth()])}
        {days.map((day, i) =>
          chip(day, i === 0 ? "Today" : WEEKDAYS_SHORT[(day.getDay() + 6) % 7]),
        )}
        {after && chip(after, MONTHS[after.getMonth()])}
      </div>
    </div>
  );
}

/** The full month, opened in place under the control that asked for it. */
function InlineCalendar({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (day: Date) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  return (
    <div ref={ref} className="scroll-mb-3 rounded-2xl bg-neutral-800 p-2.5 sm:max-w-xs">
      <MonthCalendar value={value} onChange={onChange} />
    </div>
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
  // for events.
  const [startDate, setStartDate] = useState<Date | null>(() =>
    initial.scheduled ? startOfDay(initial.start) : null,
  );
  const [startMin, setStartMin] = useState(() =>
    minutesSinceMidnight(initial.start),
  );
  // Until the time has been chosen on purpose — by picking it here, or by
  // opening the dialog on a calendar slot — it follows the date (see pickStart).
  const [timeChosen, setTimeChosen] = useState(initial.scheduled);
  // The length is what is kept: moving the start moves the end along. It can
  // go to zero or below while the end is being set — that is flagged, not
  // silently corrected.
  const [durationMin, setDurationMin] = useState(initial.durationMin);

  const [allDay, setAllDay] = useState(initial.allDay);
  // Inclusive end date for all-day entries (same day = single-day entry).
  // Derived from duration so editing a stored multi-day span shows the last
  // covered day, not the exclusive next midnight.
  const [allDayEnd, setAllDayEnd] = useState(() =>
    startOfDay(addMinutes(initial.start, Math.max(initial.durationMin - 1, 0))),
  );

  /** Which date is being picked from the full month, if any. */
  const [picker, setPicker] = useState<"start" | "end" | null>(null);
  const [notesOpen, setNotesOpen] = useState(
    () => initial.description.replace(/<[^>]*>/g, "").trim() !== "",
  );
  // Only an editor opened by hand takes the focus (and the keyboard).
  const [notesFocus, setNotesFocus] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A new entry starts in its title — under a mouse. On a phone that would
  // bring the keyboard up while the sheet is still sliding in, and iOS then
  // pans the page to wherever the field was at that moment: the sheet opens
  // showing its lower half. There the sheet opens whole, and a tap on the
  // title (right at the top) brings the keyboard.
  const [focusTitle] = useState(
    () =>
      mode === "create" &&
      typeof window !== "undefined" &&
      !window.matchMedia("(pointer: coarse)").matches,
  );
  const durationRow = useSelectedInView(durationMin);
  const titleRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const endErrorRef = useRef<HTMLParagraphElement>(null);

  const start = startDate ? withMinutes(startDate, startMin) : null;
  const end = start ? addMinutes(start, durationMin) : null;
  const endInvalid = Boolean(start && !allDay && durationMin <= 0);
  const shownAllDayEnd =
    startDate && allDayEnd.getTime() < startDate.getTime() ? startDate : allDayEnd;

  function fail(message: string) {
    setError(message);
    requestAnimationFrame(() =>
      errorRef.current?.scrollIntoView({ block: "nearest" }),
    );
  }

  function pickStart(day: Date) {
    const d = startOfDay(day);
    setStartDate(d);
    // A fresh date starts as a single day; otherwise keep the all-day range
    // valid when the start moves past its end.
    if (!startDate || allDayEnd.getTime() < d.getTime()) setAllDayEnd(d);
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

  /** Move the end; the length follows from it. */
  function pickEnd(next: Date) {
    if (!start) return;
    setDurationMin(Math.round((next.getTime() - start.getTime()) / 60000));
  }

  function changeType(t: EntryType) {
    setType(t);
    setError(null);
    setPicker(null);
    // Events must be dated — give them one the moment they're selected.
    if (t === "event" && !startDate) pickStart(initial.start);
    // Goals are date-only by default — which should not stick to an entry
    // that was only a goal for a moment.
    if (t === "goal") setAllDay(true);
    else if (type === "goal") setAllDay(initial.allDay);
    // Todos never sit on the calendar.
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
      // Off-calendar reminder: no start. A deadline can no longer be set
      // here; one an older to-do still carries is kept as it is.
      allDayOut = true;
      if (initial.type === "todo" && initial.deadline) {
        endAt = addDays(startOfDay(initial.deadline), 1).toISOString();
      }
    } else if (startDate && allDay) {
      // Date-only entry: covers start day through the (inclusive) end day.
      startAt = startOfDay(startDate).toISOString();
      endAt = addDays(startOfDay(shownAllDayEnd), 1).toISOString();
      allDayOut = true;
    } else if (start && end) {
      if (durationMin <= 0) {
        // Already flagged on the Ends row — bring that into view.
        endErrorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
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
      // On a phone Cancel and Save sit in the title row, above any keyboard.
      submitLabel="Save"
      // Typed input should not vanish on a stray tap next to the dialog.
      dismissOnBackdrop={false}
      // On a phone the sheet always takes the full height: its top edge then
      // stays put whatever the form shows and whether or not a keyboard is up.
      fill={notesExpanded ? true : "phone"}
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
            >
              <Trash2 className="h-4 w-4" />
              Delete
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
        className={`flex flex-col gap-5 pt-1 ${notesExpanded ? "min-h-0 flex-1" : ""}`}
        onKeyDown={(e) => {
          // The notes editor has no Enter-to-submit; ⌘/Ctrl+Enter saves.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.closest("form")?.requestSubmit();
          }
        }}
        onClickCapture={(e) => {
          // A complaint about the form is stale once the form is being changed.
          if (error) setError(null);
          // Done typing the title, on to the rest: a tap on any control puts
          // the keyboard away, so the whole form is in view again.
          const input = titleRef.current;
          if (
            input &&
            document.activeElement === input &&
            (e.target as HTMLElement).closest("button")
          ) {
            input.blur();
          }
        }}
      >
        {!notesExpanded && (
          <>
            <div>
              <input
                ref={titleRef}
                autoFocus={focusTitle}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  // On a phone the keyboard's "done" only puts the keyboard
                  // away; saving is the button above. (Desktop: Enter saves.)
                  if (
                    e.key === "Enter" &&
                    !e.metaKey &&
                    !e.ctrlKey &&
                    window.matchMedia("(pointer: coarse)").matches
                  ) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Title"
                aria-label="Title"
                enterKeyHint="done"
                autoComplete="off"
                className="title-input"
              />
              {error && (
                <p
                  ref={errorRef}
                  role="alert"
                  className="mt-1 text-sm font-medium text-accent-bright"
                >
                  {error}
                </p>
              )}
            </div>

            {type === "todo" ? (
              <p className="text-xs leading-relaxed text-neutral-500">
                A quick reminder, never on the calendar. Finish {TODO_BATCH} to
                earn a pick.
              </p>
            ) : (
              <section className="flex flex-col gap-2.5" aria-label="When">
                <p className="section-label">When</p>
                <DayStrip
                  value={startDate}
                  onPick={(day) => {
                    pickStart(day);
                    setPicker(null);
                  }}
                  // Events must be dated; tasks and goals may wait.
                  noneLabel={type === "event" ? undefined : "No date"}
                  onNone={() => {
                    setStartDate(null);
                    setPicker(null);
                  }}
                  calendarOpen={picker === "start"}
                  onToggleCalendar={() =>
                    setPicker((p) => (p === "start" ? null : "start"))
                  }
                />
                {picker === "start" && (
                  <InlineCalendar
                    value={startDate}
                    onChange={(day) => {
                      pickStart(day);
                      setPicker(null);
                    }}
                  />
                )}

                {startDate && start && end ? (
                  <div className="divide-y divide-neutral-700/60 rounded-2xl bg-neutral-800 px-4">
                    <Switch
                      checked={allDay}
                      onChange={(on) => {
                        setAllDay(on);
                        setPicker(null);
                      }}
                      label="All day"
                      className="min-h-[3.25rem]"
                    />

                    <div className={rowClass}>
                      <span className="text-sm font-medium text-neutral-200">Starts</span>
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPicker((p) => (p === "start" ? null : "start"))
                          }
                          aria-expanded={picker === "start"}
                          className="rounded-lg px-1.5 py-2 text-sm text-neutral-300 transition-opacity active:opacity-50"
                        >
                          {dayLabel(startDate)}
                        </button>
                        {!allDay && (
                          <TimeSelect
                            label="Start time"
                            value={startMin}
                            onChange={(min) => {
                              setStartMin(min);
                              setTimeChosen(true);
                            }}
                          />
                        )}
                      </span>
                    </div>

                    <div>
                      <div className={rowClass}>
                        <span className="text-sm font-medium text-neutral-200">Ends</span>
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPicker((p) => (p === "end" ? null : "end"))
                            }
                            aria-expanded={picker === "end"}
                            className={`rounded-lg px-1.5 py-2 text-sm transition-opacity active:opacity-50 ${
                              endInvalid ? "text-accent-bright" : "text-neutral-300"
                            }`}
                          >
                            {dayLabel(allDay ? shownAllDayEnd : end)}
                          </button>
                          {!allDay && (
                            <TimeSelect
                              label="End time"
                              value={minutesSinceMidnight(end)}
                              invalid={endInvalid}
                              onChange={(min) => pickEnd(withMinutes(end, min))}
                            />
                          )}
                        </span>
                      </div>
                      {endInvalid && (
                        <p
                          ref={endErrorRef}
                          role="alert"
                          className="-mt-1 pb-3 text-right text-xs font-medium text-accent-bright"
                        >
                          The end has to be after the start.
                        </p>
                      )}
                      {picker === "end" && (
                        <div className="pb-3">
                          <InlineCalendar
                            value={allDay ? shownAllDayEnd : end}
                            onChange={(day) => {
                              if (allDay) {
                                // An end before the start pulls the start along.
                                const d = startOfDay(day);
                                if (d.getTime() < startDate.getTime()) setStartDate(d);
                                setAllDayEnd(d);
                              } else {
                                pickEnd(withMinutes(day, minutesSinceMidnight(end)));
                              }
                              setPicker(null);
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {!allDay && (
                      <div
                        ref={durationRow}
                        className="chip-scroller relative py-2.5"
                        role="group"
                        aria-label="Duration"
                      >
                        {/* The entry's own length is always on the list, even
                            when it isn't a preset (dragged to 2.5 h, say). */}
                        {(durationMin > 0 ? withValue(DURATIONS, durationMin) : DURATIONS).map(
                          (minutes) => (
                            <button
                              key={minutes}
                              type="button"
                              onClick={() => setDurationMin(minutes)}
                              aria-pressed={durationMin === minutes}
                              className={`${pickChip} flex-1 justify-center whitespace-nowrap bg-neutral-700/70 px-2.5 text-neutral-200`}
                            >
                              {durationLabel(minutes)}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-neutral-500">
                    Without a date it waits under “To plan”.
                  </p>
                )}
              </section>
            )}

            {categories.length > 0 && (
              <section className="flex flex-col gap-2.5" aria-label="Project">
                <p className="section-label">Project</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Project">
                  <button
                    type="button"
                    onClick={() => setCategoryId("")}
                    aria-pressed={categoryId === ""}
                    className={`${projectChip} ${
                      categoryId === ""
                        ? "bg-neutral-600 text-white"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    None
                  </button>
                  {categories.map((c) => {
                    const selected = categoryId === c.id;
                    // The chosen project wears its own colour — the one its
                    // blocks have on the calendar.
                    const pal = selected ? blockPalette(c.color, 0.9) : null;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoryId(selected ? "" : c.id)}
                        aria-pressed={selected}
                        className={`${projectChip} ${
                          selected ? "" : "bg-neutral-800 text-neutral-200"
                        }`}
                        style={pal ? { backgroundColor: pal.bg, color: pal.title } : undefined}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* notes — a div, not a <label>: wrapping the editor in a label routes
            clicks to its first button (Bold) and toggles it. */}
        {notesOpen ? (
          <div
            className={`flex flex-col gap-1.5 ${notesExpanded ? "min-h-0 flex-1" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="section-label">Notes</span>
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
              autoFocus={notesFocus}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNotesFocus(true);
              setNotesOpen(true);
            }}
            className="flex min-h-[3.25rem] items-center gap-3 rounded-2xl bg-neutral-800 px-4 text-left text-sm font-medium text-neutral-400 transition-opacity active:opacity-60"
          >
            <AlignLeft className="h-4 w-4" />
            Add notes
          </button>
        )}

        {mode === "edit" && onDelete && !notesExpanded && (
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl bg-neutral-800 text-sm font-medium text-accent-bright transition-opacity active:opacity-60 sm:hidden"
          >
            <Trash2 className="h-4 w-4" />
            Delete {typeLabel}
          </button>
        )}
      </div>
    </Sheet>
  );
}
