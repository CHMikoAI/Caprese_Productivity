"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import type {
  CalendarEvent,
  Category,
  JournalEntry,
  Pillar,
  Task,
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
  revalidatePath("/tasks");
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

// ---------- tasks ----------

export async function createTask(
  title: string,
  categoryId: string | null,
): Promise<Task> {
  const { data, error } = await db()
    .from("tasks")
    .insert({ title, category_id: categoryId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  refreshPlanning();
  return data;
}

export async function updateTask(
  id: string,
  patch: { title?: string; category_id?: string | null; done?: boolean },
): Promise<void> {
  const { error } = await db().from("tasks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await db().from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

// ---------- events ----------

export async function createEvent(input: {
  title: string;
  startAt: string;
  endAt: string;
  categoryId: string | null;
}): Promise<CalendarEvent> {
  const { data, error } = await db()
    .from("events")
    .insert({
      title: input.title,
      start_at: input.startAt,
      end_at: input.endAt,
      category_id: input.categoryId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  refreshPlanning();
  return data;
}

export async function updateEvent(
  id: string,
  patch: {
    title?: string;
    category_id?: string | null;
    start_at?: string;
    end_at?: string;
  },
): Promise<void> {
  const { error } = await db().from("events").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await db().from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refreshPlanning();
}

/** Drop an open task onto the calendar: creates a linked event. */
export async function scheduleTask(
  taskId: string,
  startAt: string,
  endAt: string,
): Promise<CalendarEvent> {
  const sb = db();
  const { data: task, error: taskError } = await sb
    .from("tasks")
    .select()
    .eq("id", taskId)
    .single();
  if (taskError) throw new Error(taskError.message);
  const { data, error } = await sb
    .from("events")
    .insert({
      title: task.title,
      start_at: startAt,
      end_at: endAt,
      category_id: task.category_id,
      task_id: taskId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  refreshPlanning();
  return data;
}

// ---------- journal ----------

export async function saveJournalEntry(
  entryDate: string,
  pillar: Pillar,
  content: string,
): Promise<JournalEntry> {
  const { data, error } = await db()
    .from("journal_entries")
    .upsert(
      { entry_date: entryDate, pillar, content },
      { onConflict: "entry_date" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/journal");
  return data;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { error } = await db().from("journal_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/journal");
}
