"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";

/*
 * Sideways paging by touch for a strip rendered as [previous, current, next]
 * — the phone's day / 3-day grid and its month view.
 *
 * The finger moves the strip directly (no React render per frame). A gesture
 * commits to one axis after a few pixels: sideways it pages, otherwise it is
 * left to the browser's own vertical scrolling. On release the page turns when
 * the finger carried it far enough or flicked it, and settles with an
 * animation. Only once that has finished does the page itself change (the
 * strip is re-rendered around the new centre and recentred before paint).
 *
 * A touch that lands while a page is still settling catches it where it is —
 * like a native scroll view: the settling page change is committed at once and
 * the new gesture carries on from exactly that spot. So quick swipes in a row
 * each turn a page, and nothing ever jumps.
 *
 * While a page settles, its content takes no touches. A finger that lands then
 * is a catch, never a tap on a slot or a day — and it lands on the strip's
 * container rather than on content that the catch is about to re-render. A
 * touch whose target leaves the document never reports its end, which used to
 * leave a gesture hanging.
 */

/** Finger travel before a gesture commits to one axis. */
const AXIS_LOCK_PX = 10;
/** A release at least this fast (px per ms) is a flick… */
const FLICK_VELOCITY = 0.25;
/** …which turns the page once the finger has travelled this far. */
const FLICK_MIN_PX = 12;
/** Without a flick, the finger has to carry the page this share of its width. */
const DISTANCE_SHARE = 0.2;
const DISTANCE_MIN_PX = 44;
/** The release speed is read from the last stretch of the gesture only. */
const VELOCITY_WINDOW_MS = 100;
/** A tap this soon after a paging touch ended belongs to that touch. */
const PAGING_LINGER_MS = 350;
/** Pointer and touch events of one touch can be this far apart in time. */
const EVENT_SLACK_MS = 80;
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

type Delta = -1 | 0 | 1;

export type SwipePagerOptions = {
  /** Paging is on (the layout shows this pager). */
  enabled: boolean;
  /** The element the gesture is read from. */
  rootRef: React.RefObject<HTMLElement | null>;
  /** Width of one page in px; 0 while not measured. */
  pageWidth: number;
  /** The strips that move together; each holds three pages side by side. */
  strips: React.RefObject<HTMLElement | null>[];
  /** Turn the page: +1 forward, -1 back. Must change `resetKey`. */
  onPage: (delta: -1 | 1) => void;
  /** What the strips show; a change means they were re-rendered around a new
   * centre (by a turned page, or by a jump such as "Today"). */
  resetKey: string;
  /** A touch started paging (or caught a settling page): drop any tap,
   * press or drag that touch had started on the content. */
  onGestureStart?: () => void;
};

export type SwipePager = {
  /** Turn the page with the same animation (keys, buttons). False when off. */
  go: (delta: -1 | 1) => boolean;
  /**
   * Whether a touch belongs to paging — so its tap must not also open or
   * create something. Pass the time the pointer went down (`event.timeStamp`
   * of its pointerdown) to ask about that touch; without it, the answer is
   * "a paging touch is under way or just ended" (for click events).
   */
  isPagingTouch: (downAt?: number) => boolean;
};

