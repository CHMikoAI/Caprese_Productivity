"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookText, CalendarDays, FolderKanban, Heart, Lightbulb } from "lucide-react";

const TABS = [
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/planner", label: "Planner", Icon: FolderKanban },
  { href: "/thoughts", label: "Thoughts", Icon: Lightbulb },
  { href: "/journal", label: "Journal", Icon: BookText },
  { href: "/partner", label: "Partner", Icon: Heart },
] as const;

/**
 * Phone-only primary navigation: a thumb-reachable tab bar in the iOS mould —
 * a hairline on top, big icons with a small label, tinted with the accent when
 * selected. It is the last row of the app shell (not floating), so it holds the
 * same height on every page. Shown on every phone viewport — portrait *and*
 * landscape (see the `phone` variant in globals.css); only real desktops move
 * the tabs to the top bar. Pantry lives off the bottom bar on phones — it's
 * reached via the salad icon in the top bar instead.
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="hidden shrink-0 border-t border-neutral-800 bg-neutral-950 phone:block phone:pt-2"
      // Even air around the icons: a little under the hairline, and a clearance
      // below the labels that stays well under the full home-indicator inset
      // (~14px on iPhone) instead of the ~34px "dead" strip iOS reserves.
      style={{
        paddingBottom: "max(0.5rem, calc(env(safe-area-inset-bottom) - 1.25rem))",
      }}
      aria-label="Primary"
    >
      <div className="flex h-11 items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-none transition-colors ${
                active ? "text-accent" : "text-neutral-500"
              }`}
            >
              <Icon
                className="h-7 w-7"
                strokeWidth={active ? 2.3 : 1.9}
                aria-hidden
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
