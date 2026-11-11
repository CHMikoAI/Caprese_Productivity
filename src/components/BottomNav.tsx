"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PantryArt from "@/components/pantry/PantryArt";
import { NAV_TABS, PANTRY_ROUTE, isActiveRoute } from "@/lib/nav";
import { scrollAppToTop } from "@/lib/scroll";

/** Fired when the tab that is already open is tapped again. */
export const TAB_RESELECT_EVENT = "caprese:tab-reselect";

/**
 * Phone-only primary navigation: a glass pill that floats over the page, the
 * way current iOS apps do it. The page runs full-screen underneath — content
 * scrolls behind the bar and fades out under it — and every scroller keeps
 * `--tabbar-space` free at its end so the last row can always be brought clear
 * (see globals.css).
 *
 * It is positioned inside the app shell, not against the viewport: the document
 * never scrolls, so the bar cannot ride along with mobile Safari's toolbar.
 * Shown on every phone viewport, portrait and landscape (the `phone` variant);
 * real desktops carry the tabs in the top bar instead.
 *
 * Pantry closes the row with the salad tracker as its icon — the salads ready
 * to redeem, as before — and the picks waiting to be drawn as a red badge.
 */
export default function BottomNav({
  pantryPicks = 0,
  saladsReady = 0,
  saladArt = "/pantry/salad.svg",
}: {
  pantryPicks?: number;
  saladsReady?: number;
  saladArt?: string;
}) {
  const pathname = usePathname();
  const hrefs = [...NAV_TABS.map((tab) => tab.href), PANTRY_ROUTE.href];
  const activeIndex = hrefs.findIndex((href) => isActiveRoute(pathname, href));

  // Tapping the tab you are on takes you back to the top (the calendar jumps
  // to today) — the iOS convention.
  function onTabClick(e: React.MouseEvent, href: string, active: boolean) {
    if (!active) return;
    e.preventDefault();
    scrollAppToTop();
    window.dispatchEvent(new CustomEvent(TAB_RESELECT_EVENT, { detail: href }));
  }

  const tabClass = (active: boolean) =>
    `relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-full text-[10px] font-medium leading-none transition-[color,transform] duration-200 active:scale-90 ${
      active ? "text-accent-bright" : "text-neutral-400"
    }`;

  const pantryActive = isActiveRoute(pathname, PANTRY_ROUTE.href);
  const pantryLabel = [
    PANTRY_ROUTE.label,
    pantryPicks > 0
      ? `${pantryPicks} ${pantryPicks === 1 ? "pick" : "picks"} to draw`
      : null,
    saladsReady > 0
      ? `${saladsReady} ${saladsReady === 1 ? "salad" : "salads"} ready`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <nav
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 hidden phone:block"
      aria-label="Primary"
    >
      {/* Content fades out under the bar instead of colliding with it. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[calc(var(--tabbar-space)+1.5rem)] bg-linear-to-t from-black from-40% to-transparent"
        aria-hidden
      />
      <div className="relative mx-auto max-w-md px-3 pb-[var(--tabbar-bottom)]">
        <div className="glass pointer-events-auto relative flex h-[var(--tabbar-h)] items-stretch rounded-full p-1 shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
          {/* the selection: one capsule that slides to the open tab */}
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 rounded-full bg-white/10 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{
              width: `calc((100% - 0.5rem) / ${hrefs.length})`,
              transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
              opacity: activeIndex < 0 ? 0 : 1,
            }}
          />

          {NAV_TABS.map(({ href, label, Icon }) => {
            const active = isActiveRoute(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => onTabClick(e, href, active)}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                <Icon
                  className="h-6 w-6"
                  strokeWidth={active ? 2.2 : 1.8}
                  aria-hidden
                />
                <span className="max-w-full truncate px-0.5">{label}</span>
              </Link>
            );
          })}

          <Link
            href={PANTRY_ROUTE.href}
            onClick={(e) => onTabClick(e, PANTRY_ROUTE.href, pantryActive)}
            aria-current={pantryActive ? "page" : undefined}
            aria-label={pantryLabel}
            className={tabClass(pantryActive)}
          >
            {/* The tracker as it always looked — salad and count in one small
                pill — with the picks as the badge on its corner. */}
            <span className="relative flex h-6 items-center">
              <span className="flex h-6 items-center gap-1 rounded-full bg-white/10 pl-0.5 pr-[7px]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F6F1E7]">
                  <PantryArt
                    src={saladArt}
                    alt=""
                    size={18}
                    className="h-[18px] w-[18px] object-contain"
                  />
                </span>
                <span className="text-xs font-semibold tabular-nums leading-none text-neutral-100">
                  {saladsReady > 99 ? "99+" : saladsReady}
                </span>
              </span>
              {pantryPicks > 0 && (
                <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums leading-none text-white ring-2 ring-neutral-900">
                  {pantryPicks > 99 ? "99+" : pantryPicks}
                </span>
              )}
            </span>
            <span className="max-w-full truncate px-0.5" aria-hidden>
              {PANTRY_ROUTE.label}
            </span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
