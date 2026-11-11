"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Keyboard } from "lucide-react";
import Logo from "./Logo";
import PantryArt from "@/components/pantry/PantryArt";
import { SHORTCUT_HELP_EVENT } from "@/components/GlobalShortcuts";
import { NAV_TABS, PANTRY_ROUTE, isActiveRoute } from "@/lib/nav";

const tabClass = (active: boolean) =>
  `flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-accent/15 text-accent-bright"
      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
  }`;

/**
 * Desktop navigation: the tabs in a translucent top bar. Phones don't get this
 * bar at all — there the page runs full-screen and the same destinations sit in
 * the floating tab bar (`BottomNav`).
 */
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
  const pantryActive = isActiveRoute(pathname, PANTRY_ROUTE.href);

  return (
    // pt keeps the bar below the status bar when installed on an iPad (the page
    // draws under it via viewport-fit=cover).
    <header className="sticky top-0 z-40 hidden shrink-0 border-b border-neutral-800 bg-neutral-950/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl desk:block">
      <div className="flex h-14 items-center gap-6 px-5">
        <Link href="/calendar" className="flex shrink-0 items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-neutral-50">
            Caprese
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Primary">
          {NAV_TABS.map(({ href, label, Icon }) => {
            const active = isActiveRoute(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                {label}
              </Link>
            );
          })}

          {/* pantry deliberately sits on the far right, next to the tracker */}
          <Link
            href={PANTRY_ROUTE.href}
            aria-current={pantryActive ? "page" : undefined}
            className={`ml-auto ${tabClass(pantryActive)}`}
          >
            {PANTRY_ROUTE.label}
            {pantryPicks > 0 && (
              <span
                className="rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold tabular-nums leading-4 text-white"
                title={`${pantryPicks} ${pantryPicks === 1 ? "pick" : "picks"} to draw`}
              >
                {pantryPicks}
              </span>
            )}
          </Link>
        </nav>

        {/* caprese tracker: salads on the account */}
        <Link
          href={PANTRY_ROUTE.href}
          title={`${saladsReady} ${saladsReady === 1 ? "salad" : "salads"} ready to redeem`}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 py-1 pl-1 pr-2.5 transition-colors hover:bg-neutral-800"
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

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(SHORTCUT_HELP_EVENT))}
          className="icon-btn -ml-3 -mr-2"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
