import ClientOnly from "@/components/ClientOnly";
import PartnerArchive from "@/components/partner/PartnerArchive";
import PartnerView from "@/components/partner/PartnerView";
import SetupBanner from "@/components/SetupBanner";
import { PageSkeleton } from "@/components/Skeleton";
import { PARTNER_ARCHIVED } from "@/lib/features";
import { getSupabase } from "@/lib/supabase";
import type { PartnerGoal, PartnerWeek } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PartnerPage() {
  const sb = getSupabase();
  let goals: PartnerGoal[] = [];
  let weeks: PartnerWeek[] = [];

  if (sb) {
    // Two or three steps a week — a couple of years still fits in one request,
    // and the whole history powers the stats and the timeline client-side.
    const [goalsRes, weeksRes] = await Promise.all([
      sb
        .from("partner_goals")
        .select("*")
        .order("week_start", { ascending: false })
        .order("position")
        .limit(600),
      sb
        .from("partner_weeks")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(200),
    ]);
    goals = goalsRes.data ?? [];
    weeks = weeksRes.data ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      {PARTNER_ARCHIVED ? (
        // Archived: the record, read-only (see lib/features.ts).
        <PartnerArchive goals={goals} weeks={weeks} />
      ) : (
        <ClientOnly fallback={<PageSkeleton />}>
          <PartnerView initialGoals={goals} initialWeeks={weeks} />
        </ClientOnly>
      )}
    </div>
  );
}
