"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookText, CalendarDays, FolderKanban } from "lucide-react";
import Logo from "./Logo";
import PantryArt from "@/components/pantry/PantryArt";

const TABS = [
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/planner", label: "Planner", Icon: FolderKanban },
  { href: "/journal", label: "Journal", Icon: BookText },
];

const tabClass = (active: boolean) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 font-medium transition-colors ${
    active
      ? "bg-neutral-800/70 text-neutral-50"
      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
  }`;

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
    // pt keeps the bar below the iOS status bar when installed to the home
    // screen (the page draws under it via viewport-fit=cover).
    <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-neutral-950/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-8 sm:px-6">
        <Link href="/calendar" className="flex shrink-0 items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="text-xl font-bold tracking-tight text-neutral-50 sm:text-2xl">
            Caprese
          </span>
        </Link>

        {/* Primary tabs live here on desktop; on phones they move to the bottom
            tab bar, so this nav is hidden below `sm`. */}
        <nav className="hidden min-w-0 flex-1 items-center gap-1 text-sm sm:flex">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href} className={tabClass(active)}>
                <tab.Icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </Link>
            );
          })}

          {/* pantry deliberately sits on the far right, next to the tracker */}
          <Link
            href="/pantry"
            className={`ml-auto ${tabClass(pathname.startsWith("/pantry"))}`}
          >
            Pantry
            {pantryPicks > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold leading-4 text-white">
                {pantryPicks}
              </span>
            )}
          </Link>
        </nav>

        {/* caprese tracker: salads on the account — kept visible on every screen */}
        <Link
          href="/pantry"
          title={`${saladsReady} ${saladsReady === 1 ? "salad" : "salads"} ready to redeem`}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 py-1 pl-1 pr-2.5 transition-colors hover:border-neutral-600 sm:ml-0"
        >
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#F6F1E7]">
            <PantryArt
              src={saladArt}
              alt="Caprese salad"
              size={24}
              className="h-6 w-6 object-contain"
            />
          </span>
          <span className="text-sm font-semibold tabular-nums text-neutral-100">
            {saladsReady}
          </span>
        </Link>
      </div>
    </header>
  );
}
