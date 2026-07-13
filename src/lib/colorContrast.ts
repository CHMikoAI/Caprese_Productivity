// Picks readable text colors for a calendar block tinted with a project color.
// The block sits on the near-black page, so we blend the color over that base
// at `alpha`, then choose black- or white-based text by WCAG contrast — this
// keeps titles AND the fainter meta line legible on every colour in the palette.

const PAGE_BG: [number, number, number] = [10, 10, 10]; // ~neutral-950

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  const h = m ? m[1] : "6b7280";
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrast(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

export type BlockPalette = {
  bg: string;
  title: string;
  sub: string;
  faint: string;
};

/**
 * Bright, opaque frame color for goal blocks: the project color lifted
 * towards white so the outline pops against the tinted fill on every view.
 */
export function goalFrame(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const lift = (c: number) => Math.round(c + (255 - c) * 0.45);
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
}

export function blockPalette(hex: string, alpha = 0.66): BlockPalette {
  const [r, g, b] = hexToRgb(hex);
  const effective: [number, number, number] = [
    Math.round(r * alpha + PAGE_BG[0] * (1 - alpha)),
    Math.round(g * alpha + PAGE_BG[1] * (1 - alpha)),
    Math.round(b * alpha + PAGE_BG[2] * (1 - alpha)),
  ];
  const bgLum = relativeLuminance(effective);
  // Prefer white text (keeps the dark theme consistent); only fall back to dark
  // text on genuinely light colours where white would drop below AA contrast.
  const whiteContrast = contrast(1, bgLum);
  const useDark = whiteContrast < 4.5 && contrast(0, bgLum) > whiteContrast;
  return {
    bg: `rgba(${r}, ${g}, ${b}, ${alpha})`,
    title: useDark ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.98)",
    sub: useDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.85)",
    faint: useDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)",
  };
}