type Track = {
  id: number;
  startX: number;
  startY: number;
  startedAt: number;
  /** Where the strip sat when the touch landed (non-zero after a catch). */
  base: number;
  axis: "x" | "y" | null;
  caught: boolean;
  samples: { t: number; x: number }[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function touchById(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}

/** Release speed in px per ms over the last stretch of the gesture. */
function releaseVelocity(samples: { t: number; x: number }[], at: number) {
  const recent = samples.filter((s) => at - s.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

class PagerEngine {
  opts!: SwipePagerOptions;
  /** Strip position relative to the resting (centred) one, in px. */
  offset = 0;
  /** A settling page; `onPage` as it was when the page set off (the
   * view may change before it arrives). */
  anim: { delta: Delta; timer: number; onPage: (delta: -1 | 1) => void } | null =
    null;
  track: Track | null = null;
  /** The last touch that paged, from touch-down to lift-off. */
  lastPaging: { from: number; to: number } | null = null;
  /** True while this engine itself turns the page (its own re-render). */
  committing = false;

  private get pw() {
    return this.opts.pageWidth;
  }

  private elements(): HTMLElement[] {
    return this.opts.strips.map((r) => r.current).filter((el): el is HTMLElement => !!el);
  }

  /** Content under a settling page takes no touches (see the note above). */
  private busy(on: boolean) {
    for (const el of this.elements()) el.style.pointerEvents = on ? "none" : "";
  }

  private write(x: number, transition = "none") {
    const transform = `translate3d(${-this.pw + x}px, 0, 0)`;
    for (const el of this.elements()) {
      el.style.transition = transition;
      el.style.transform = transform;
    }
  }

  /** Where the strip is on screen right now — mid-animation included. */
  private visualOffset(): number {
    const el = this.elements()[0];
    if (!el) return this.offset;
    const t = getComputedStyle(el).transform;
    if (!t || t === "none") return this.pw;
    return new DOMMatrixReadOnly(t).m41 + this.pw;
  }

  private turn(delta: -1 | 1, onPage = this.opts.onPage) {
    this.committing = true;
    try {
      // Synchronously, so the new centre is on screen before anything else
      // happens — a touch that lands next must find the strip as it looks.
      flushSync(() => onPage(delta));
    } finally {
      this.committing = false;
    }
  }

  private complete(delta: Delta, onPage = this.opts.onPage) {
    this.anim = null;
    if (delta !== 0) this.turn(delta, onPage);
    this.offset = 0;
    this.write(0);
    this.busy(false);
  }

  /** Animate to the page `delta` away from the centre, then turn to it. */
  private settle(delta: Delta, velocity = 0) {
    if (this.anim) {
      window.clearTimeout(this.anim.timer);
      this.anim = null;
    }
    const target = -delta * this.pw;
    const distance = Math.abs(target - this.offset);
    if (distance < 0.5) {
      this.offset = target;
      this.write(target);
      this.complete(delta);
      return;
    }
    const speed = Math.abs(velocity);
    // A flick settles at about the finger's pace; a slow release in a calm,
    // distance-dependent glide.
    const duration = Math.round(
      speed >= FLICK_VELOCITY
        ? clamp((distance / speed) * 1.6, 140, 280)
        : clamp(170 + 150 * (distance / this.pw), 170, 320),
    );
    // Make sure the start position is the one the animation starts from.
    for (const el of this.elements()) void getComputedStyle(el).transform;
    this.offset = target;
    this.write(target, `transform ${duration}ms ${EASE}`);
    const onPage = this.opts.onPage;
    this.anim = {
      delta,
      onPage,
      timer: window.setTimeout(() => this.complete(delta, onPage), duration + 24),
    };
    this.busy(true);
  }

  /** A touch landed on a settling page: stop it where it is, keep its turn. */
  private catchAnimation(): boolean {
    const anim = this.anim;
    if (!anim) return false;
    window.clearTimeout(anim.timer);
    this.anim = null;
    const now = this.visualOffset();
    this.write(now);
    if (anim.delta !== 0) {
      this.turn(anim.delta, anim.onPage);
      // Same spot on screen, measured from the new centre.
      this.offset = now + anim.delta * this.pw;
    } else {
      this.offset = now;
    }
    this.write(this.offset);
    // The catching touch already has its target; later ones may tap again.
    this.busy(false);
    return true;
  }

  private endTrack(track: Track) {
    if (track.axis === "x" || track.caught) {
      this.lastPaging = { from: track.startedAt, to: performance.now() };
    }
  }

  onStart = (e: TouchEvent) => {
    if (this.track) {
      const track = this.track;
      this.track = null;
      this.endTrack(track);
      if (e.touches.length > 1) {
        // A second finger: let go of the page.
        if (this.offset !== 0 && !this.anim) this.settle(0);
        return;
      }
      // Only the new finger is down, so the tracked one lifted without its
      // end ever arriving: forget it and start over with this one.
    }
    const caught = this.catchAnimation();
    if (e.touches.length !== 1) {
      if (this.offset !== 0) this.settle(0);
      return;
    }
    const t = e.touches[0];
    this.track = {
      id: t.identifier,
      startX: t.clientX,
      startY: t.clientY,
      startedAt: performance.now(),
      base: this.offset,
      axis: null,
      caught,
      samples: [],
    };
    // Catching a page is not a tap on what is under the finger.
    if (caught) this.opts.onGestureStart?.();
  };

  onMove = (e: TouchEvent) => {
    const track = this.track;
    if (!track) return;
    const t = touchById(e.touches, track.id);
    if (!t) return;
    const dx = t.clientX - track.startX;
    const dy = t.clientY - track.startY;
    if (track.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      track.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (track.axis === "x") this.opts.onGestureStart?.();
      // A scroll that caught a settling page lets that page finish settling.
      else if (this.offset !== 0) this.settle(0);
    }
    if (track.axis !== "x") return;
    if (e.cancelable) e.preventDefault();
    track.samples.push({ t: e.timeStamp, x: t.clientX });
    while (
      track.samples.length > 2 &&
      e.timeStamp - track.samples[0].t > VELOCITY_WINDOW_MS
    ) {
      track.samples.shift();
    }
    // Only the neighbours are rendered — never drag past them into nothing.
    this.offset = clamp(track.base + dx, -this.pw, this.pw);
    this.write(this.offset);
  };

  onEnd = (e: TouchEvent) => {
    const track = this.track;
    if (!track) return;
    const t = touchById(e.changedTouches, track.id);
    if (!t) return; // another finger lifted
    this.track = null;
    this.endTrack(track);
    if (track.axis !== "x") {
      if (this.offset !== 0 && !this.anim) this.settle(0);
      return;
    }
    // The system took the touch (a system gesture): back to where it was.
    if (e.type === "touchcancel") {
      this.settle(0);
      return;
    }
    // The decision is about this gesture — how far and how fast the finger
    // went — not about where the strip sits: after a catch it can sit far
    // off-centre, and a mere touch must let the caught page complete.
    const dx = t.clientX - track.startX;
    track.samples.push({ t: e.timeStamp, x: t.clientX });
    const v = releaseVelocity(track.samples, e.timeStamp);
    const flick = Math.abs(v) >= FLICK_VELOCITY;
    let delta: Delta = 0;
    if (flick && Math.sign(v) !== Math.sign(dx)) {
      delta = 0; // flicked back against the drag: stay
    } else if (
      (flick && Math.abs(dx) >= FLICK_MIN_PX) ||
      Math.abs(dx) >= Math.max(this.pw * DISTANCE_SHARE, DISTANCE_MIN_PX)
    ) {
      delta = dx < 0 ? 1 : -1;
    }
    this.settle(delta, v);
  };

  go(delta: -1 | 1): boolean {
    if (!this.opts.enabled || !this.pw) return false;
    if (this.track) return true;
    this.catchAnimation();
    this.settle(delta);
    return true;
  }

  isPagingTouch(downAt?: number): boolean {
    const track = this.track;
    if (track && (track.axis === "x" || track.caught)) {
      if (downAt === undefined || downAt >= track.startedAt - EVENT_SLACK_MS) return true;
    }
    const last = this.lastPaging;
    if (!last) return false;
    if (downAt === undefined) return performance.now() - last.to < PAGING_LINGER_MS;
    return downAt >= last.from - EVENT_SLACK_MS && downAt <= last.to + EVENT_SLACK_MS;
  }

  /** The strips were re-rendered around a new centre. */
  reset() {
    if (!this.committing) {
      // Moved from elsewhere ("Today", a tapped day): that wins over a
      // settling page and a gesture in progress.
      if (this.anim) window.clearTimeout(this.anim.timer);
      this.anim = null;
      this.track = null;
      this.busy(false);
    }
    this.offset = 0;
    this.write(0);
  }

  /** The pager is going away (another view, a new size): finish up. */
  detach() {
    const anim = this.anim;
    this.anim = null;
    this.track = null;
    this.busy(false);
    if (anim) {
      window.clearTimeout(anim.timer);
      // The page was on its way; let it arrive (a plain update — no
      // synchronous render while React is tearing down).
      if (anim.delta !== 0) anim.onPage(anim.delta);
    }
  }
}

export function useSwipePager(options: SwipePagerOptions): SwipePager {
  const engineRef = useRef<PagerEngine | null>(null);

  // Hand the engine the latest options before anything else uses them.
  useLayoutEffect(() => {
    engineRef.current ??= new PagerEngine();
    engineRef.current.opts = options;
  });

  // Recentre whenever the strips show something new — before paint.
  const { enabled, pageWidth, resetKey, rootRef } = options;
  useLayoutEffect(() => {
    if (!enabled || !pageWidth) return;
    engineRef.current?.reset();
  }, [enabled, pageWidth, resetKey]);

  useEffect(() => {
    const engine = engineRef.current;
    const root = rootRef.current;
    if (!engine || !root || !enabled || !pageWidth) return;
    root.addEventListener("touchstart", engine.onStart, { passive: true });
    root.addEventListener("touchmove", engine.onMove, { passive: false });
    root.addEventListener("touchend", engine.onEnd, { passive: true });
    root.addEventListener("touchcancel", engine.onEnd, { passive: true });
    return () => {
      root.removeEventListener("touchstart", engine.onStart);
      root.removeEventListener("touchmove", engine.onMove);
      root.removeEventListener("touchend", engine.onEnd);
      root.removeEventListener("touchcancel", engine.onEnd);
      engine.detach();
    };
  }, [enabled, pageWidth, rootRef]);

  const go = useCallback((delta: -1 | 1) => engineRef.current?.go(delta) ?? false, []);
  const isPagingTouch = useCallback(
    (downAt?: number) => engineRef.current?.isPagingTouch(downAt) ?? false,
    [],
  );
  return { go, isPagingTouch };
}
