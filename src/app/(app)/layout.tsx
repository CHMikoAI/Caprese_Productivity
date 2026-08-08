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
    <>
      <TopNav
        pantryPicks={picks}
        saladsReady={saladsReady}
        saladArt={artSources().salad}
      />
      {/* The bottom tab bar is `position: fixed` at the viewport bottom — that
          pins it to the true screen edge in an iOS PWA and its background fills
          the home-indicator zone (no dead black strip). Reserve its height
          (3.5rem incl. the padding above the icons) plus that inset so content
          isn't hidden behind it. */}
      <main className="flex min-h-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] desk:pb-0">
        {children}
      </main>
      <BottomNav />
      <CaptureFab />
      <GlobalShortcuts />
    </>
  );
}
