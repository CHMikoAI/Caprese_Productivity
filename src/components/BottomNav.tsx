"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookText, CalendarDays, FolderKanban, Lightbulb } from "lucide-react";

const TABS = [
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/planner", label: "Planner", Icon: FolderKanban },
  { href: "/thoughts", label: "Thoughts", Icon: Lightbulb },
  { href: "/journal", label: "Journal", Icon: BookText },
] as const;

/**
 * Phone-only primary navigation: a thumb-reachable bottom tab bar with big
 * icon+label targets. Fixed to the viewport bottom so it's always flush against
 * the screen edge (`AppLayout` reserves matching bottom padding on `main`).
 * Shown on every phone viewport — portrait *and* landscape (see the `phone`
 * variant in globals.css); only real desktops move the tabs to the top bar.
 * Pantry lives off the bottom bar on phones — it's reached via the salad icon
 * in the top bar instead.
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-neutral-800/80 bg-neutral-950/95 backdrop-blur phone:block"
      // Sit the icons right down at the bottom: reserve well under the full
      // home-indicator inset so there's only a slim clearance below the labels
      // (~10px on iPhone), not the full ~34px "dead" strip iOS reserves.
      style={{
        paddingBottom: "max(0.25rem, calc(env(safe-area-inset-bottom) - 1.5rem))",
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
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-none transition-colors ${
                active
                  ? "text-accent"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <span className="relative">
                <Icon
                  className="h-7 w-7"
                  strokeWidth={active ? 2.4 : 2}
                  aria-hidden
                />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
