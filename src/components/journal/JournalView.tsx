"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Pencil, Trash2 } from "lucide-react";
import { deleteJournalEntry, saveJournalEntry } from "@/app/actions";
import DateField from "@/components/DateField";
import PageHeader from "@/components/PageHeader";
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
import { scrollAppToTop } from "@/lib/scroll";
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
  const { message: toast, show: showToast, dismiss: dismissToast } = useToast();
  const { reward, showReward } = useRewardToast();

  const [entries, setEntries] = useState(initialEntries);
  // Re-adopt server state whenever a fresh payload arrives (router.refresh).
  const [syncedEntries, setSyncedEntries] = useState(initialEntries);
  if (syncedEntries !== initialEntries) {
    setSyncedEntries(initialEntries);
    setEntries(initialEntries);
  }

  // The composer edits one day in place: today by default, any earlier day via
  // the date field or a history row's pencil.
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  const [content, setContent] = useState(
    () =>
      initialEntries.find((e) => e.entry_date === toDateKey(new Date()))
        ?.content ?? "",
  );
  const [pillar, setPillar] = useState<Pillar | null>(
    () =>
      initialEntries.find((e) => e.entry_date === toDateKey(new Date()))
        ?.pillar ?? null,
  );
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useShortcuts({
    n: () => textareaRef.current?.focus(),
  });

  const entryForDate = entries.find((e) => e.entry_date === dateKey);

  /** Bring a day into the composer — its entry if it has one, a blank otherwise. */
  function selectDate(key: string) {
    const entry = entries.find((e) => e.entry_date === key);
    setDateKey(key);
    setContent(entry?.content ?? "");
    setPillar(entry?.pillar ?? null);
  }

  // Auto-grow the textarea up to TEXTAREA_MAX_LINES, then let it scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const maxHeight = lineHeight * TEXTAREA_MAX_LINES + padding;
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
      } else {
        showToast(entryForDate ? "Entry updated" : "Entry saved");
      }
    } catch {
      showToast("Could not save the entry.");
    }
    setBusy(false);
  }

  /** Delete a day's line. One tap and it is gone, so offer the way back. */
  function remove(entry: JournalEntry) {
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    const deleted = deleteJournalEntry(entry.id)
      .then(() => router.refresh())
      .catch(() => {
        setEntries((list) =>
          list.some((e) => e.id === entry.id) ? list : [entry, ...list],
        );
        showToast("Could not delete the entry.");
      });
    showToast("Entry deleted", {
      label: "Undo",
      run: () => {
        // Wait for the delete to land first, or the two would cross. Saving
        // the same day again pays nothing extra — that pick was already paid.
        deleted
          .then(() =>
            saveJournalEntry(entry.entry_date, entry.pillar, entry.content),
          )
          .then(({ entry: restored }) => {
            setEntries((list) => [
              restored,
              ...list.filter((e) => e.entry_date !== restored.entry_date),
            ]);
            router.refresh();
          })
          .catch(() => showToast("Could not restore the entry."));
      },
    });
  }

  const todayKey = toDateKey(new Date());

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 pt-5 pb-page sm:px-6 sm:pt-6">
      <PageHeader title="Journal" />

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-1.5 section-label">
            <Flame className="h-3.5 w-3.5 text-accent" />
            Streak
          </div>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-neutral-50">
            {stats.streak} {stats.streak === 1 ? "day" : "days"}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {entries.some((e) => e.entry_date === todayKey)
              ? "today is in"
              : stats.streak > 0
                ? "write today to keep it"
                : "starts with today"}
          </p>
        </div>
        {PILLARS.map((p) => {
          const Icon = PILLAR_META[p].icon;
          return (
            <div key={p} className="card p-4">
              <div className="flex items-center gap-1.5 section-label">
                <Icon className="h-3.5 w-3.5" />
                {PILLAR_META[p].label}
              </div>
              <p className="mt-1.5 text-xl font-semibold tabular-nums text-neutral-50">
                {stats.total[p]}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                +{stats.month[p]} this month
              </p>
            </div>
          );
        })}
      </div>

      {/* composer */}
      <form onSubmit={save} className="card mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-50">
            {dateKey === todayKey ? "Today" : formatDayLong(fromDateKey(dateKey))}
          </h2>
          <div className="w-40">
            <DateField
              value={fromDateKey(dateKey)}
              onChange={(d) => selectDate(toDateKey(d))}
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
          aria-label="Journal entry"
          enterKeyHint="done"
          rows={1}
          className="field mt-3 resize-none overflow-y-auto leading-relaxed"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Pillar"
          >
            {PILLARS.map((p) => {
              const Icon = PILLAR_META[p].icon;
              const active = pillar === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPillar(p)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "bg-neutral-800 text-neutral-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {PILLAR_META[p].label}
                </button>
              );
            })}
          </div>
          <button
            type="submit"
            disabled={busy || !content.trim() || !pillar}
            className="btn-primary ml-auto"
          >
            {busy ? "Saving…" : entryForDate ? "Update" : "Save"}
          </button>
        </div>
        {/* A greyed-out Save with no reason given is a dead end. */}
        {content.trim() && !pillar && (
          <p className="mt-2 text-xs text-neutral-500">
            Pick the pillar this line belongs to, then save.
          </p>
        )}
      </form>

      {/* history */}
      <div className="mt-7 flex flex-col gap-5">
        {weekGroups.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            No entries yet. Write your first sentence above.
          </p>
        )}
        {weekGroups.map((group) => (
          <section key={group.key}>
            <h3 className="section-label px-1">
              KW {group.kw}
              <span className="ml-2 text-neutral-600">{group.range}</span>
            </h3>
            <ul className="card mt-1.5 list-group overflow-hidden">
              {group.entries.map((entry) => {
                const date = fromDateKey(entry.entry_date);
                const Icon = PILLAR_META[entry.pillar].icon;
                const label = PILLAR_META[entry.pillar].label;
                const day = `${WEEKDAYS_SHORT[(date.getDay() + 6) % 7]} ${date.getDate()}`;
                return (
                  // On a phone the sentence gets the full width, under a line
                  // with the day and the actions; from sm on it is one row.
                  <li
                    key={entry.id}
                    className={`flex flex-wrap items-center gap-x-3 py-1 pl-3.5 pr-1 transition-colors sm:flex-nowrap sm:items-start sm:py-1.5 ${
                      entry.entry_date === dateKey ? "bg-neutral-800/50" : ""
                    }`}
                  >
                    <span
                      title={label}
                      className="flex w-16 shrink-0 items-center gap-1.5 text-xs text-neutral-500 sm:pt-2.5"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-label={label} />
                      {day}
                    </span>
                    <p className="order-last basis-full pb-2.5 pr-2.5 text-sm leading-relaxed text-neutral-100 sm:order-none sm:min-w-0 sm:flex-1 sm:basis-0 sm:py-2 sm:pr-0">
                      {entry.content}
                    </p>
                    <span className="ml-auto flex shrink-0">
                      <button
                        onClick={() => {
                          selectDate(entry.entry_date);
                          scrollAppToTop();
                          textareaRef.current?.focus({ preventScroll: true });
                        }}
                        className="icon-btn"
                        aria-label={`Edit the entry of ${day}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(entry)}
                        className="icon-btn"
                        aria-label={`Delete the entry of ${day}`}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <Toast message={toast} onDismiss={dismissToast} />
      <RewardToast reward={reward} />
    </div>
  );
}
