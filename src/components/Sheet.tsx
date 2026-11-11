"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

type Size = "sm" | "md" | "lg";

const WIDTH: Record<Size, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

/** Body padding that clears the home indicator — which a keyboard covers. */
const SAFE_BOTTOM_BODY =
  "pb-[calc(1.25rem+env(safe-area-inset-bottom))] group-data-[keyboard]/sheet:pb-5";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Fired on `window` whenever a sheet opens (toasts step aside for it). */
export const SHEET_OPEN_EVENT = "caprese:sheet-open";

/** The visual viewport losing this much height means a keyboard, not a toolbar. */
const KEYBOARD_PX = 120;

/** Drag the sheet this far down (or flick it) and it lets go. */
const DISMISS_PX = 110;
const DISMISS_VELOCITY = 0.55; // px per ms

/**
 * The one dialog in the app. On a phone it is a bottom sheet — it rises from the
 * screen edge, carries a grab handle and can be flicked back down; on desktop
 * the same content is a centred card. Either way it is a proper modal dialog:
 * labelled, focus stays inside it and returns to where it came from, Escape and
 * a tap on the backdrop close it.
 *
 * `onSubmit` turns the body and the footer into one form. `dismissOnBackdrop`
 * is off for forms whose input would be lost by a stray tap outside.
 *
 * The on-screen keyboard: iOS lays it over the page without resizing anything,
 * so a sheet pinned to the screen edge ends up underneath it. The sheet follows
 * the *visual* viewport instead — while a keyboard is up it occupies exactly
 * the part of the screen that is still visible, and the focused field is kept
 * in view.
 */
