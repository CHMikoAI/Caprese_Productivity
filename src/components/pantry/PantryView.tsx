"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Check,
  CheckCircle2,
  Gift,
  Layers,
  Trophy,
  X,
} from "lucide-react";
import { craftSalad, drawCards, redeemSalad } from "@/app/actions";
import FlipCard from "@/components/pantry/FlipCard";
import PantryArt from "@/components/pantry/PantryArt";
import Toast, { useToast } from "@/components/Toast";
import { useEscape, useShortcuts } from "@/lib/useShortcuts";
import { formatDMY } from "@/lib/dates";
import {
  canCraft,
  INGREDIENT_META,
  INGREDIENTS,
  PICKS_FOR,
  SALAD_RECIPE,
  STREAK_MILESTONE,
  type Ingredient,
  type Inventory,
  type Salad,
} from "@/lib/rewards";

type ArtMap = Record<Ingredient | "salad", string>;

type TableCard = { id: string; ingredient: Ingredient; flipped: boolean };

const panelClass = "rounded-2xl border border-neutral-800 bg-neutral-900/50";

export default function PantryView({
  initialPicks,
  initialInventory,
  initialSalads,
  art,
}: {
  initialPicks: number;
  initialInventory: Inventory;
  initialSalads: Salad[];
  art: ArtMap;
}) {
  const router = useRouter();
  const { message: toast, show: showError } = useToast();

  const [picks, setPicks] = useState(initialPicks);
  const [inventory, setInventory] = useState(initialInventory);
  const [salads, setSalads] = useState(initialSalads);
  const [table, setTable] = useState<TableCard[]>([]);
  const [busyDraw, setBusyDraw] = useState(false);
  const [busyCraft, setBusyCraft] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  // Re-adopt server state whenever a fresh payload arrives (router.refresh).
  const [syncedPicks, setSyncedPicks] = useState(initialPicks);
  if (syncedPicks !== initialPicks) {
    setSyncedPicks(initialPicks);
    setPicks(initialPicks);
  }
  const [syncedSalads, setSyncedSalads] = useState(initialSalads);
  if (syncedSalads !== initialSalads) {
    setSyncedSalads(initialSalads);
    setSalads(initialSalads);
  }
  // Server truth includes cards that are still face-down on the table; keep
  // those hidden from the tiles until they are flipped.
  const [syncedInventory, setSyncedInventory] = useState(initialInventory);
  if (syncedInventory !== initialInventory) {
    setSyncedInventory(initialInventory);
    const next = { ...initialInventory };
    for (const card of table) {
      if (!card.flipped) {
        next[card.ingredient] = Math.max(0, next[card.ingredient] - 1);
      }
    }
    setInventory(next);
  }

  const unflipped = useMemo(() => table.filter((c) => !c.flipped).length, [table]);

  useShortcuts({
    d: () => {
      if (picks > 0) draw(1);
    },
  });
  const craftable = canCraft(inventory);
  const readySalads = useMemo(
    () => salads.filter((s) => !s.redeemed_at),
    [salads],
  );
  const redeemedSalads = useMemo(
    () => salads.filter((s) => s.redeemed_at),
    [salads],
  );

  // ----- actions -----

  async function draw(count: number) {
    if (busyDraw || count < 1 || unflipped > 0) return;
    setBusyDraw(true);
    try {
      const ingredients = await drawCards(count);
      setPicks((p) => Math.max(0, p - ingredients.length));
      setTable(
        ingredients.map((ingredient) => ({
          id: crypto.randomUUID(),
          ingredient,
          flipped: false,
        })),
      );
    } catch {
      showError("Could not draw cards.");
    }
    setBusyDraw(false);
  }

  function flip(id: string) {
    const card = table.find((c) => c.id === id);
    if (!card || card.flipped) return;
    const next = table.map((c) => (c.id === id ? { ...c, flipped: true } : c));
    setTable(next);
    setInventory((inv) => ({
      ...inv,
      [card.ingredient]: inv[card.ingredient] + 1,
    }));
    // Once everything is revealed, pull fresh server state (badge included).
    if (next.every((c) => c.flipped)) {
      window.setTimeout(() => router.refresh(), 700);
    }
  }

  async function craft() {
    if (!craftable || busyCraft) return;
    setBusyCraft(true);
    try {
      const salad = await craftSalad();
      setInventory((inv) => {
        const next = { ...inv };
        for (const ing of INGREDIENTS) next[ing] -= SALAD_RECIPE[ing];
        return next;
      });
      setSalads((list) => [salad, ...list]);
      setCelebrating(true);
      window.setTimeout(() => setCelebrating(false), 1600);
      router.refresh();
    } catch {
      showError("Could not craft the salad.");
    }
    setBusyCraft(false);
  }

  async function redeem(note: string) {
    const target = [...readySalads].sort((a, b) =>
      a.created_at < b.created_at ? -1 : 1,
    )[0];
    if (!target) return;
    setRedeeming(false);
    const prev = salads;
    setSalads((list) =>
      list.map((s) =>
        s.id === target.id
          ? {
              ...s,
              redeemed_at: new Date().toISOString(),
              reward_note: note.trim() || null,
            }
          : s,
      ),
    );
    try {
      await redeemSalad(target.id, note);
      router.refresh();
    } catch {
      setSalads(prev);
      showError("Could not redeem the salad.");
    }
  }

  // ----- render -----

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
          Pantry
        </h1>
        <span className="flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-200">
          <Layers className="h-3.5 w-3.5 text-accent" />
          <span key={picks} className="inline-block animate-count-pulse font-semibold">
            {picks}
          </span>
          {picks === 1 ? "pick" : "picks"}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Earn picks, flip cards, collect ingredients — five tomatoes, two basil,
        two olive oil and one mozzarella make a caprese salad to treat yourself.
      </p>

      {/* ---- draw area ---- */}
      <section className={`mt-6 ${panelClass} p-5`}>
        {table.length === 0 ? (
          picks > 0 ? (
            <div className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:justify-center sm:gap-8">
              {/* deck */}
              <div className="relative h-44 w-32">
                <div className="absolute inset-0 -rotate-6 rounded-2xl border border-neutral-800 bg-neutral-900" />
                <div className="absolute inset-0 rotate-3 rounded-2xl border border-neutral-800 bg-neutral-900" />
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.03)_10px,rgba(255,255,255,0.03)_20px)]">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-700/80 bg-neutral-950/60">
                    <PantryArt src={art.tomato} alt="" size={36} />
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 sm:items-start">
                <p className="text-sm text-neutral-300">
                  {picks === 1 ? "One card is" : `${picks} cards are`} waiting
                  for you.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => draw(1)}
                    disabled={busyDraw}
                    title="Draw (D)"
                    className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Draw 1 card
                  </button>
                  {picks > 1 && (
                    <button
                      onClick={() => draw(picks)}
                      disabled={busyDraw}
                      className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-40"
                    >
                      Draw all {picks}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-neutral-400">
                No picks right now — go earn some.
              </p>
            </div>
          )
        ) : (
          <div>
            <p className="text-sm text-neutral-300">
              {unflipped > 0
                ? `Tap a card to flip it — ${unflipped} left.`
                : "All revealed and added to your pantry."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 sm:justify-start">
              {table.map((card, i) => (
                <FlipCard
                  key={card.id}
                  ingredient={card.ingredient}
                  art={art[card.ingredient]}
                  flipped={card.flipped}
                  dealDelay={i * 90}
                  onFlip={() => flip(card.id)}
                />
              ))}
            </div>
            {unflipped === 0 && picks > 0 && (
              <button
                onClick={() => setTable([])}
                className="mt-4 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                Back to the deck ({picks} {picks === 1 ? "pick" : "picks"} left)
              </button>
            )}
          </div>
        )}

        {/* how to earn */}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-neutral-800/80 pt-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <BookOpenText className="h-3.5 w-3.5" />
            Journal entry +{PICKS_FOR.journal}
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Task done +{PICKS_FOR.task}
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" />
            Goal achieved +{PICKS_FOR.goal}
          </span>
          <span className="flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" />
            {STREAK_MILESTONE}-day journal streak +{PICKS_FOR.journalStreak}
          </span>
        </div>
      </section>

      {/* ---- inventory + craft ---- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Ingredients
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {INGREDIENTS.map((ing) => {
              const have = inventory[ing];
              const need = SALAD_RECIPE[ing];
              const pct = Math.min(100, (have / need) * 100);
              return (
                <div key={ing} className={`${panelClass} p-4`}>
                  {/* aspect-square keeps the art frame (and the image inside)
                      a true square no matter how wide the grid cell gets */}
                  <div className="mx-auto aspect-square w-full max-w-28 rounded-xl bg-[#F6F1E7] p-2">
                    <PantryArt
                      src={art[ing]}
                      alt={INGREDIENT_META[ing].label}
                      size={112}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <p className="mt-3 flex items-baseline gap-1.5">
                    <span
                      key={have}
                      className="inline-block animate-count-pulse text-xl font-semibold text-neutral-100"
                    >
                      {have}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {INGREDIENT_META[ing].label}
                    </span>
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${have >= need ? "bg-[#86A34A]" : "bg-accent/70"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-600">
                    {Math.min(have, need)} / {need} for a salad
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Craft
          </h2>
          <div className={`relative mt-2 overflow-hidden ${panelClass} p-5`}>
            {celebrating && <ConfettiBurst />}
            <div className="flex items-center gap-4">
              <div
                className={`h-20 w-20 shrink-0 rounded-xl bg-[#F6F1E7] p-1.5 ${celebrating ? "animate-pop-in" : ""}`}
              >
                <PantryArt
                  src={art.salad}
                  alt="Caprese salad"
                  size={80}
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-100">
                  Caprese salad
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {INGREDIENTS.map((ing) => {
                    const met = inventory[ing] >= SALAD_RECIPE[ing];
                    return (
                      <span
                        key={ing}
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                          met
                            ? "border-[#86A34A]/60 text-[#A9C46F]"
                            : "border-neutral-700 text-neutral-500"
                        }`}
                      >
                        {met && <Check className="h-3 w-3" />}
                        {SALAD_RECIPE[ing]}× {INGREDIENT_META[ing].label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <button
              onClick={craft}
              disabled={!craftable || busyCraft}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busyCraft ? "Crafting…" : "Craft salad"}
            </button>
          </div>
        </section>
      </div>

      {/* ---- salads ---- */}
      <section className="mt-8 pb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Salads
          <span className="ml-2 font-normal text-neutral-600">
            {readySalads.length} ready
          </span>
        </h2>

        {readySalads.length === 0 && redeemedSalads.length === 0 && (
          <p className="mt-2 rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-600">
            No salads yet. Collect ingredients and craft your first one.
          </p>
        )}

        {readySalads.length > 0 && (
          <div className={`mt-2 flex flex-wrap items-center gap-4 ${panelClass} p-5`}>
            <div className="flex items-center">
              {readySalads.slice(0, 4).map((s, i) => (
                <div
                  key={s.id}
                  className={`h-14 w-14 overflow-hidden rounded-full border-2 border-neutral-900 bg-[#F6F1E7] p-1 ${i > 0 ? "-ml-4" : ""} ${i === 0 ? "animate-pop-in" : ""}`}
                >
                  <PantryArt
                    src={art.salad}
                    alt="Caprese salad"
                    size={56}
                    className="h-full w-full object-contain"
                  />
                </div>
              ))}
              {readySalads.length > 4 && (
                <span className="-ml-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-neutral-900 bg-neutral-800 text-xs font-medium text-neutral-300">
                  +{readySalads.length - 4}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-200">
                {readySalads.length === 1
                  ? "One salad ready — treat yourself to something."
                  : `${readySalads.length} salads ready — treat yourself to something.`}
              </p>
            </div>
            <button
              onClick={() => setRedeeming(true)}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Gift className="h-4 w-4" />
              Redeem one
            </button>
          </div>
        )}

        {redeemedSalads.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {redeemedSalads.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-900/70"
              >
                <PantryArt src={art.salad} alt="" size={24} className="opacity-60" />
                <span className="w-24 shrink-0 text-xs">
                  {s.redeemed_at ? formatDMY(new Date(s.redeemed_at)) : ""}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {s.reward_note || "Redeemed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {redeeming && (
        <RedeemModal onConfirm={redeem} onClose={() => setRedeeming(false)} />
      )}

      <Toast message={toast} />
    </div>
  );
}

function RedeemModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-100">
            Redeem a salad
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          One salad, one private treat. What are you claiming?
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. movie night, a fancy coffee, new book…"
          rows={2}
          autoFocus
          className="mt-3 w-full resize-none rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Redeem
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small CSS-only confetti burst used when a salad is crafted. */
function ConfettiBurst() {
  const colors = ["#E63946", "#86A34A", "#C7A93B", "#F6F1E7"];
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {Array.from({ length: 16 }).map((_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        const dist = 70 + (i % 4) * 26;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-2 w-2 animate-confetti rounded-[2px]"
            style={
              {
                backgroundColor: colors[i % colors.length],
                "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
                "--dy": `${Math.round(Math.sin(angle) * dist - 40)}px`,
                animationDelay: `${(i % 5) * 45}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
