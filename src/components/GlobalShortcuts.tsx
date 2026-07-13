"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";
import { useEscape, useShortcuts } from "@/lib/useShortcuts";

const SECTIONS: { title: string; items: [string, string][] }[] = [
  {
    title: "Everywhere",
    items: [
      ["1", "Calendar"],
      ["2", "Planner"],
      ["3", "Journal"],
      ["4", "Pantry"],
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
      ["Q", "Quick add a task"],
      ["/", "Search"],
    ],
  },
  {
    title: "Journal & Pantry",
    items: [
      ["N", "Write today's line (Journal)"],
      ["D", "Draw a card (Pantry)"],
    ],
  },
];

/** Global single-key shortcuts: page navigation plus the `?` help overlay. */
export default function GlobalShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useShortcuts({
    "1": () => router.push("/calendar"),
    "2": () => router.push("/planner"),
    "3": () => router.push("/journal"),
    "4": () => router.push("/pantry"),
    "?": () => setHelpOpen(true),
  });

  if (!helpOpen) return null;
  return <HelpOverlay onClose={() => setHelpOpen(false)} />;
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Keyboard className="h-4 w-4 text-neutral-400" />
            Keyboard shortcuts
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {section.title}
              </h4>
              <ul className="mt-2 flex flex-col gap-1.5">
                {section.items.map(([keys, label]) => (
                  <li
                    key={keys + label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-neutral-300">{label}</span>
                    <kbd className="shrink-0 rounded-md border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[11px] font-medium text-neutral-200">
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-5 text-xs text-neutral-600">
          Shortcuts stay out of the way while you type.
        </p>
      </div>
    </div>
  );
}
