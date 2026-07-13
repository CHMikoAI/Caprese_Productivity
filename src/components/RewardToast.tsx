"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

export type Reward = { picks: number; note?: string };

export function useRewardToast() {
  const [reward, setReward] = useState<Reward | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showReward = useCallback((picks: number, note?: string) => {
    if (picks <= 0) return;
    setReward({ picks, note });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setReward(null), 6000);
  }, []);

  return { reward, showReward };
}

/** Bottom-right celebration shown when picks are earned; links to the pantry. */
export default function RewardToast({ reward }: { reward: Reward | null }) {
  if (!reward) return null;
  return (
    <Link
      href="/pantry"
      className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] animate-toast-in items-center gap-3 rounded-2xl border border-neutral-700 bg-neutral-900 py-3 pl-3 pr-4 shadow-2xl transition-colors hover:border-neutral-500"
    >
      {/* tiny stack of face-down cards */}
      <span className="relative h-12 w-10 shrink-0">
        <span className="absolute inset-0 -rotate-6 rounded-lg border border-neutral-700 bg-neutral-800" />
        <span className="absolute inset-0 flex rotate-3 items-center justify-center rounded-lg border border-neutral-600 bg-neutral-800">
          <Logo className="h-5 w-5" />
        </span>
      </span>
      <span>
        <span className="block text-sm font-semibold text-neutral-50">
          +{reward.picks} {reward.picks === 1 ? "pick" : "picks"} earned
        </span>
        <span className="block text-xs text-neutral-400">
          {reward.note ?? "Flip your cards in the Pantry"} →
        </span>
      </span>
    </Link>
  );
}
