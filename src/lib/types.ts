export type Category = {
  id: string;
  name: string;
  color: string;
};

export const ENTRY_TYPES = ["event", "task", "goal"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

// Stored lifecycle status. `active` is the live state; the rest are terminal
// resolutions. Events never leave `active` (they're not tracked — just past or
// future). Tasks resolve to done/cancelled, goals to achieved/missed.
export const ENTRY_STATUSES = [
  "active",
  "done",
  "cancelled",
  "achieved",
  "missed",
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** A task, event or goal — they share the same shape. */
export type Entry = {
  id: string;
  type: EntryType;
  title: string;
  category_id: string | null;
  start_at: string | null; // ISO; null = unscheduled (task/goal only)
  end_at: string | null;
  description: string | null; // sanitized HTML
  status: EntryStatus;
  created_at: string;
};

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  task: "Task",
  event: "Event",
  goal: "Goal",
};

export const PILLARS = ["freedom", "health", "relationship"] as const;
export type Pillar = (typeof PILLARS)[number];

export type JournalEntry = {
  id: string;
  entry_date: string; // yyyy-mm-dd
  pillar: Pillar;
  content: string;
};

// 12 project colors — muted, modern jewel tones (not neon). Mostly spread
// around the hue wheel, but brown and grey are deliberately desaturated
// outliers rather than just another hue step: they read as clearly distinct
// at a glance instead of blurring into their neighbours. They double as the
// tint of the matching calendar blocks, so they stay easy on the eye on dark.
export const CATEGORY_COLORS = [
  "#D1615A", // dusty red
  "#D98E4A", // warm orange
  "#8B6A4F", // brown
  "#C7A93B", // gold
  "#86A34A", // olive green
  "#4F9E6D", // sage green
  "#3F9C93", // teal
  "#4A85C7", // dusty blue
  "#6F6FCB", // periwinkle
  "#9C6BC9", // muted purple
  "#C15FA0", // dusty magenta
  "#82868E", // slate grey
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[7]; // dusty blue
