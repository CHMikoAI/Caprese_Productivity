"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { SHEET_OPEN_EVENT } from "@/components/Sheet";

export type Reward = { picks: number; note?: string };

export function useRewardToast() {
  const [reward, setReward] = useState<Reward | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showReward = useCallback((picks: number, note?: string) => {
    if (picks <= 0) return;
    setReward({ picks, note });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setReward(null), 5000);
  }, []);

  useEffect(() => {
    // Like any toast, it steps aside the moment a sheet opens over the page.
    const dismiss = () => {
      window.clearTimeout(timer.current);
      setReward(null);
    };
    window.addEventListener(SHEET_OPEN_EVENT, dismiss);
    return () => {
      window.removeEventListener(SHEET_OPEN_EVENT, dismiss);
      window.clearTimeout(timer.current);
    };
  }, []);

  return { reward, showReward };
}

/**
 * Celebration shown when picks are earned; links to the pantry. It drops in
 * from the top — under the status bar on a phone, under the top bar's Pantry
 * link on desktop — so it never sits on a toast (an "Undo", say), which lives
 * at the bottom and often appears in the very same moment.
 */
export default function RewardToast({ reward }: { reward: Reward | null }) {
  if (!reward) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[60] flex justify-center px-4 desk:top-[calc(env(safe-area-inset-top)+4.25rem)] desk:justify-end desk:px-5">
      <Link
        href="/pantry"
        role="status"
        className="pointer-events-auto flex max-w-full animate-banner-in items-center gap-3 rounded-2xl bg-neutral-800 py-3 pl-3 pr-4 shadow-2xl ring-1 ring-white/10 transition-opacity active:opacity-70"
      >
        {/* tiny stack of face-down cards */}
        <span className="relative h-12 w-10 shrink-0">
          <span className="absolute inset-0 -rotate-6 rounded-lg bg-neutral-700" />
          <span className="absolute inset-0 flex rotate-3 items-center justify-center rounded-lg bg-neutral-600">
            <Logo className="h-5 w-5" />
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-neutral-50">
            +{reward.picks} {reward.picks === 1 ? "pick" : "picks"} earned
          </span>
          <span className="block truncate text-xs text-neutral-400">
            {reward.note ?? "Flip your cards in the Pantry"} →
          </span>
        </span>
      </Link>
    </div>
  );
}
