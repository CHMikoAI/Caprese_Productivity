import ClientOnly from "@/components/ClientOnly";
import JournalView from "@/components/journal/JournalView";
import SetupBanner from "@/components/SetupBanner";
import { PageSkeleton } from "@/components/Skeleton";
import { getSupabase } from "@/lib/supabase";
import type { JournalEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const sb = getSupabase();
  let entries: JournalEntry[] = [];

  if (sb) {
    const { data } = await sb
      .from("journal_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(730);
    entries = data ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      <ClientOnly fallback={<PageSkeleton />}>
        <JournalView initialEntries={entries} />
      </ClientOnly>
    </div>
  );
}
