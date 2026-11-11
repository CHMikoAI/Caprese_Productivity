import {
  BookText,
  CalendarDays,
  FolderKanban,
  Heart,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { PARTNER_ARCHIVED } from "@/lib/features";

export type NavTab = { href: string; label: string; Icon: LucideIcon };

/**
 * The primary tabs, in order. One list feeds the desktop top bar, the phone tab
 * bar and the number-key shortcuts, so they can never drift apart again.
 */
export const NAV_TABS: NavTab[] = [
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/planner", label: "Planner", Icon: FolderKanban },
  { href: "/thoughts", label: "Thoughts", Icon: Lightbulb },
  { href: "/journal", label: "Journal", Icon: BookText },
  ...(PARTNER_ARCHIVED
    ? []
    : [{ href: "/partner", label: "Partner", Icon: Heart }]),
];

/** Pantry closes the row everywhere; it carries the salad tracker, not an icon. */
export const PANTRY_ROUTE = { href: "/pantry", label: "Pantry" };

/** Every destination in keyboard order — `1` is the first tab, Pantry the last. */
export const NAV_ROUTES: { href: string; label: string }[] = [
  ...NAV_TABS.map(({ href, label }) => ({ href, label })),
  PANTRY_ROUTE,
];

export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
