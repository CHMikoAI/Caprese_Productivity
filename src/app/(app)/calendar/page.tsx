import WeekCalendar from "@/components/calendar/WeekCalendar";
import SetupBanner from "@/components/SetupBanner";
import { getSupabase } from "@/lib/supabase";
import type { Category, Entry, JournalEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const sb = getSupabase();
  let entries: Entry[] = [];
  let categories: Category[] = [];
  let journalEntries: JournalEntry[] = [];

  if (sb) {
    const [e, c, j] = await Promise.all([
      sb.from("entries").select("*"),
      sb.from("categories").select("*").order("name"),
      sb.from("journal_entries").select("*"),
    ]);
    entries = e.data ?? [];
    categories = c.data ?? [];
    journalEntries = j.data ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      <WeekCalendar
        initialEntries={entries}
        categories={categories}
        journalEntries={journalEntries}
      />
    </div>
  );
}
