import BottomNav from "@/components/BottomNav";
import CaptureFab from "@/components/thoughts/CaptureFab";
import GlobalShortcuts from "@/components/GlobalShortcuts";
import TopNav from "@/components/TopNav";
import { artSources } from "@/lib/pantryArt";
import { getSupabase } from "@/lib/supabase";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Unspent picks + redeemable salads for the nav. Best effort — the nav
  // must render even when Supabase is not configured yet.
  let picks = 0;
  let saladsReady = 0;
  const sb = getSupabase();
  if (sb) {
    const [picksRes, saladsRes] = await Promise.all([
      sb.rpc("picks_available"),
      sb
        .from("salads")
        .select("*", { count: "exact", head: true })
        .is("redeemed_at", null),
    ]);
    if (typeof picksRes.data === "number") picks = picksRes.data;
    saladsReady = saladsRes.count ?? 0;
  }

  return (
    // A fixed shell: bar, scroll area, bar. Only `main` scrolls, so the tab bar
    // is part of the layout rather than floating at the viewport bottom — it
    // sits at exactly the same height on every page, and mobile Safari never
    // slides it around with its own toolbar.
    <div className="flex h-full flex-col">
      <TopNav
        pantryPicks={picks}
        saladsReady={saladsReady}
        saladArt={artSources().salad}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {children}
      </main>
      <BottomNav />
      <CaptureFab />
      <GlobalShortcuts />
    </div>
  );
}
