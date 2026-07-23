import BottomNav from "@/components/BottomNav";
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
    <>
      <TopNav
        pantryPicks={picks}
        saladsReady={saladsReady}
        saladArt={artSources().salad}
      />
      {/* On phones the bottom tab bar is fixed, so reserve room for it (plus the
          home-indicator inset). Desktop navigates from the top bar — no reserve. */}
      <main className="flex min-h-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
        {children}
      </main>
      <BottomNav pantryPicks={picks} />
      <GlobalShortcuts />
    </>
  );
}
