export type Category = {
  id: string;
  name: string;
  color: string;
};

export type Task = {
  id: string;
  title: string;
  category_id: string | null;
  done: boolean;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  category_id: string | null;
  task_id: string | null;
};

export const PILLARS = ["freedom", "health", "relationship"] as const;
export type Pillar = (typeof PILLARS)[number];

export type JournalEntry = {
  id: string;
  entry_date: string; // yyyy-mm-dd
  pillar: Pillar;
  content: string;
};

// Muted palette for categories — the only vivid color in the app stays the
// tomato accent (#E63946).
export const CATEGORY_COLORS = [
  "#8E9196", // gray
  "#6E7F98", // slate blue
  "#7C8B6F", // sage
  "#A67C7C", // dusty rose
  "#98867C", // taupe
  "#7C9891", // sea
  "#8B7C98", // mauve
  "#B08968", // ochre
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[0];
