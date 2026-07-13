"use client";

import { useEffect, useRef } from "react";

export type ShortcutMap = Record<string, () => void>;

/** Overlay pattern shared by every modal in the app (and the shortcut help). */
const OVERLAY_SELECTOR = ".fixed.inset-0.z-50";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * App-style single-key shortcuts (Gmail/Linear convention): plain keys only —
 * never with Ctrl/Alt/Meta, never while typing in an input, textarea, select
 * or rich-text field, and never while a modal overlay is open.
 * Keys are matched against `KeyboardEvent.key` ("n", "ArrowLeft", "?", …).
 */
export function useShortcuts(map: ShortcutMap) {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      const handler = mapRef.current[e.key];
      if (!handler) return;
      e.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Close a modal with Escape — works regardless of where the focus sits. */
export function useEscape(onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
