import WeekCalendar from "@/components/calendar/WeekCalendar";
import SetupBanner from "@/components/SetupBanner";
import { getSupabase } from "@/lib/supabase";
import type { CalendarEvent, Category, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const sb = getSupabase();
  let events: CalendarEvent[] = [];
  let tasks: Task[] = [];
  let categories: Category[] = [];

  if (sb) {
    const [e, t, c] = await Promise.all([
      sb.from("events").select("*"),
      sb
        .from("tasks")
        .select("*")
        .eq("done", false)
        .order("created_at", { ascending: true }),
      sb.from("categories").select("*").order("name"),
    ]);
    events = e.data ?? [];
    tasks = t.data ?? [];
    categories = c.data ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      <WeekCalendar
        initialEvents={events}
        initialTasks={tasks}
        categories={categories}
      />
    </div>
  );
}
