import { addDays, toDateKey, fromDateKey } from "@/lib/dates";

export const INGREDIENTS = ["tomato", "basil", "oil", "mozzarella"] as const;
export type Ingredient = (typeof INGREDIENTS)[number];

/**
 * Display metadata for the card pool. `rate` mirrors the draw weights in the
 * `draw_cards` Postgres function (supabase/schema.sql) — the server rolls,
 * this is only shown in the UI. Rates are per card, not per set.
 */
export const INGREDIENT_META: Record<
  Ingredient,
  { label: string; rate: number; rarity: "common" | "uncommon" | "rare" }
> = {
  tomato: { label: "Tomato", rate: 50, rarity: "common" },
  basil: { label: "Basil", rate: 20, rarity: "uncommon" },
  oil: { label: "Olive oil", rate: 20, rarity: "uncommon" },
  mozzarella: { label: "Mozzarella", rate: 10, rarity: "rare" },
};

/** One caprese salad. Keep in sync with `craft_caprese_salad` in schema.sql. */
export const SALAD_RECIPE: Record<Ingredient, number> = {
  tomato: 5,
  basil: 2,
  oil: 2,
  mozzarella: 1,
};

/** Picks awarded per action. */
export const PICKS_FOR = {
  journal: 1,
  task: 2,
  goal: 3,
  journalStreak: 2,
} as const;

/** A streak bonus is paid every this many consecutive journal days. */
export const STREAK_MILESTONE = 10;

export type Salad = {
  id: string;
  created_at: string;
  redeemed_at: string | null;
  reward_note: string | null;
};

export type Inventory = Record<Ingredient, number>;

export const EMPTY_INVENTORY: Inventory = {
  tomato: 0,
  basil: 0,
  oil: 0,
  mozzarella: 0,
};

export function countInventory(ingredients: Ingredient[]): Inventory {
  const inv = { ...EMPTY_INVENTORY };
  for (const ing of ingredients) inv[ing] += 1;
  return inv;
}

export function canCraft(inventory: Inventory): boolean {
  return INGREDIENTS.every((ing) => inventory[ing] >= SALAD_RECIPE[ing]);
}

/**
 * Streak-bonus milestones of the consecutive journal run containing
 * `savedDate`: one date key per full STREAK_MILESTONE days, counted from the
 * start of the run. Returned for the whole run (not just the saved day) so
 * back-filling a gap still pays the milestones the merged run has earned —
 * the unique (source, source_key) constraint dedupes anything already paid.
 */
export function streakMilestoneDates(
  journalDates: Set<string>,
  savedDate: string,
): string[] {
  if (!journalDates.has(savedDate)) return [];

  let start = fromDateKey(savedDate);
  while (journalDates.has(toDateKey(addDays(start, -1)))) {
    start = addDays(start, -1);
  }
  let length = 0;
  while (journalDates.has(toDateKey(addDays(start, length)))) {
    length += 1;
  }

  const milestones: string[] = [];
  for (let day = STREAK_MILESTONE; day <= length; day += STREAK_MILESTONE) {
    milestones.push(toDateKey(addDays(start, day - 1)));
  }
  return milestones;
}
