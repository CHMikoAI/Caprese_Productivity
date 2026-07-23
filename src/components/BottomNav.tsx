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
 * icon+label targets. Fixed to the viewport (so it survives document scroll);
 * `AppLayout` reserves matching bottom padding on the main area. Desktop keeps
 * the tabs in the top bar, so this is hidden from `sm` up.
 */
export default function BottomNav({
  pantryPicks = 0,
}: {
  pantryPicks?: number;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800/80 bg-neutral-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      aria-label="Primary"
    >
      <div className="flex h-16 items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active
                  ? "text-accent"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <span className="relative">
                <Icon
                  className="h-6 w-6"
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