export default function Sheet({
  title,
  icon,
  onClose,
  onSubmit,
  children,
  footer,
  headerExtra,
  size = "sm",
  dismissOnBackdrop = true,
  fill = false,
  bodyClassName = "",
  submitLabel,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  children: React.ReactNode;
  /**
   * Pinned under the scrolling body — the action bar. Pass a function to get
   * `close`, which dismisses the sheet with its exit animation (for "Cancel").
   */
  footer?: React.ReactNode | ((close: () => void) => React.ReactNode);
  /** Sits under the title row and stays put while the body scrolls. */
  headerExtra?: React.ReactNode;
  size?: Size;
  dismissOnBackdrop?: boolean;
  /** Take the full available height rather than hugging the content. */
  fill?: boolean;
  bodyClassName?: string;
  /**
   * Phones only, with `onSubmit`: the title row becomes "Cancel · title · Save"
   * (this is the Save label) and the footer is left out. The actions then sit
   * at the top, where a keyboard can never cover them.
   */
  submitLabel?: string;
}) {
  const titleId = useId();
  const formId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  /** Dismiss with the exit animation; `onClose` fires once it has played. */
  const requestClose = useCallback(() => setClosing(true), []);

  // The animation's own end event unmounts the sheet. The timer is only a net
  // for the rare case that event never arrives.
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => closeRef.current(), 320);
    return () => window.clearTimeout(timer);
  }, [closing]);

  // Focus: move it into the dialog (unless a field already took it via
  // autoFocus), hand it back to whatever opened the dialog afterwards.
  useEffect(() => {
    window.dispatchEvent(new Event(SHEET_OPEN_EVENT));
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  // Follow the visual viewport while a keyboard is up (see the note above).
  useEffect(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!vv || !root) return;
    let frame = 0;
    function apply() {
      if (!vv || !root) return;
      // A pinch-zoomed page also shrinks the visual viewport; that is a
      // magnifier, not a keyboard.
      const keyboard =
        Math.abs(vv.scale - 1) < 0.01 && window.innerHeight - vv.height > KEYBOARD_PX;
      if (keyboard) {
        root.style.top = `${vv.offsetTop}px`;
        root.style.bottom = "auto";
        root.style.height = `${vv.height}px`;
        root.setAttribute("data-keyboard", "");
      } else {
        root.style.top = "";
        root.style.bottom = "";
        root.style.height = "";
        root.removeAttribute("data-keyboard");
      }
      // The sheet just changed size under the focused field: keep it in view.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (keyboard && active instanceof HTMLElement && panelRef.current?.contains(active)) {
          active.scrollIntoView({ block: "nearest" });
        }
      });
    }
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, []);

  // Escape closes; Tab cycles inside the dialog instead of escaping behind it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setClosing(true);
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---- flick the sheet down to dismiss it (touch, bottom-sheet layout only) ----

  const dragRef = useRef<{
    id: number;
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || closing) return;
    if (window.matchMedia("(min-width: 640px)").matches) return; // centred dialog
    // Buttons in the header keep working as buttons.
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    dragRef.current = {
      id: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (panelRef.current) panelRef.current.style.transition = "none";
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.id !== e.pointerId || !panel) return;
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    const offset = Math.max(0, e.clientY - drag.startY);
    panel.style.transform = `translateY(${offset}px)`;
  }

  function onHandlePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.id !== e.pointerId || !panel) return;
    dragRef.current = null;
    const offset = Math.max(0, e.clientY - drag.startY);
    const dismiss =
      e.type !== "pointercancel" &&
      (offset > DISMISS_PX || (offset > 24 && drag.velocity > DISMISS_VELOCITY));
    if (dismiss) {
      // The exit animation picks up from where the finger let go.
      panel.style.setProperty("--sheet-drag", `${offset}px`);
      panel.style.transform = "";
      panel.style.transition = "";
      setClosing(true);
    } else {
      panel.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)";
      panel.style.transform = "";
    }
  }

  // A press that starts inside the dialog and ends on the backdrop (dragging a
  // text selection out, say) must not count as a tap outside.
  const pressedBackdrop = useRef(false);

  const footerNode = typeof footer === "function" ? footer(requestClose) : footer;
  // Top actions replace the footer on phones only.
  const topActions = Boolean(submitLabel && onSubmit);

  const body = (
    <>
      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 ${
          footerNode && !topActions
            ? "pb-4"
            : footerNode
              ? `${SAFE_BOTTOM_BODY} sm:pb-4`
              : `${SAFE_BOTTOM_BODY} sm:pb-6`
        } ${bodyClassName}`}
      >
        {children}
      </div>
      {footerNode && (
        <div
          className={`shrink-0 items-center gap-2 border-t border-neutral-800 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] group-data-[keyboard]/sheet:pb-3 sm:px-6 sm:pb-3 ${
            topActions ? "hidden sm:flex" : "flex"
          }`}
        >
          {footerNode}
        </div>
      )}
    </>
  );

  return (
    <div
      ref={rootRef}
      className="group/sheet fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          dismissOnBackdrop &&
          pressedBackdrop.current &&
          e.target === e.currentTarget
        ) {
          requestClose();
        }
      }}
    >
      <div
        className={`pointer-events-none fixed inset-0 bg-black/60 ${
          closing ? "animate-fade-out" : "animate-fade-in"
        }`}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) closeRef.current();
        }}
        className={`relative flex w-full flex-col rounded-t-[1.75rem] bg-neutral-900 shadow-2xl outline-none sm:rounded-2xl ${
          WIDTH[size]
        } ${
          fill
            ? "h-[calc(100%-env(safe-area-inset-top)-0.75rem)] sm:h-[85vh]"
            : "max-h-[calc(100%-env(safe-area-inset-top)-0.75rem)] sm:max-h-[90vh]"
        } ${
          closing
            ? "animate-sheet-out sm:animate-dialog-out"
            : "animate-sheet-in sm:animate-dialog-in"
        }`}
      >
        <div
          className="shrink-0 touch-none sm:touch-auto"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerEnd}
          onPointerCancel={onHandlePointerEnd}
        >
          <div
            className="mx-auto mt-2 h-1 w-9 rounded-full bg-neutral-700 sm:hidden"
            aria-hidden
          />
          <div
            className={`items-center gap-2 pb-3 pt-2 sm:flex sm:pl-6 sm:pr-4 sm:pt-4 ${
              topActions ? "grid grid-cols-[1fr_auto_1fr] px-2.5" : "flex pl-5 pr-3"
            }`}
          >
            {topActions && (
              <button
                type="button"
                onClick={requestClose}
                className="btn-ghost justify-self-start sm:hidden"
              >
                Cancel
              </button>
            )}
            {icon}
            <h2
              id={titleId}
              className={`min-w-0 truncate font-semibold text-neutral-50 sm:flex-1 sm:text-lg ${
                topActions ? "text-center text-base sm:text-left" : "flex-1 text-lg"
              }`}
            >
              {title}
            </h2>
            {topActions && (
              <button
                type="submit"
                form={formId}
                className="btn-primary justify-self-end px-5 py-2 sm:hidden"
              >
                {submitLabel}
              </button>
            )}
            <button
              type="button"
              onClick={requestClose}
              className={`icon-btn ${topActions ? "max-sm:hidden" : ""}`}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {headerExtra}
        </div>

        {onSubmit ? (
          <form id={formId} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  );
}
