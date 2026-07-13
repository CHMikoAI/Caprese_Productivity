import { withMinutes } from "@/lib/dates";
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
  return {
    type: entry.type,
    title: entry.title,
    categoryId: entry.category_id,
    scheduled: entry.start_at != null,
    start: entry.start_at
      ? new Date(entry.start_at)
      : withMinutes(new Date(), 9 * 60),
    durationMin: durationOf(entry),
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
    description: "",
  };
}
