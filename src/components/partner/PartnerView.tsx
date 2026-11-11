"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  completePartnerGoal,
  createPartnerGoal,
  deletePartnerGoal,
  reopenPartnerGoal,
  repeatPartnerWeek,
  savePartnerTakeaway,
  updatePartnerGoal,
} from "@/app/actions";
import RewardToast, { useRewardToast } from "@/components/RewardToast";
import Toast, { useToast } from "@/components/Toast";
import {
  addDays,
  fromDateKey,
  isoWeek,
  startOfWeek,
  toDateKey,
  weekRangeLabel,
} from "@/lib/dates";
import { PARTNER_OUTCOME_PICKS, PICKS_FOR } from "@/lib/rewards";
import { scrollAppToTop } from "@/lib/scroll";
import { useShortcuts } from "@/lib/useShortcuts";
import {
  PARTNER_DIFFICULTIES,
  PARTNER_DIFFICULTY_LABEL,
  PARTNER_GOALS_SWEET_SPOT,
  PARTNER_NOTE_MIN,
  PARTNER_OUTCOMES,
  PARTNER_OUTCOME_LABEL,
  type PartnerGoal,
  type PartnerOutcome,
  type PartnerWeek,
} from "@/lib/types";

/** How many past weeks the timeline shows. */
const RECENT_WEEKS = 8;
/** Window (in weeks) the difficulty trend compares against the one before it. */
const TREND_WEEKS = 4;

function weekOf(weekStart: string) {
  const start = fromDateKey(weekStart);
  // The Thursday of a week decides its ISO week number.
  return { kw: isoWeek(addDays(start, 3)), range: weekRangeLabel(start) };
}

function shiftWeek(weekStart: string, weeks: number): string {
  return toDateKey(addDays(fromDateKey(weekStart), weeks * 7));
}

