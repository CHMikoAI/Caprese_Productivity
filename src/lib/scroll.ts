"use client";

/**
 * Scroll the app's single scroll area (the shell's `main`) back to the top.
 * The document itself never scrolls — see `app/layout.tsx` — so `window.scrollTo`
 * would do nothing.
 */
export function scrollAppToTop() {
  document
    .querySelector("main")
    ?.scrollTo({ top: 0, behavior: "smooth" });
}
