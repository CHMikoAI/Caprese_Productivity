import PantryView from "@/components/pantry/PantryView";
import SetupBanner from "@/components/SetupBanner";
import { artSources } from "@/lib/pantryArt";
import { getSupabase } from "@/lib/supabase";
import {
  countInventory,
  EMPTY_INVENTORY,
  type Ingredient,
  type Inventory,
  type Salad,
} from "@/lib/rewards";

export const dynamic = "force-dynamic";

export default async function PantryPage() {
  const sb = getSupabase();
  let picks = 0;
  let inventory: Inventory = EMPTY_INVENTORY;
  let salads: Salad[] = [];

  if (sb) {
    const [p, draws, s] = await Promise.all([
      sb.rpc("picks_available"),
      sb.from("card_draws").select("ingredient").is("salad_id", null),
      sb.from("salads").select("*").order("created_at", { ascending: false }),
    ]);
    picks = typeof p.data === "number" ? p.data : 0;
    inventory = countInventory(
      (draws.data ?? []).map((d) => d.ingredient as Ingredient),
    );
    salads = s.data ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      <PantryView
        initialPicks={picks}
        initialInventory={inventory}
        initialSalads={salads}
        art={artSources()}
      />
    </div>
  );
}