function average(values: number[]): number {
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

/**
 * The Partner track: a handful of independent goals per week, each closed with
 * a debrief (how hard it felt + what happened). The stats carry the progress —
 * and the difficulty trend is the real signal: the same kind of goal should
 * start to feel easier.
 */
export default function PartnerView({
  initialGoals,
  initialWeeks,
}: {
  initialGoals: PartnerGoal[];
  initialWeeks: PartnerWeek[];
}) {
  const router = useRouter();
  const { message: toast, show: showError } = useToast();
  const { reward, showReward } = useRewardToast();

  // Sync from the server props without an effect (derive during render).
  const [goals, setGoals] = useState(initialGoals);
  const [weeks, setWeeks] = useState(initialWeeks);
  const [prevInitial, setPrevInitial] = useState(initialGoals);
  if (prevInitial !== initialGoals) {
    setPrevInitial(initialGoals);
    setGoals(initialGoals);
    setWeeks(initialWeeks);
  }

  const currentWeek = toDateKey(startOfWeek(new Date()));
  const [week, setWeek] = useState(currentWeek);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // The open goal panel: rename, rate, debrief — one goal at a time.
  const [openId, setOpenId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLevel, setEditLevel] = useState<number | null>(null);
  const [editOutcome, setEditOutcome] = useState<PartnerOutcome | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  useShortcuts({ n: () => addRef.current?.focus() });

  const byWeek = useMemo(() => {
    const map = new Map<string, PartnerGoal[]>();
    for (const goal of goals) {
      const list = map.get(goal.week_start);
      if (list) list.push(goal);
      else map.set(goal.week_start, [goal]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          a.position - b.position || (a.created_at < b.created_at ? -1 : 1),
      );
    }
    return map;
  }, [goals]);

  const weekGoals = useMemo(() => byWeek.get(week) ?? [], [byWeek, week]);
  const weekDone = weekGoals.filter((g) => g.done_at).length;
  const allDone = weekGoals.length > 0 && weekDone === weekGoals.length;
  // The week bonus needs every goal at least partly achieved.
  const weekClean = allDone && weekGoals.every((g) => g.outcome !== "missed");
  const previousWeek = shiftWeek(week, -1);
  const canRepeat = (byWeek.get(previousWeek) ?? []).length > 0;

  const takeawayOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of weeks) {
      if (entry.takeaway) map.set(entry.week_start, entry.takeaway);
    }
    return map;
  }, [weeks]);

  // Reset the takeaway draft whenever another week comes into focus.
  const [takeawayWeek, setTakeawayWeek] = useState(week);
  const [takeaway, setTakeaway] = useState(takeawayOf.get(week) ?? "");
  if (takeawayWeek !== week) {
    setTakeawayWeek(week);
    setTakeaway(takeawayOf.get(week) ?? "");
  }

  const stats = useMemo(() => {
    const thisWeek = byWeek.get(currentWeek) ?? [];
    // A missed goal is resolved, but it isn't progress — it neither counts as
    // done nor keeps a streak alive.
    const hasDone = (key: string) =>
      (byWeek.get(key) ?? []).some((g) => g.done_at && g.outcome !== "missed");

    // Consecutive weeks with at least one goal closed. The running week only
    // breaks the streak once it is over, so start from last week if it's empty.
    let cursor = currentWeek;
    if (!hasDone(cursor)) cursor = shiftWeek(cursor, -1);
    let streak = 0;
    while (hasDone(cursor)) {
      streak += 1;
      cursor = shiftWeek(cursor, -1);
    }

    // How hard the last few weeks felt, against the few weeks before them.
    const rated = goals.filter((g) => g.done_at && g.difficulty);
    const recentFrom = shiftWeek(currentWeek, -(TREND_WEEKS - 1));
    const beforeFrom = shiftWeek(currentWeek, -(TREND_WEEKS * 2 - 1));
    const recent = rated.filter((g) => g.week_start >= recentFrom);
    const before = rated.filter(
      (g) => g.week_start >= beforeFrom && g.week_start < recentFrom,
    );
    let level: {
      now: number;
      direction: "easier" | "steady" | "harder" | null;
    } | null = null;
    if (recent.length > 0) {
      const now = average(recent.map((g) => g.difficulty as number));
      let direction: "easier" | "steady" | "harder" | null = null;
      if (before.length >= 2) {
        const delta = now - average(before.map((g) => g.difficulty as number));
        direction = delta <= -0.3 ? "easier" : delta >= 0.3 ? "harder" : "steady";
      }
      level = { now, direction };
    }

    return {
      thisWeekTotal: thisWeek.length,
      thisWeekDone: thisWeek.filter((g) => g.done_at).length,
      goalsDone: goals.filter((g) => g.done_at && g.outcome !== "missed").length,
      streak,
      level,
    };
  }, [byWeek, currentWeek, goals]);

  const timeline = useMemo(
    () =>
      [...byWeek.keys()]
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, RECENT_WEEKS)
        .map((key) => {
          const list = byWeek.get(key) ?? [];
          const levels = list
            .filter((g) => g.done_at && g.difficulty)
            .map((g) => g.difficulty as number);
          return {
            key,
            goals: list,
            done: list.filter((g) => g.done_at).length,
            level: levels.length > 0 ? average(levels) : null,
          };
        }),
    [byWeek],
  );

  // ---- mutations (optimistic, then resync from the server) ----

  function patchLocal(id: string, patch: Partial<PartnerGoal>) {
    setGoals((list) => list.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function openGoal(goal: PartnerGoal) {
    if (openId === goal.id) {
      setOpenId(null);
      return;
    }
    setOpenId(goal.id);
    setEditTitle(goal.title);
    setEditNotes(goal.notes ?? "");
    setEditLevel(goal.difficulty);
    setEditOutcome(goal.outcome);
  }

  const debriefReady =
    editOutcome !== null &&
    editLevel !== null &&
    editNotes.trim().length >= PARTNER_NOTE_MIN;

  /** Close a goal: the debrief is saved with it, never separately. */
  async function closeGoal(goal: PartnerGoal) {
    if (!debriefReady || busy) return;
    const level = editLevel as number;
    const outcome = editOutcome as PartnerOutcome;
    const notes = editNotes.trim();
    const title = editTitle.trim() || goal.title;
    setBusy(true);
    setOpenId(null);
    patchLocal(goal.id, {
      title,
      notes,
      difficulty: level,
      outcome,
      done_at: new Date().toISOString(),
    });
    try {
      if (title !== goal.title) await updatePartnerGoal(goal.id, { title });
      const { picksAwarded, weekBonus } = await completePartnerGoal(goal.id, {
        outcome,
        difficulty: level,
        notes,
      });
      router.refresh();
      if (picksAwarded > 0) {
        showReward(
          picksAwarded,
          weekBonus > 0 ? "Week complete — nothing missed!" : undefined,
        );
      }
    } catch {
      patchLocal(goal.id, {
        title: goal.title,
        notes: goal.notes,
        difficulty: goal.difficulty,
        outcome: goal.outcome,
        done_at: goal.done_at,
      });
      showError("Could not close the goal.");
    }
    setBusy(false);
  }

  /** Revise a closed goal (or just rename an open one). */
  async function saveGoal(goal: PartnerGoal) {
    const title = editTitle.trim() || goal.title;
    const notes = editNotes.trim();
    const level = editLevel;
    const outcome = editOutcome;
    // A closed goal must keep its debrief — the database enforces the pairing.
    if (
      goal.done_at &&
      (level === null || outcome === null || notes.length < PARTNER_NOTE_MIN)
    ) {
      showError("A closed goal keeps its outcome, rating and note.");
      return;
    }
    setOpenId(null);
    if (
      title === goal.title &&
      notes === (goal.notes ?? "") &&
      level === goal.difficulty &&
      outcome === goal.outcome
    ) {
      return;
    }
    patchLocal(goal.id, {
      title,
      notes: notes || null,
      difficulty: level,
      outcome,
    });
    try {
      await updatePartnerGoal(goal.id, {
        title,
        notes,
        difficulty: level,
        outcome,
      });
      router.refresh();
    } catch {
      patchLocal(goal.id, {
        title: goal.title,
        notes: goal.notes,
        difficulty: goal.difficulty,
        outcome: goal.outcome,
      });
      showError("Could not save the goal.");
    }
  }

  async function reopenGoal(goal: PartnerGoal) {
    patchLocal(goal.id, { done_at: null });
    try {
      await reopenPartnerGoal(goal.id);
      router.refresh();
    } catch {
      patchLocal(goal.id, { done_at: goal.done_at });
      showError("Could not reopen the goal.");
    }
  }

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const goal = await createPartnerGoal(week, title);
      setGoals((list) => [...list, goal]);
      setDraft("");
      router.refresh();
    } catch {
      showError("Could not add the goal.");
    }
    setBusy(false);
  }

  function removeGoal(goal: PartnerGoal) {
    if (goal.notes && !window.confirm(`Delete "${goal.title}" and its note?`)) {
      return;
    }
    const previous = goals;
    setOpenId((id) => (id === goal.id ? null : id));
    setGoals((list) => list.filter((g) => g.id !== goal.id));
    deletePartnerGoal(goal.id)
      .then(() => router.refresh())
      .catch(() => {
        setGoals(previous);
        showError("Could not delete the goal.");
      });
  }

  async function repeatLastWeek() {
    if (busy) return;
    setBusy(true);
    try {
      const copies = await repeatPartnerWeek(previousWeek, week);
      setGoals((list) => [...list, ...copies]);
      router.refresh();
    } catch {
      showError("Could not copy last week's goals.");
    }
    setBusy(false);
  }

  async function storeTakeaway() {
    const value = takeaway.trim();
    if (value === (takeawayOf.get(week) ?? "")) return;
    setWeeks((list) => [
      {
        week_start: week,
        takeaway: value || null,
        updated_at: new Date().toISOString(),
      },
      ...list.filter((w) => w.week_start !== week),
    ]);
    try {
      await savePartnerTakeaway(week, value);
      router.refresh();
    } catch {
      showError("Could not save the takeaway.");
    }
  }

  const { kw, range } = weekOf(week);
  const takeawaySaved = takeawayOf.get(week) ?? "";
  // The wrap-up shows once the week is finished — or once it is simply over.
  const showWrapUp = weekGoals.length > 0 && (allDone || week < currentWeek);

  return (
    // pb clears the floating capture button on phones, so the last card never
    // sits under it.
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 pt-5 pb-page sm:px-6 sm:pt-6">
      <h1 className="title-lg">Partner</h1>

      {/* stats */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="card p-4">
          <div className="section-label">This week</div>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-neutral-50">
            {stats.thisWeekDone}
            <span className="text-neutral-600">/{stats.thisWeekTotal}</span>
          </p>
          <ProgressBar done={stats.thisWeekDone} total={stats.thisWeekTotal} />
        </div>
        <div className="card p-4">
          <div className="section-label">Goals done</div>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-neutral-50">
            {stats.goalsDone}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">all time</p>
        </div>
        <div className="card p-4">
          <div className="section-label">Streak</div>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-neutral-50">
            {stats.streak}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {stats.streak === 1 ? "week" : "weeks"} in a row
          </p>
        </div>
        <div className="card p-4">
          <div className="section-label">Feels like</div>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-neutral-50">
            {stats.level ? stats.level.now.toFixed(1) : "—"}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {!stats.level
              ? "rate your goals"
              : stats.level.direction === "easier"
                ? "easier than before"
                : stats.level.direction === "harder"
                  ? "harder than before"
                  : stats.level.direction === "steady"
                    ? "holding steady"
                    : "avg difficulty"}
          </p>
        </div>
      </div>

      {/* the week in focus */}
      <section className="card mt-5 overflow-hidden">
        <header className="flex items-center gap-2 border-b border-neutral-800 px-2 py-2.5 sm:px-3">
          <button
            onClick={() => {
              setWeek(shiftWeek(week, -1));
              setOpenId(null);
            }}
            className="rounded-full p-2 text-accent transition-opacity active:opacity-50"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 className="text-sm font-semibold text-neutral-100">
              KW {kw}
              {week === currentWeek && (
                <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                  this week
                </span>
              )}
            </h2>
            <p className="mt-0.5 truncate text-xs text-neutral-500">
              {range}
              {weekGoals.length > 0 && (
                <span className="ml-2 tabular-nums">
                  · {weekDone} of {weekGoals.length} done
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => {
              setWeek(shiftWeek(week, 1));
              setOpenId(null);
            }}
            className="rounded-full p-2 text-accent transition-opacity active:opacity-50"
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </header>

        <div>
          {/* the week's goals — independent of each other */}
          <ul className="list-group">
            {weekGoals.map((goal) => {
              const done = Boolean(goal.done_at);
              const open = openId === goal.id;
              return (
                <li key={goal.id}>
                  <div className="flex items-start gap-1 pr-1">
                    <button
                      onClick={() => (done ? reopenGoal(goal) : openGoal(goal))}
                      aria-label={done ? "Reopen goal" : "Close goal"}
                      className="flex h-11 w-11 shrink-0 items-center justify-center"
                    >
                      {/* The mark carries the outcome: filled for achieved,
                          half for partly, a cross for missed. */}
                      <span
                        className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] transition-colors ${
                          !done
                            ? "border-neutral-600 text-transparent"
                            : goal.outcome === "achieved"
                              ? "border-accent bg-accent text-white"
                              : goal.outcome === "partial"
                                ? "border-accent text-accent"
                                : "border-neutral-600 text-neutral-500"
                        }`}
                      >
                        {done && goal.outcome === "missed" ? (
                          <X className="h-4 w-4" strokeWidth={3} />
                        ) : done && goal.outcome === "partial" ? (
                          <span className="h-2 w-2 rounded-full bg-accent" />
                        ) : (
                          <Check className="h-4 w-4" strokeWidth={3} />
                        )}
                      </span>
                    </button>

                    <button
                      onClick={() => openGoal(goal)}
                      aria-expanded={open}
                      className="min-w-0 flex-1 py-2.5 text-left"
                    >
                      <span
                        className={`block text-sm leading-snug ${
                          done ? "text-neutral-400" : "text-neutral-100"
                        }`}
                      >
                        {goal.title}
                      </span>
                      {!open && done && (
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {goal.outcome && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                goal.outcome === "missed"
                                  ? "bg-neutral-800 text-neutral-400"
                                  : "bg-accent/15 text-accent"
                              }`}
                            >
                              {PARTNER_OUTCOME_LABEL[goal.outcome]}
                            </span>
                          )}
                          {goal.difficulty && (
                            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-300">
                              {goal.difficulty} ·{" "}
                              {PARTNER_DIFFICULTY_LABEL[goal.difficulty]}
                            </span>
                          )}
                          <span className="line-clamp-2 min-w-0 flex-1 whitespace-pre-line text-xs leading-relaxed text-neutral-500">
                            {goal.notes}
                          </span>
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => removeGoal(goal)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-neutral-600 transition-opacity active:opacity-50"
                      aria-label="Delete goal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {open && (
                    <div className="border-t border-neutral-800 bg-neutral-950/50 px-3 py-3.5 sm:px-4">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        aria-label="Goal"
                        className="field"
                      />

                      <div className="mt-4 section-label">How did it go?</div>
                      <div className="mt-1.5 flex gap-1.5">
                        {PARTNER_OUTCOMES.map((outcome) => {
                          const picks = PARTNER_OUTCOME_PICKS[outcome];
                          const active = editOutcome === outcome;
                          return (
                            <button
                              key={outcome}
                              type="button"
                              onClick={() => setEditOutcome(outcome)}
                              aria-pressed={active}
                              className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-colors ${
                                active
                                  ? "bg-accent text-white"
                                  : "bg-neutral-800 text-neutral-300"
                              }`}
                            >
                              <span className="text-sm font-semibold">
                                {PARTNER_OUTCOME_LABEL[outcome]}
                              </span>
                              <span
                                className={`text-[11px] tabular-nums ${
                                  active ? "text-white/75" : "text-neutral-500"
                                }`}
                              >
                                {picks > 0 ? `+${picks} ${picks === 1 ? "pick" : "picks"}` : "no pick"}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex items-baseline justify-between">
                        <span className="section-label">How hard did it feel?</span>
                        {editLevel !== null && (
                          <span className="text-xs font-medium text-neutral-300">
                            {PARTNER_DIFFICULTY_LABEL[editLevel]}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex gap-1.5">
                        {PARTNER_DIFFICULTIES.map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setEditLevel(level)}
                            aria-pressed={editLevel === level}
                            className={`h-11 flex-1 rounded-xl text-base font-semibold tabular-nums transition-colors ${
                              editLevel === level
                                ? "bg-accent text-white"
                                : "bg-neutral-800 text-neutral-300"
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={4}
                        aria-label="What happened?"
                        placeholder="What happened? What worked, what got in the way."
                        className="field mt-4 resize-y leading-relaxed"
                      />

                      <div className="mt-3 flex items-center gap-2">
                        {!done && !debriefReady && (
                          <p className="min-w-0 flex-1 text-xs text-neutral-500">
                            Pick an outcome, rate it and write a line.
                          </p>
                        )}
                        <button
                          onClick={() => setOpenId(null)}
                          className="ml-auto px-3 py-2 text-sm font-medium text-neutral-400 transition-opacity active:opacity-50"
                        >
                          Cancel
                        </button>
                        {done ? (
                          <button
                            onClick={() => saveGoal(goal)}
                            className="btn-primary"
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            onClick={() => closeGoal(goal)}
                            disabled={!debriefReady || busy}
                            className="btn-primary"
                          >
                            <Check className="h-4 w-4" strokeWidth={3} />
                            Close goal
                            {editOutcome &&
                              PARTNER_OUTCOME_PICKS[editOutcome] > 0 && (
                                <span className="font-normal text-white/75">
                                  +{PARTNER_OUTCOME_PICKS[editOutcome]}
                                </span>
                              )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {weekGoals.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-neutral-500">
                No goals for this week yet.
              </p>
              {canRepeat && (
                <button
                  onClick={repeatLastWeek}
                  disabled={busy}
                  className="btn-plain mt-3 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Repeat last week&apos;s goals
                </button>
              )}
            </div>
          )}

          <form
            onSubmit={addGoal}
            className="flex gap-2 border-t border-neutral-800 px-3 py-3 sm:px-4"
          >
            <input
              ref={addRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a goal for this week…"
              className="field min-w-0 flex-1"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="btn-primary shrink-0"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>
        </div>
      </section>

      <p className="mt-2 px-1 text-xs text-neutral-500">
        {weekGoals.length >= PARTNER_GOALS_SWEET_SPOT
          ? "Two or three a week is plenty — depth beats volume."
          : `Achieved pays ${PARTNER_OUTCOME_PICKS.achieved} picks, partly ${PARTNER_OUTCOME_PICKS.partial} — a week with nothing missed ${PICKS_FOR.partnerWeek} more.`}
      </p>

      {/* wrap-up: the one thing to carry forward */}
      {showWrapUp && (
        <div className={`card mt-5 p-4 ${weekClean ? "bg-accent/10" : ""}`}>
          <p className="text-sm font-semibold text-neutral-50">
            {weekClean
              ? `Week complete — all ${weekGoals.length} goals at least partly achieved.`
              : allDone
                ? `Week closed — ${weekGoals.filter((g) => g.outcome !== "missed").length} of ${weekGoals.length} achieved.`
                : `Week over — ${weekDone} of ${weekGoals.length} closed.`}
          </p>
          <label className="mt-2.5 block section-label">
            What&apos;s the one thing you take into next week?
            <textarea
              value={takeaway}
              onChange={(e) => setTakeaway(e.target.value)}
              onBlur={storeTakeaway}
              rows={2}
              placeholder="One sentence — the lesson, not the recap."
              className="field mt-1.5 resize-y leading-relaxed"
            />
          </label>
          {takeaway.trim() !== takeawaySaved && (
            <div className="mt-2 flex justify-end">
              <button onClick={storeTakeaway} className="btn-plain text-xs">
                Save takeaway
              </button>
            </div>
          )}
        </div>
      )}

      {/* the weeks so far */}
      {timeline.length > 0 && (
        <section className="mt-7 pb-8">
          <h3 className="section-label px-1">The weeks so far</h3>
          <ul className="card mt-1.5 list-group overflow-hidden">
            {timeline.map((entry) => {
              const label = weekOf(entry.key);
              const active = entry.key === week;
              const complete = entry.done === entry.goals.length;
              return (
                <li key={entry.key}>
                  <button
                    onClick={() => {
                      setWeek(entry.key);
                      setOpenId(null);
                      scrollAppToTop();
                    }}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-opacity active:opacity-60 ${
                      active ? "bg-neutral-800 text-neutral-50" : "text-neutral-300"
                    }`}
                  >
                    <span className="w-12 shrink-0 text-sm font-medium tabular-nums">
                      KW {label.kw}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {entry.goals.map((goal) => (
                        <span
                          key={goal.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            !goal.done_at
                              ? "bg-neutral-700"
                              : goal.outcome === "achieved"
                                ? "bg-accent"
                                : goal.outcome === "partial"
                                  ? "bg-accent/50"
                                  : "bg-neutral-600"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-neutral-600">
                      {takeawayOf.get(entry.key) ?? label.range}
                    </span>
                    {entry.level !== null && (
                      <span className="shrink-0 text-xs tabular-nums text-neutral-600">
                        {entry.level.toFixed(1)}
                      </span>
                    )}
                    <span
                      className={`w-8 shrink-0 text-right text-xs tabular-nums ${
                        complete ? "text-accent" : "text-neutral-500"
                      }`}
                    >
                      {entry.done}/{entry.goals.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Toast message={toast} />
      <RewardToast reward={reward} />
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
