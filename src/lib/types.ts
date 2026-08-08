export type Category = {
  id: string;
  name: string;
  color: string;
};

export const ENTRY_TYPES = ["event", "task", "todo", "goal"] as const;
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

/** A task, event, todo or goal — they share the same shape. */
export type Entry = {
  id: string;
  type: EntryType;
  title: string;
  category_id: string | null;
  start_at: string | null; // ISO; null = unscheduled (task/goal) or a todo
  end_at: string | null; // for a todo: the optional deadline
  all_day: boolean; // date-only entry (no time-of-day)
  description: string | null; // sanitized HTML
  status: EntryStatus;
  created_at: string;
};

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  task: "Task",
  event: "Event",
  todo: "To do",
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

// A weekly goal on the Partner track ("find a life partner"). Goals are
// independent of each other and belong to exactly one week via `week_start`
// (that week's Monday, local time). A goal can only be closed together with
// its debrief: `difficulty` (how hard it felt) and `notes` (what worked, what
// got in the way) — the database enforces that pairing.
export type PartnerGoal = {
  id: string;
  week_start: string; // yyyy-mm-dd, always a Monday
  title: string;
  notes: string | null;
  difficulty: number | null; // 1-5, required to close the goal
  done_at: string | null; // null = still open
  position: number; // order within the week
  created_at: string;
};

/** The one thing carried forward from a finished week. */
export type PartnerWeek = {
  week_start: string;
  takeaway: string | null;
  updated_at: string;
};

/** Beyond this many goals a week the UI nudges towards focus (no hard cap). */
export const PARTNER_GOALS_SWEET_SPOT = 3;

/** How hard a goal felt. Low numbers are what you want — it got easier. */
export const PARTNER_DIFFICULTIES = [1, 2, 3, 4, 5] as const;

export const PARTNER_DIFFICULTY_LABEL: Record<number, string> = {
  1: "Easy",
  2: "Ok",
  3: "Tough",
  4: "Hard",
  5: "Very hard",
};

/** A debrief needs at least this many characters to close a goal. */
export const PARTNER_NOTE_MIN = 3;

// A captured thought — a voice note (transcribed) or typed text. It lives in the
// "Open" inbox until triaged; triaging tags it to a project (for filtering) or
// just marks it done. A thought never leaves the full list once captured.
export const THOUGHT_SOURCES = ["voice", "text"] as const;
export type ThoughtSource = (typeof THOUGHT_SOURCES)[number];

export type Thought = {
  id: string;
  content: string; // rich text stored as sanitized HTML
  source: ThoughtSource; // how it was captured — no longer surfaced in the UI
  linked_project_id: string | null; // -> categories.id; presence = "sorted"
  triaged: boolean; // kept in sync with having a project
  archived_at: string | null; // set once completed (moved to the archive)
  created_at: string;
  updated_at: string; // bumps only on content edits
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
