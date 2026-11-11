"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False while rendering on the server and during hydration, true from the first
 * client render on. Reads as an external store, so there is no effect, no extra
 * state and no hydration mismatch.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * Renders its children in the browser only; the server sends `fallback`.
 *
 * Every page in the app is laid out in the viewer's own time zone — which day
 * is "today", where 09:00 sits on the grid, whether a task is overdue — and
 * around the device (phone or desktop view, the last calendar view used). The
 * server knows neither: it runs in UTC, so its HTML put every calendar block an
 * hour or two off and React threw the whole tree away on hydration, on every
 * load. The page data still comes from the server; only the drawing waits for
 * the browser.
 */
export default function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return useIsClient() ? children : fallback;
}
