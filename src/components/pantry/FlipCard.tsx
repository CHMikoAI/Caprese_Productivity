"use client";

import { Sparkles } from "lucide-react";
import Logo from "@/components/Logo";
import PantryArt from "@/components/pantry/PantryArt";
import { INGREDIENT_META, type Ingredient } from "@/lib/rewards";

const RARITY_STYLE: Record<
  (typeof INGREDIENT_META)[Ingredient]["rarity"],
  { face: string; label: string }
> = {
  common: { face: "border-neutral-700", label: "Common" },
  uncommon: {
    face: "border-[#86A34A]/70 shadow-[0_0_24px_rgba(134,163,74,0.22)]",
    label: "Uncommon",
  },
  rare: {
    face: "border-[#C7A93B] shadow-[0_0_32px_rgba(199,169,59,0.35)]",
    label: "Rare",
  },
};

/**
 * One drawn card: face down until tapped, then a 3D flip reveals the
 * ingredient. Purely presentational — the draw is already persisted.
 */
export default function FlipCard({
  ingredient,
  art,
  flipped,
  dealDelay,
  onFlip,
}: {
  ingredient: Ingredient;
  art: string;
  flipped: boolean;
  dealDelay: number;
  onFlip: () => void;
}) {
  const meta = INGREDIENT_META[ingredient];
  const rarity = RARITY_STYLE[meta.rarity];

  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={flipped}
      aria-label={flipped ? meta.label : "Flip the card"}
      className="group h-44 w-32 shrink-0 animate-card-deal [perspective:900px] focus:outline-none"
      style={{ animationDelay: `${dealDelay}ms` }}
    >
      <div
        className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped
            ? "[transform:rotateY(180deg)]"
            : "cursor-pointer group-hover:[transform:rotateY(16deg)_translateY(-6px)] group-focus-visible:[transform:rotateY(16deg)_translateY(-6px)]"
        }`}
      >
        {/* back */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.03)_10px,rgba(255,255,255,0.03)_20px)] shadow-lg [backface-visibility:hidden]">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-700/80 bg-neutral-950/60">
            <Logo className="h-8 w-8" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-500">
            Caprese
          </span>
        </div>

        {/* front */}
        <div
          className={`absolute inset-0 flex flex-col overflow-hidden rounded-2xl border bg-neutral-900 p-2 [backface-visibility:hidden] [transform:rotateY(180deg)] ${rarity.face}`}
        >
          {meta.rarity === "rare" && (
            <span className="pointer-events-none absolute inset-y-0 w-16 animate-shine bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          )}
          <div className="aspect-square w-full overflow-hidden rounded-xl bg-[#F6F1E7] p-1.5">
            <PantryArt
              src={art}
              alt={meta.label}
              size={112}
              className="h-full w-full object-contain"
            />
          </div>
          <p className="mt-1.5 flex items-center justify-center gap-1 text-sm font-semibold text-neutral-100">
            {meta.rarity === "rare" && (
              <Sparkles className="h-3.5 w-3.5 text-[#C7A93B]" />
            )}
            {meta.label}
          </p>
          <p className="pb-0.5 text-center text-[10px] text-neutral-500">
            {rarity.label} · {meta.rate} %
          </p>
        </div>
      </div>
    </button>
  );
}
