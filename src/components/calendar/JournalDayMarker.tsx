"use client";

import { NotebookPen } from "lucide-react";
import { PILLAR_META } from "@/lib/pillarIcons";
import type { JournalEntry } from "@/lib/types";

/** Small marker shown on a calendar day that has a journal entry; hover to
 * read it. Used in the day/workweek/week header and in the month grid. */
export default function JournalDayMarker({
  entry,
}: {
  entry: JournalEntry | undefined;
}) {
  if (!entry) return null;
  const Icon = PILLAR_META[entry.pillar].icon;

  return (
    <span className="group/journal relative inline-flex">
      <NotebookPen className="h-3 w-3 shrink-0 text-neutral-500 transition-colors group-hover/journal:text-accent" />
      <span
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden w-52 -translate-x-1/2 flex-col gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-2.5 text-left shadow-2xl group-hover/journal:flex"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
          <Icon className="h-3 w-3" />
          {PILLAR_META[entry.pillar].label}
        </span>
        <span className="text-xs normal-case leading-relaxed text-neutral-200">
          {entry.content}
        </span>
      </span>
    </span>
  );
}
