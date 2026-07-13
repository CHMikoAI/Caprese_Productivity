import SetupBanner from "@/components/SetupBanner";
import PlannerView from "@/components/planner/PlannerView";
import { getSupabase } from "@/lib/supabase";
import type { Category, Entry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const sb = getSupabase();
  let entries: Entry[] = [];
  let categories: Category[] = [];

  if (sb) {
    const [e, c] = await Promise.all([
      // All types — the planner can show upcoming events too (toggle).
      sb.from("entries").select("*").order("created_at", { ascending: false }),
      sb.from("categories").select("*").order("name"),
    ]);
    entries = e.data ?? [];
    categories = c.data ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      <PlannerView initialEntries={entries} initialCategories={categories} />
    </div>
  );
}
