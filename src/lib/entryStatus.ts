import type { Entry, EntryStatus, EntryType } from "@/lib/types";

/** Effective lifecycle phase used for grouping & display. */
export type Phase =
  | "unplanned" // active task/goal without a date — waiting to be planned
  | "upcoming" // dated task/goal whose time hasn't passed yet
  | "open" // active task/goal whose time has passed — needs a review decision
  | "done"
  | "cancelled"
  | "achieved"
  | "missed"
  | "event-upcoming"
  | "event-past";

export function isResolved(status: EntryStatus): boolean {
  return status !== "active";
}

/** Compute the phase of an entry relative to `now`. */
export function phaseOf(entry: Entry, now: Date): Phase {
  if (entry.type === "event") {
    const end = entry.end_at ? new Date(entry.end_at) : null;
    return end && end.getTime() <= now.getTime() ? "event-past" : "event-upcoming";
  }
  if (entry.status !== "active") return entry.status as Phase;
  if (!entry.start_at) return "unplanned";
  if (entry.end_at && new Date(entry.end_at).getTime() > now.getTime()) {
    return "upcoming";
  }
  return "open";
}

/** True for a block that should read as finished (dimmed / struck through). */
export function isFinished(entry: Entry, now: Date): boolean {
  const p = phaseOf(entry, now);
  return (
    p !== "unplanned" && p !== "upcoming" && p !== "open" && p !== "event-upcoming"
  );
}

/** Resolutions offered on an OPEN item, per type. Todos resolve like tasks. */
export const RESOLUTIONS: Record<
  Exclude<EntryType, "event">,
  { status: EntryStatus; label: string }[]
> = {
  task: [
    { status: "done", label: "Done" },
    { status: "cancelled", label: "Cancel" },
  ],
  todo: [
    { status: "done", label: "Done" },
    { status: "cancelled", label: "Cancel" },
  ],
  goal: [
    { status: "achieved", label: "Achieved" },
    { status: "missed", label: "Not achieved" },
  ],
};

export const STATUS_LABEL: Record<EntryStatus, string> = {
  active: "Active",
  done: "Done",
  cancelled: "Cancelled",
  achieved: "Achieved",
  missed: "Not achieved",
};
