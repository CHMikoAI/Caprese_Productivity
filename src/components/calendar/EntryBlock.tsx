"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { blockPalette, goalFrame } from "@/lib/colorContrast";
import { formatTime } from "@/lib/dates";
import { ENTRY_TYPE_ICON } from "@/lib/entryIcons";
import { isFinished } from "@/lib/entryStatus";
import { type Category, type Entry } from "@/lib/types";

export type PositionedEntry = {
  entry: Entry;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
};

const NEUTRAL = "#6B7280";
// Content width (px) at which "time · project" fits comfortably on one line.
const WIDE_PX = 120;

export default function EntryBlock({
  item,
  category,
  slotPx,
  now,
  dimmed,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onResizePointerDown,
}: {
  item: PositionedEntry;
  category?: Category;
  slotPx: number;
  now: Date;
  dimmed: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (
    e: React.PointerEvent<HTMLDivElement>,
    edge: "top" | "bottom",
  ) => void;
}) {
  const { entry, startMin, endMin, col, cols } = item;
  const width = 100 / cols;
  const heightPx = Math.max(((endMin - startMin) / 30) * slotPx - 2, slotPx - 4);
  const finished = isFinished(entry, now); // resolved task/goal or past event
  const struck = finished && entry.type !== "event";
  const color = category?.color ?? NEUTRAL;
  const pal = blockPalette(color);

  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWide(e.contentRect.width >= WIDE_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Progressively reveal detail as the block gets taller.
  const showTime = heightPx >= 38 && Boolean(entry.start_at && entry.end_at);
  const showMeta = heightPx >= 58; // room for a project line of its own
  // The bottom grip (lengthen) is available on every block — even a 30-min one;
  // the top grip (move the start) needs a little more height to sit clear of it.
  const showBottomHandle = heightPx >= 16;
  const showTopHandle = heightPx >= 44;

  const TypeIcon =
    entry.type === "task" && entry.status === "done"
      ? CheckCircle2
      : ENTRY_TYPE_ICON[entry.type];

  const handleClass =
    "absolute inset-x-0 z-10 flex h-2 cursor-ns-resize items-center justify-center sm:touch-none";
  const grip = (
    <span className="h-1 w-5 rounded-full bg-white/80 opacity-0 shadow group-hover:opacity-100" />
  );

  return (
    <div
      ref={ref}
      // touch-action only from sm up: on phones a swipe/scroll over a block
      // must pan the grid, so dragging blocks stays a pointer-device affordance
      // (tapping still opens the editor).
      className={`group absolute z-[5] cursor-pointer select-none overflow-hidden rounded-md px-1.5 text-left transition-[filter] hover:brightness-110 sm:touch-none ${
        heightPx <= 24 ? "py-0" : "py-1"
      } ${dimmed ? "opacity-30" : finished ? "opacity-60" : ""}`}
      style={{
        top: (startMin / 30) * slotPx + 1,
        height: heightPx,
        left: `calc(${col * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        backgroundColor: pal.bg,
        // Goals get a bright frame in their project color so they stand out.
        border:
          entry.type === "goal"
            ? `2px solid ${goalFrame(color)}`
            : "1px solid rgba(0,0,0,0.2)",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => e.stopPropagation()}
    >
      {showTopHandle && (
        <div
          className={`${handleClass} top-0`}
          onPointerDown={(e) => onResizePointerDown(e, "top")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {grip}
        </div>
      )}

      <div className="flex items-center gap-1">
        <TypeIcon className="h-3 w-3 shrink-0" style={{ color: pal.sub }} />
        <p
          className={`truncate text-xs font-medium leading-tight ${
            struck ? "line-through" : ""
          }`}
          style={{ color: pal.title }}
        >
          {entry.title}
        </p>
      </div>
      {showTime && (
        <p
          className="truncate text-[10px] leading-tight"
          style={{ color: pal.sub }}
        >
          {formatTime(new Date(entry.start_at!))} –{" "}
          {formatTime(new Date(entry.end_at!))}
          {wide && category && (
            <>
              <span style={{ color: pal.faint }}> · </span>
              {category.name}
            </>
          )}
        </p>
      )}
      {!wide && showMeta && category && (
        <p
          className="truncate text-[10px] leading-tight"
          style={{ color: pal.sub }}
        >
          {category.name}
        </p>
      )}

      {showBottomHandle && (
        <div
          className={`${handleClass} bottom-0`}
          onPointerDown={(e) => onResizePointerDown(e, "bottom")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {grip}
        </div>
      )}
    </div>
  );
}
