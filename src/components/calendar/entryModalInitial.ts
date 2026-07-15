import { startOfDay, withMinutes } from "@/lib/dates";
import type { Entry, EntryType } from "@/lib/types";
import type { EntryModalInitial } from "./EntryModal";

function durationOf(entry: Entry): number {
  if (!entry.start_at || !entry.end_at) return 60;
  return Math.max(
    15,
    Math.round(
      (new Date(entry.end_at).getTime() - new Date(entry.start_at).getTime()) /
        60_000,
    ),
  );
}

export function editInitial(entry: Entry): EntryModalInitial {
  const isTodo = entry.type === "todo";
  return {
    type: entry.type,
    title: entry.title,
    categoryId: entry.category_id,
    scheduled: !isTodo && entry.start_at != null,
    start: entry.start_at
      ? new Date(entry.start_at)
      : withMinutes(new Date(), 9 * 60),
    durationMin: durationOf(entry),
    allDay: entry.all_day,
    // A todo's deadline is stored as end_at at the next midnight; recover the
    // date it falls on.
    deadline:
      isTodo && entry.end_at
        ? startOfDay(new Date(new Date(entry.end_at).getTime() - 1))
        : null,
    description: entry.description ?? "",
  };
}

export function createInitial(
  type: EntryType,
  start: Date,
  scheduled: boolean,
  durationMin = 60,
): EntryModalInitial {
  return {
    type,
    title: "",
    categoryId: null,
    scheduled,
    start,
    durationMin,
    allDay: type === "goal", // goals are date-only by default
    deadline: null,
    description: "",
  };
}
