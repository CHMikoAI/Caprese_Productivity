"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard } from "lucide-react";
import Sheet from "@/components/Sheet";
import { PARTNER_ARCHIVED } from "@/lib/features";
import { NAV_ROUTES } from "@/lib/nav";
import { useShortcuts, type ShortcutMap } from "@/lib/useShortcuts";

/** Dispatch on `window` to open the shortcut overview (the top bar's button). */
export const SHORTCUT_HELP_EVENT = "caprese:shortcut-help";

const SECTIONS: { title: string; items: [string, string][] }[] = [
  {
    title: "Everywhere",
    items: [
      // The number keys follow the tab order, so they are derived from it.
      ...NAV_ROUTES.map(
        ({ label }, i): [string, string] => [String(i + 1), label],
      ),
      ["?", "This overview"],
      ["Esc", "Close dialogs"],
    ],
  },
  {
    title: "Calendar",
    items: [
      ["N", "New entry"],
      ["T", "Today"],
      ["D / W / M", "Day · Week · Month view"],
      ["← / →", "Previous / next period"],
      ["S", "Toggle the To-plan sidebar"],
    ],
  },
  {
    title: "Planner",
    items: [
      ["N", "New entry"],
      ["Q", "Quick add a to-do"],
      ["/", "Search"],
    ],
  },
  {
    title: "Thoughts, Journal & Pantry",
    items: [
      ["N", "New thought (Thoughts)"],
      ["V", "Voice note (Thoughts)"],
      ["N", "Write today's line (Journal)"],
      ...(PARTNER_ARCHIVED
        ? []
        : ([["N", "Add a weekly goal (Partner)"]] as [string, string][])),
      ["D", "Draw a card (Pantry)"],
    ],
  },
];

/** Global single-key shortcuts: page navigation plus the `?` help overlay. */
export default function GlobalShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  const map: ShortcutMap = { "?": () => setHelpOpen(true) };
  NAV_ROUTES.forEach(({ href }, i) => {
    map[String(i + 1)] = () => router.push(href);
  });
  useShortcuts(map);

  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener(SHORTCUT_HELP_EVENT, open);
    return () => window.removeEventListener(SHORTCUT_HELP_EVENT, open);
  }, []);

  if (!helpOpen) return null;
  return (
    <Sheet
      title="Keyboard shortcuts"
      icon={<Keyboard className="h-5 w-5 shrink-0 text-neutral-400" />}
      size="md"
      onClose={() => setHelpOpen(false)}
    >
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h3 className="section-label">{section.title}</h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {section.items.map(([keys, label]) => (
                <li
                  key={keys + label}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-neutral-300">{label}</span>
                  <kbd className="shrink-0 rounded-md bg-neutral-800 px-1.5 py-0.5 font-sans text-[11px] font-medium text-neutral-200">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-5 text-xs text-neutral-500">
        Shortcuts stay out of the way while you type.
      </p>
    </Sheet>
  );
}
