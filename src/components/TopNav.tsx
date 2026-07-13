"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import PantryArt from "@/components/pantry/PantryArt";

const TABS = [
  { href: "/calendar", label: "Calendar" },
  { href: "/planner", label: "Planner" },
  { href: "/journal", label: "Journal" },
];

const tabClass = (active: boolean) =>
  active
    ? "flex items-center rounded-lg bg-neutral-800/70 px-1.5 py-1.5 font-medium text-neutral-50 sm:px-3"
    : "flex items-center rounded-lg px-1.5 py-1.5 text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200 sm:px-3";

export default function TopNav({
  pantryPicks = 0,
  saladsReady = 0,
  saladArt = "/pantry/salad.svg",
}: {
  pantryPicks?: number;
  saladsReady?: number;
  saladArt?: string;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-neutral-950/85 backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-8 sm:px-6">
        <Link href="/calendar" className="flex shrink-0 items-center gap-2.5">
          <Logo className="h-9 w-9" />
          {/* wordmark is a luxury the phone header can't afford */}
          <span className="hidden text-2xl font-bold tracking-tight text-neutral-50 sm:block">
            Caprese
          </span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-xs sm:gap-1 sm:text-sm">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={tabClass(pathname.startsWith(tab.href))}
            >
              {tab.label}
            </Link>
          ))}

          {/* pantry deliberately sits on the far right, next to the tracker */}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <Link href="/pantry" className={tabClass(pathname.startsWith("/pantry"))}>
              Pantry
              {pantryPicks > 0 && (
                <span className="ml-1 rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold leading-4 text-white sm:ml-1.5">
                  {pantryPicks}
                </span>
              )}
            </Link>
            {/* caprese tracker: salads on the account */}
            <Link
              href="/pantry"
              title={`${saladsReady} ${saladsReady === 1 ? "salad" : "salads"} ready to redeem`}
              className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/60 py-1 pl-1 pr-2 transition-colors hover:border-neutral-600 sm:gap-1.5 sm:pr-2.5"
            >
              <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[#F6F1E7] sm:h-7 sm:w-7">
                <PantryArt
                  src={saladArt}
                  alt="Caprese salad"
                  size={24}
                  className="h-5 w-5 object-contain sm:h-6 sm:w-6"
                />
              </span>
              <span className="text-xs font-semibold tabular-nums text-neutral-100 sm:text-sm">
                {saladsReady}
              </span>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
