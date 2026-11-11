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
  const saladArt = artSources().salad;

  return (
    // A fixed shell: the document itself never scrolls, only `main` does. That
    // is what keeps the navigation planted — mobile Safari slides anything tied
    // to a scrolling document around with its own toolbar.
    //
    // Desktop: top bar, then the scroll area. Phone: no bar at all — the page
    // runs from the status bar to the bottom edge and the tab bar floats over
    // it (`BottomNav` is positioned against this shell, hence `relative`).
    <div className="relative flex h-full flex-col">
      <TopNav pantryPicks={picks} saladsReady={saladsReady} saladArt={saladArt} />
      {/* Installed on a phone the page draws under the status bar; this strip
          keeps scrolling content from running through the clock. */}
      <div
        className="hidden h-[env(safe-area-inset-top)] shrink-0 bg-neutral-950 phone:block"
        aria-hidden
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {children}
      </main>
      <BottomNav pantryPicks={picks} saladsReady={saladsReady} saladArt={saladArt} />
      <GlobalShortcuts />
    </div>
  );
}
