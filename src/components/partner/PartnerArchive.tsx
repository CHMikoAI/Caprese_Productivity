import Link from "next/link";
import { Archive, Check, ChevronLeft, X } from "lucide-react";
import { addDays, fromDateKey, isoWeek, weekRangeLabel } from "@/lib/dates";
import {
  PARTNER_DIFFICULTY_LABEL,
  PARTNER_OUTCOME_LABEL,
  type PartnerGoal,
  type PartnerWeek,
} from "@/lib/types";

/**
 * The Partner track, archived: every week that was tracked, its goals and
 * their debriefs, read-only. Nothing here can be added, closed or changed —
 * it is the record, kept. (`PartnerView` is the live version; it comes back by
 * flipping `PARTNER_ARCHIVED` in `lib/features.ts`.)
 *
 * A Server Component on purpose: week keys are plain dates, so nothing depends
 * on the viewer's time zone and the page ships no JavaScript of its own.
 */
export default function PartnerArchive({
  goals,
  weeks,
}: {
  goals: PartnerGoal[];
  weeks: PartnerWeek[];
}) {
  const byWeek = new Map<string, PartnerGoal[]>();
  for (const goal of goals) {
    const list = byWeek.get(goal.week_start);
    if (list) list.push(goal);
    else byWeek.set(goal.week_start, [goal]);
  }
  for (const list of byWeek.values()) {
    list.sort(
      (a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1),
    );
  }
  const weekKeys = [...byWeek.keys()].sort((a, b) => (a < b ? 1 : -1));
  const takeaways = new Map(
    weeks.filter((w) => w.takeaway).map((w) => [w.week_start, w.takeaway as string]),
  );

  const closed = goals.filter((g) => g.done_at);
  const achieved = closed.filter((g) => g.outcome !== "missed").length;
  const rated = closed.filter((g) => g.difficulty);
  const feltLike =
    rated.length > 0
      ? rated.reduce((sum, g) => sum + (g.difficulty as number), 0) / rated.length
      : null;

  const stats: { label: string; value: string; sub: string }[] = [
    { label: "Weeks", value: String(weekKeys.length), sub: "tracked" },
    { label: "Goals", value: String(goals.length), sub: `${closed.length} closed` },
    { label: "Achieved", value: String(achieved), sub: "at least partly" },
    {
      label: "Felt like",
      value: feltLike === null ? "—" : feltLike.toFixed(1),
      sub: "avg difficulty",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 pt-5 pb-page sm:px-6 sm:pt-6">
      <Link
        href="/planner"
        className="-ml-1.5 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 text-sm font-medium text-accent-bright transition-opacity active:opacity-50"
      >
        <ChevronLeft className="h-4 w-4" />
        Planner
      </Link>

      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <h1 className="title-lg">Partner</h1>
        <span className="flex items-center gap-1.5 rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300">
          <Archive className="h-3.5 w-3.5" />
          Archived
        </span>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-neutral-500">
        This track is archived. Your goals and what you wrote about them are
        kept here to look back on — nothing can be added or changed.
      </p>

      {goals.length === 0 ? (
        <p className="card mt-6 px-4 py-10 text-center text-sm text-neutral-500">
          No goals were tracked here.
        </p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="card p-4">
                <div className="section-label">{stat.label}</div>
                <p className="mt-1.5 text-xl font-semibold tabular-nums text-neutral-50">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-6">
            {weekKeys.map((key) => {
              const list = byWeek.get(key) ?? [];
              const start = fromDateKey(key);
              const done = list.filter((g) => g.done_at).length;
              const takeaway = takeaways.get(key);
              return (
                <section key={key}>
                  <h2 className="section-label flex items-baseline gap-2 px-1">
                    {/* The Thursday of a week decides its ISO week number. */}
                    <span className="text-neutral-300">
                      KW {isoWeek(addDays(start, 3))}
                    </span>
                    <span>{weekRangeLabel(start)}</span>
                    <span className="ml-auto tabular-nums">
                      {done} of {list.length} closed
                    </span>
                  </h2>
                  <ul className="card mt-1.5 list-group overflow-hidden">
                    {list.map((goal) => (
                      <GoalRow key={goal.id} goal={goal} />
                    ))}
                  </ul>
                  {takeaway && (
                    <p className="mt-2 px-1 text-sm leading-relaxed text-neutral-400">
                      <span className="section-label mr-2">Takeaway</span>
                      {takeaway}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function GoalRow({ goal }: { goal: PartnerGoal }) {
  const done = Boolean(goal.done_at);
  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      {/* Same marks as the live tab: filled for achieved, half for partly, a
          cross for missed, an empty ring for a goal that was never closed. */}
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          !done
            ? "border-neutral-700"
            : goal.outcome === "achieved"
              ? "border-accent bg-accent text-white"
              : goal.outcome === "partial"
                ? "border-accent text-accent"
                : "border-neutral-600 text-neutral-500"
        }`}
        aria-hidden
      >
        {done && goal.outcome === "missed" ? (
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        ) : done && goal.outcome === "partial" ? (
          <span className="h-2 w-2 rounded-full bg-accent" />
        ) : done ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-snug ${
            done ? "text-neutral-100" : "text-neutral-400"
          }`}
        >
          {goal.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {done && goal.outcome ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                goal.outcome === "missed"
                  ? "bg-neutral-800 text-neutral-400"
                  : "bg-accent/15 text-accent-bright"
              }`}
            >
              {PARTNER_OUTCOME_LABEL[goal.outcome]}
            </span>
          ) : (
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
              Left open
            </span>
          )}
          {done && goal.difficulty && (
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-300">
              {goal.difficulty} · {PARTNER_DIFFICULTY_LABEL[goal.difficulty]}
            </span>
          )}
        </div>
        {goal.notes && (
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-400">
            {goal.notes}
          </p>
        )}
      </div>
    </li>
  );
}
