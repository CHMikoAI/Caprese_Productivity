import ClientOnly from "@/components/ClientOnly";
import SetupBanner from "@/components/SetupBanner";
import PlannerView from "@/components/planner/PlannerView";
import { ListSkeleton } from "@/components/Skeleton";
import { PARTNER_ARCHIVED } from "@/lib/features";
import { getSupabase } from "@/lib/supabase";
import type { Category, Entry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const sb = getSupabase();
  let entries: Entry[] = [];
  let categories: Category[] = [];
  let partnerGoals = 0;

  if (sb) {
    const [e, c, p] = await Promise.all([
      // All types — the planner can show upcoming events too (toggle).
      sb.from("entries").select("*").order("created_at", { ascending: false }),
      sb.from("categories").select("*").order("name"),
      // The archived Partner track is reached from the planner's archive; the
      // count decides whether there is anything to link to.
      PARTNER_ARCHIVED
        ? sb.from("partner_goals").select("*", { count: "exact", head: true })
        : null,
    ]);
    entries = e.data ?? [];
    categories = c.data ?? [];
    partnerGoals = p?.count ?? 0;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      <ClientOnly fallback={<ListSkeleton wide />}>
        <PlannerView
          initialEntries={entries}
          initialCategories={categories}
          archivedPartnerGoals={partnerGoals}
        />
      </ClientOnly>
    </div>
  );
}
