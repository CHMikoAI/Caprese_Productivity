"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Pencil, Trash2 } from "lucide-react";
import { deleteJournalEntry, saveJournalEntry } from "@/app/actions";
import DateField from "@/components/DateField";
import {
  addDays,
  formatDayLong,
  fromDateKey,
  isoWeek,
  startOfWeek,
  toDateKey,
  weekRangeLabel,
  WEEKDAYS_SHORT,
} from "@/lib/dates";
import { PILLAR_META } from "@/lib/pillarIcons";
import { STREAK_MILESTONE } from "@/lib/rewards";
import { useShortcuts } from "@/lib/useShortcuts";
import { PILLARS, type JournalEntry, type Pillar } from "@/lib/types";
import RewardToast, { useRewardToast } from "@/components/RewardToast";
import Toast, { useToast } from "@/components/Toast";

const TEXTAREA_MAX_LINES = 3;

export default function JournalView({
  initialEntries,
}: {
  initialEntries: JournalEntry[];
}) {
  const router = useRouter();
  const { message: toast, show: showError } = useToast();
  const { reward, showReward } = useRewardToast();

  const [entries, setEntries] = useState(initialEntries);
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  const [content, setContent] = useState("");
  const [pillar, setPillar] = useState<Pillar | null>(null);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setEntries(initialEntries), [initialEntries]);

  useShortcuts({
    n: () => textareaRef.current?.focus(),
  });

  const entryForDate = entries.find((e) => e.entry_date === dateKey);

  // Load the selected day into the composer (edit-in-place per day).
  useEffect(() => {
    setContent(entryForDate?.content ?? "");
    setPillar(entryForDate?.pillar ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  // Auto-grow the textarea up to TEXTAREA_MAX_LINES, then let it scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    const maxHeight = lineHeight * TEXTAREA_MAX_LINES;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [content]);

  const stats = useMemo(() => {
    const total: Record<Pillar, number> = {
      freedom: 0,
      health: 0,
      relationship: 0,
    };
    const month: Record<Pillar, number> = {
      freedom: 0,
      health: 0,
      relationship: 0,
    };
    const monthKey = toDateKey(new Date()).slice(0, 7);
    const dates = new Set<string>();
    for (const entry of entries) {
      total[entry.pillar] += 1;
      if (entry.entry_date.startsWith(monthKey)) month[entry.pillar] += 1;
      dates.add(entry.entry_date);
    }
    let streak = 0;
    let cursor = new Date();
    if (!dates.has(toDateKey(cursor))) cursor = addDays(cursor, -1);
    while (dates.has(toDateKey(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return { total, month, streak };
  }, [entries]);

  const weekGroups = useMemo(() => {
    const sorted = [...entries].sort((a, b) =>
      a.entry_date < b.entry_date ? 1 : -1,
    );
    const groups: {
      key: string;
      kw: number;
      range: string;
      entries: JournalEntry[];
    }[] = [];
    const byKey = new Map<string, (typeof groups)[number]>();
    for (const entry of sorted) {
      const weekStart = startOfWeek(fromDateKey(entry.entry_date));
      const key = toDateKey(weekStart);
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          kw: isoWeek(addDays(weekStart, 3)),
          range: weekRangeLabel(weekStart),
          entries: [],
        };
        byKey.set(key, group);
        groups.push(group);
      }
      group.entries.push(entry);
    }
    return groups;
  }, [entries]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !pillar || busy) return;
    setBusy(true);
    try {
      const { entry: saved, picksAwarded, streakBonus } =
        await saveJournalEntry(dateKey, pillar, trimmed);
      setEntries((list) => [
        saved,
        ...list.filter((entry) => entry.entry_date !== saved.entry_date),
      ]);
      router.refresh();
      if (picksAwarded > 0) {
        showReward(
          picksAwarded,
          streakBonus > 0
            ? `${STREAK_MILESTONE}-day streak bonus included!`
            : undefined,
        );
      }
    } catch {
      showError("Could not save the entry.");
    }
    setBusy(false);
  }

  function remove(entry: JournalEntry) {
    const prev = entries;
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    deleteJournalEntry(entry.id)
      .then(() => router.refresh())
      .catch(() => {
        setEntries(prev);
        showError("Could not delete the entry.");
      });
  }

  const todayKey = toDateKey(new Date());

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
        Journal
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        One sentence a day — what did you learn, where did you make progress?
      </p>

      {/* stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Flame className="h-3.5 w-3.5 text-accent" />
            Streak
          </div>
          <p className="mt-2 text-xl font-semibold text-neutral-100">
            {stats.streak} {stats.streak === 1 ? "day" : "days"}
          </p>
        </div>
        {PILLARS.map((p) => {
          const Icon = PILLAR_META[p].icon;
          return (
            <div
              key={p}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
            >
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Icon className="h-3.5 w-3.5" />
                {PILLAR_META[p].label}
              </div>
              <p className="mt-2 text-xl font-semibold text-neutral-100">
                {stats.total[p]}
              </p>
              <p className="mt-0.5 text-xs text-neutral-600">
                +{stats.month[p]} this month
              </p>
            </div>
          );
        })}
      </div>

      {/* composer */}
      <form
        onSubmit={save}
        className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-200">
            {dateKey === todayKey ? "Today" : formatDayLong(fromDateKey(dateKey))}
          </h2>
          <div className="w-40">
            <DateField
              value={fromDateKey(dateKey)}
              onChange={(d) => setDateKey(toDateKey(d))}
              maxDate={new Date()}
            />
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          placeholder="One sentence: what did you learn or improve?"
          rows={1}
          className="mt-3 w-full resize-none overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PILLARS.map((p) => {
            const Icon = PILLAR_META[p].icon;
            const active = pillar === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPillar(p)}
                className={
                  active
                    ? "flex items-center gap-1.5 rounded-full border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-medium text-neutral-50"
                    : "flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200"
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {PILLAR_META[p].label}
              </button>
            );
          })}
          <button
            type="submit"
            disabled={busy || !content.trim() || !pillar}
            className="ml-auto rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {entryForDate ? "Update" : "Save"}
          </button>
        </div>
      </form>

      {/* history */}
      <div className="mt-8 flex flex-col gap-6 pb-8">
        {weekGroups.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-600">
            No entries yet. Write your first sentence above.
          </p>
        )}
        {weekGroups.map((group) => (
          <section key={group.key}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              KW {group.kw}
              <span className="ml-2 font-normal normal-case text-neutral-600">
                {group.range}
              </span>
            </h3>
            <ul className="mt-2 flex flex-col gap-2 sm:gap-0">
              {group.entries.map((entry) => {
                const date = fromDateKey(entry.entry_date);
                const Icon = PILLAR_META[entry.pillar].icon;
                const label = PILLAR_META[entry.pillar].label;
                const openEdit = () => {
                  setDateKey(entry.entry_date);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                };
                return (
                  <li key={entry.id}>
                    {/* desktop: compact inline row, actions on hover */}
                    <div className="group hidden items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-900/70 sm:flex">
                      <span className="w-14 shrink-0 pt-0.5 text-xs text-neutral-500">
                        {WEEKDAYS_SHORT[(date.getDay() + 6) % 7]} {date.getDate()}
                      </span>
                      <span title={label}>
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                      </span>
                      <p className="min-w-0 flex-1 text-sm leading-relaxed text-neutral-200">
                        {entry.content}
                      </p>
                      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={openEdit}
                          className="rounded-md p-1 text-neutral-600 hover:bg-neutral-800 hover:text-neutral-200"
                          aria-label="Edit entry"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(entry)}
                          className="rounded-md p-1 text-neutral-600 hover:bg-neutral-800 hover:text-accent"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* mobile: a card — full-width sentence, meta + always-on
                        actions above it (there is no hover on touch) */}
                    <div className="flex flex-col gap-2 rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-3.5 py-3 sm:hidden">
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {WEEKDAYS_SHORT[(date.getDay() + 6) % 7]}{" "}
                          {date.getDate()} · {label}
                        </span>
                        <div className="ml-auto flex gap-0.5">
                          <button
                            onClick={openEdit}
                            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                            aria-label="Edit entry"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => remove(entry)}
                            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-accent"
                            aria-label="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed text-neutral-100">
                        {entry.content}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <Toast message={toast} />
      <RewardToast reward={reward} />
    </div>
  );
}
