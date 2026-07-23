"use client";

import { useEffect } from "react";

/**
 * Registers the service worker and — crucially — keeps an installed PWA from
 * getting stuck on a stale build:
 *
 * - iOS home-screen apps restore a frozen snapshot when reopened instead of
 *   re-fetching. `pageshow` with `persisted` marks exactly that restore; in
 *   standalone mode we reload so a new deployment is always picked up.
 * - Whenever the app is brought to the foreground we ask the browser to check
 *   for a newer worker, and when one takes control we reload once for the
 *   fresh assets.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const nav = navigator as Navigator & { standalone?: boolean };
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true;

    // iOS PWA: a frozen restore can show an outdated build — reload it.
    // Scoped to standalone so normal browser back/forward stays instant.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && isStandalone) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);

    // A newer worker took control → reload once to pick up its assets.
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    let registration: ServiceWorkerRegistration | undefined;
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {});
      }
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          registration = reg;
          reg.update().catch(() => {});
          document.addEventListener("visibilitychange", checkForUpdate);
        })
        .catch((err) => {
          console.error("Service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
