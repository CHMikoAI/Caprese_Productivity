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
      {/* The shell is a fixed-height flex column (see globals.css): `main`
          scrolls, the bottom tab bar sits in normal flow beneath it. In an iOS
          PWA that pins the bar to the true screen bottom — `position: fixed`
          there leaves a black gap the height of a phantom Safari toolbar. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
      <BottomNav pantryPicks={picks} />
      <GlobalShortcuts />
    </>
  );
}
