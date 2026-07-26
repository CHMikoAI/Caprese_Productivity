import SetupBanner from "@/components/SetupBanner";
import ThoughtsView from "@/components/thoughts/ThoughtsView";
import { getSupabase } from "@/lib/supabase";
import type { Category, Thought } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ThoughtsPage() {
  const sb = getSupabase();
  let thoughts: Thought[] = [];
  let categories: Category[] = [];

  if (sb) {
    const [t, c] = await Promise.all([
      sb.from("thoughts").select("*").order("created_at", { ascending: false }),
      sb.from("categories").select("*").order("name"),
    ]);
    thoughts = t.data ?? [];
    categories = c.data ?? [];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!sb && <SetupBanner />}
      <ThoughtsView initialThoughts={thoughts} categories={categories} />
    </div>
  );
}
