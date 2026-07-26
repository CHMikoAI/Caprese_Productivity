"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookText, CalendarDays, FolderKanban, Salad } from "lucide-react";

const TABS = [
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/planner", label: "Planner", Icon: FolderKanban },
  { href: "/journal", label: "Journal", Icon: BookText },
  { href: "/pantry", label: "Pantry", Icon: Salad },
] as const;

/**
 * Phone-only primary navigation: a thumb-reachable bottom tab bar with big
 * icon+label targets. Fixed to the viewport bottom so it's always flush against
 * the screen edge (`AppLayout` reserves matching bottom padding on `main`).
 * Desktop keeps the tabs in the top bar, so this is hidden from `sm` up.
 */
export default function BottomNav({
  pantryPicks = 0,
}: {
  pantryPicks?: number;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800/80 bg-neutral-950/95 backdrop-blur sm:hidden"
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
                {href === "/pantry" && pantryPicks > 0 && (
                  <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {pantryPicks}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
