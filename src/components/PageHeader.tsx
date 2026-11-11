"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A page's large title with its actions on the right.
 *
 * On a phone there is no top bar, so once the title has scrolled away the
 * actions would be a scroll back to the top away. When that happens a compact
 * bar fades in under the status bar — small title, same actions — the way an
 * iOS large title collapses into the navigation bar. Pages without actions
 * skip it: nothing to keep reachable, and the page stays full-screen.
 *
 * Must sit directly inside the page container that is padded `px-4 sm:px-6`
 * (the compact bar bleeds back out to the screen edges).
 */
export default function PageHeader({
  title,
  meta,
  actions,
  compactActions,
}: {
  title: string;
  /** Quiet text beside the title — a count, a status. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** What the compact bar shows instead of `actions` (e.g. icon-only buttons). */
  compactActions?: React.ReactNode;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const hasBar = Boolean(actions ?? compactActions);

  useEffect(() => {
    const header = headerRef.current;
    if (!header || !hasBar) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Gone through the top edge — not merely below the fold.
        const top = entry.rootBounds?.top ?? 0;
        setCollapsed(!entry.isIntersecting && entry.boundingClientRect.bottom <= top + 1);
      },
      { root: header.closest("main"), threshold: 0 },
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, [hasBar]);

  return (
    <>
      {hasBar && (
        <div className="sticky top-0 z-30 -mx-4 h-0 sm:-mx-6 desk:hidden">
          <div
            inert={!collapsed}
            className={`glass absolute inset-x-0 top-0 flex h-[3.25rem] items-center gap-2 border-b border-white/10 pl-4 pr-3 transition-[opacity,transform] duration-200 ${
              collapsed ? "opacity-100" : "pointer-events-none -translate-y-1.5 opacity-0"
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-neutral-50">
              {title}
            </span>
            {compactActions ?? actions}
          </div>
        </div>
      )}
      <header ref={headerRef} className="flex min-h-11 items-center gap-2.5">
        <h1 className="title-lg min-w-0 truncate">{title}</h1>
        {meta && (
          <span className="shrink-0 text-sm text-neutral-500">{meta}</span>
        )}
        {actions && (
          // stretch: icon-only buttons grow to the height of the labelled one
          <div className="ml-auto flex shrink-0 items-stretch gap-2">{actions}</div>
        )}
      </header>
    </>
  );
}
