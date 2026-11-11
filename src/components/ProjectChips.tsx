"use client";

import type { Category } from "@/lib/types";

/**
 * Project filter: "All projects" plus one chip per project, each led by the
 * project's colour so it reads the same as its blocks on the calendar. On a
 * phone the row scrolls sideways (bleeding to the screen edges) instead of
 * stacking into several lines; from `sm` on it wraps.
 *
 * Sits inside a page container padded `px-4 sm:px-6`.
 */
export default function ProjectChips({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  /** A project id, or "all". */
  value: string;
  onChange: (value: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div
      className="chip-scroller -mx-4 px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      role="group"
      aria-label="Filter by project"
    >
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={value === "all"}
        className="chip"
      >
        All projects
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onChange(value === category.id ? "all" : category.id)}
          aria-pressed={value === category.id}
          className="chip"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: category.color }}
            aria-hidden
          />
          {category.name}
        </button>
      ))}
    </div>
  );
}
