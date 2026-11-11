"use client";

import { ChevronDown } from "lucide-react";

/**
 * A collapsible section of a list page: the header is the toggle (label,
 * count, an optional one-line hint on wider screens), `action` sits beside it
 * so its controls stay clickable on their own.
 */
export default function Section({
  title,
  count,
  hint,
  collapsed,
  onToggle,
  action,
  className = "mt-5",
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Controls pinned to the right of the header (kept outside the toggle). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <div className="flex min-h-11 items-center gap-2">
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="-ml-1 flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          {title}
          {count !== undefined && (
            <span className="font-normal text-neutral-600">{count}</span>
          )}
          {hint && !collapsed && (
            <span className="ml-2 hidden truncate font-normal normal-case tracking-normal text-neutral-600 sm:inline">
              {hint}
            </span>
          )}
        </button>
        {action}
      </div>
      {!collapsed && children}
    </section>
  );
}
