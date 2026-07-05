"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const TABS = [
  { href: "/calendar", label: "Calendar" },
  { href: "/tasks", label: "Tasks" },
  { href: "/journal", label: "Journal" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-neutral-950/85 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4 sm:gap-8 sm:px-6">
        <Link href="/calendar" className="flex shrink-0 items-center gap-2.5">
          <Logo className="h-6 w-6" />
          <span className="hidden text-[15px] font-semibold tracking-tight text-neutral-100 sm:block">
            Caprese
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  active
                    ? "rounded-lg bg-neutral-800/70 px-3 py-1.5 font-medium text-neutral-50"
                    : "rounded-lg px-3 py-1.5 text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
