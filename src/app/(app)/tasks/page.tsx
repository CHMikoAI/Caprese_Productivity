import SetupBanner from "@/components/SetupBanner";
import TasksView from "@/components/tasks/TasksView";
import { getSupabase } from "@/lib/supabase";
import type { CalendarEvent, Category, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const sb = getSupabase();
  let tasks: Task[] = [];
  let categories: Category[] = [];
  let events: CalendarEvent[] = [];

  if (sb) {
    const [t, c, e] = await Promise.all([
      sb.from("tasks").select("*").order("created_at", { ascending: false }),
      sb.from("categories").select("*").order("name"),
      sb.from("events").select("*").not("task_id", "is", null),
    ]);
    tasks = t.data ?? [];
    categories = c.data ?? [];
    events = e.data ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      <TasksView
        initialTasks={tasks}
        initialCategories={categories}
        taskEvents={events}
      />
    </div>
  );
}
