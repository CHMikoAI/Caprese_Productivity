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
 * translucent over the content, a hairline on top, big icons with a small
 * label, tinted with the accent when selected. Fixed to the viewport bottom so
 * it's always flush against the screen edge (`AppLayout` reserves matching
 * bottom padding on `main`). Shown on every phone viewport — portrait *and*
 * landscape (see the `phone` variant in globals.css); only real desktops move
 * the tabs to the top bar. Pantry lives off the bottom bar on phones — it's
 * reached via the salad icon in the top bar instead.
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-neutral-800 bg-neutral-950/80 backdrop-blur-xl phone:block phone:pt-1.5"
      // Sit the icons near the bottom, but not cramped against the top edge:
      // pt-1.5 gives them a little air under the hairline, while the bottom
      // padding reserves well under the full home-indicator inset so there's
      // only a slim clearance below the labels (~10px on iPhone), not the full
      // ~34px "dead" strip iOS reserves. `AppLayout` reserves both.
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
