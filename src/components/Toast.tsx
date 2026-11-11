"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastAction = { label: string; run: () => void };
export type ToastState = { text: string; action?: ToastAction } | null;

/** How long a plain message stays, and how long one that offers an Undo does. */
const MESSAGE_MS = 4000;
const ACTION_MS = 7000;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  /** Show a message; pass an action to offer a way back ("Undo"). */
  const show = useCallback((text: string, action?: ToastAction) => {
    setToast({ text, action });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setToast(null),
      action ? ACTION_MS : MESSAGE_MS,
    );
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message: toast, show, dismiss };
}

/**
 * A short status line. It sits above the phone tab bar rather than on top of
 * it, announces itself to screen readers, and can carry a single action.
 */
export default function Toast({
  message,
  onDismiss,
}: {
  message: ToastState | string | null;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  const toast = typeof message === "string" ? { text: message } : message;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-toast z-[60] flex justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-full animate-toast-in items-center gap-1 rounded-2xl bg-neutral-800 py-1.5 pl-4 pr-1.5 text-sm font-medium text-neutral-50 shadow-2xl ring-1 ring-white/10">
        <span className="min-w-0 truncate py-1 pr-2.5">{toast.text}</span>
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.run();
              onDismiss?.();
            }}
            className="shrink-0 rounded-xl px-3 py-1.5 font-semibold text-accent-bright transition-opacity active:opacity-50"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
