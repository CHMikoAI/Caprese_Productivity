// Server-only: resolves artwork paths with an fs check per request.
import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { INGREDIENTS, type Ingredient } from "@/lib/rewards";

export type PantryArtMap = Record<Ingredient | "salad", string>;

/**
 * Prefer the hand-made PNG illustrations (public/pantry/<name>.png) when they
 * exist, fall back to the bundled SVGs. Checked per request, so dropping the
 * PNGs in later works without a rebuild.
 */
export function artSources(): PantryArtMap {
  const dir = path.join(process.cwd(), "public", "pantry");
  const sources = {} as PantryArtMap;
  for (const name of [...INGREDIENTS, "salad"] as const) {
    sources[name] = existsSync(path.join(dir, `${name}.png`))
      ? `/pantry/${name}.png`
      : `/pantry/${name}.svg`;
  }
  return sources;
}
