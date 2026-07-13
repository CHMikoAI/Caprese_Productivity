"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  PICKS_FOR,
  streakMilestoneDates,
  type Ingredient,
  type Salad,
} from "@/lib/rewards";
import type {
  Category,
  Entry,
  EntryStatus,
  EntryType,
  JournalEntry,
  Pillar,
} from "@/lib/types";

function db() {
  const sb = getSupabase();
  if (!sb) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }
  return sb;
}

function refreshPlanning() {
  revalidatePath("/calendar");
  revalidatePath("/planner");
}

// ---------- rewards ----------

type GrantRow = {
  source: "journal" | "task" | "goal" | "journal_streak";
  source_key: string;
  picks: number;
};

/**
 * Insert grants into the picks ledger. Duplicates (same source + key) are
 * silently ignored, so awards are idempotent — re-completing a reopened task
 * or re-saving a journal day never pays twice. Returns the picks that were
 * actually awarded now. Rewards are a bonus on top of the primary mutation:
 * a ledger failure is logged, never surfaced as an action error.
 */
async function grantPicks(rows: GrantRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const { data, error } = await db()
      .from("reward_grants")
      .upsert(rows, { onConflict: "source,source_key", ignoreDuplicates: true })
      .select();
    if (error) throw new Error(error.message);
    const awarded = (data ?? []).reduce((sum, row) => sum + row.picks, 0);
    // The picks badge lives in the app layout — refresh everything under it.
    if (awarded > 0) revalidatePath("/", "layout");
    return awarded;
  } catch (err) {
    console.error("Could not grant picks:", err);
    return 0;
  }
}

// ---------- categories ----------

export async function createCategory(
  name: string,
  color: string,
): Promise<Category> {
  const { data, error } = await db()
    .from("categories")
    .insert({ name, color })
    .select()
    .single();
  if (error) throw new Error(error.message);
  refreshPlanning();
  return data;
}

export async function updateCategory(
  id: string,
  patch: { name?: string; color?: string },
): Promise<void> {
  const { error } = await db().from("categories").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await db().from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

// ---------- entries (task / event / goal) ----------

export type EntryInput = {
  type: EntryType;
  title: string;
  categoryId: string | null;
  startAt: string | null;
  endAt: string | null;
  description: string | null;
};

export async function createEntry(input: EntryInput): Promise<Entry> {
  const { data, error } = await db()
    .from("entries")
    .insert({
      type: input.type,
      title: input.title,
      category_id: input.categoryId,
      start_at: input.startAt,
      end_at: input.endAt,
      description: input.description ? sanitizeHtml(input.description) : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  refreshPlanning();
  return data;
}

export async function updateEntry(
  id: string,
  patch: Partial<{
    type: EntryType;
    title: string;
    category_id: string | null;
    start_at: string | null;
    end_at: string | null;
    description: string | null;
    status: EntryStatus;
  }>,
): Promise<void> {
  const clean = { ...patch };
  if (typeof clean.description === "string") {
    clean.description = sanitizeHtml(clean.description);
  }
  const { error } = await db().from("entries").update(clean).eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

export async function setEntryStatus(
  id: string,
  status: EntryStatus,
): Promise<{ picksAwarded: number }> {
  const { data, error } = await db()
    .from("entries")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  refreshPlanning();

  const entry: Entry = data;
  let picksAwarded = 0;
  if (entry.type === "task" && status === "done") {
    picksAwarded = await grantPicks([
      { source: "task", source_key: entry.id, picks: PICKS_FOR.task },
    ]);
  } else if (entry.type === "goal" && status === "achieved") {
    picksAwarded = await grantPicks([
      { source: "goal", source_key: entry.id, picks: PICKS_FOR.goal },
    ]);
  }
  return { picksAwarded };
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await db().from("entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

/** Drop an unscheduled task/goal onto the calendar: give it a time. */
export async function scheduleEntry(
  id: string,
  startAt: string,
  endAt: string,
): Promise<void> {
  const { error } = await db()
    .from("entries")
    .update({ start_at: startAt, end_at: endAt })
    .eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

/**
 * Push a task's slot to a future date (keeping its time-of-day and duration),
 * so an overdue item becomes upcoming again. Also re-activates it.
 */
export async function postponeEntry(id: string, startAt: string, endAt: string) {
  const { error } = await db()
    .from("entries")
    .update({ start_at: startAt, end_at: endAt, status: "active" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

// ---------- journal ----------

export async function saveJournalEntry(
  entryDate: string,
  pillar: Pillar,
  content: string,
): Promise<{
  entry: JournalEntry;
  picksAwarded: number;
  streakBonus: number;
}> {
  const sb = db();
  const { data, error } = await sb
    .from("journal_entries")
    .upsert(
      { entry_date: entryDate, pillar, content },
      { onConflict: "entry_date" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/journal");

  // One pick per journalled day (editing a day pays nothing extra), plus the
  // streak bonus for every full 10 consecutive days of the run this entry
  // belongs to.
  const picksAwarded = await grantPicks([
    { source: "journal", source_key: entryDate, picks: PICKS_FOR.journal },
  ]);

  let streakBonus = 0;
  const { data: days } = await sb.from("journal_entries").select("entry_date");
  if (days) {
    const dates = new Set<string>(days.map((d) => d.entry_date));
    streakBonus = await grantPicks(
      streakMilestoneDates(dates, entryDate).map((milestone) => ({
        source: "journal_streak" as const,
        source_key: milestone,
        picks: PICKS_FOR.journalStreak,
      })),
    );
  }

  return { entry: data, picksAwarded: picksAwarded + streakBonus, streakBonus };
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { error } = await db().from("journal_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/journal");
}

// ---------- pantry ----------

/**
 * Spend picks on cards. The `draw_cards` Postgres function rolls each card
 * independently (tomato 50 %, basil 20 %, oil 20 %, mozzarella 10 %), checks
 * the balance and inserts the draws in one transaction.
 */
export async function drawCards(count: number): Promise<Ingredient[]> {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Invalid draw count.");
  }
  const { data, error } = await db().rpc("draw_cards", { draw_count: count });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return (data ?? []) as Ingredient[];
}

/** Craft one caprese salad; the recipe check and spend happen atomically. */
export async function craftSalad(): Promise<Salad> {
  const sb = db();
  const { data: saladId, error } = await sb.rpc("craft_caprese_salad");
  if (error) throw new Error(error.message);
  const { data, error: fetchError } = await sb
    .from("salads")
    .select("*")
    .eq("id", saladId)
    .single();
  if (fetchError) throw new Error(fetchError.message);
  revalidatePath("/", "layout");
  return data;
}

/** Cash in a salad for a private treat; the note records what it was. */
export async function redeemSalad(
  id: string,
  note: string | null,
): Promise<void> {
  const { error } = await db()
    .from("salads")
    .update({
      redeemed_at: new Date().toISOString(),
      reward_note: note?.trim() || null,
    })
    .eq("id", id)
    .is("redeemed_at", null);
  if (error) throw new Error(error.message);
  // The salad tracker lives in the app layout, so refresh everything under it.
  revalidatePath("/", "layout");
}
