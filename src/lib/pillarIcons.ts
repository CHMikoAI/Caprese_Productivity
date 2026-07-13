import { Feather, HeartHandshake, HeartPulse, type LucideIcon } from "lucide-react";
import type { Pillar } from "@/lib/types";

/** Shared pillar -> label/icon mapping, used in the Journal page and the
 * calendar's journal-entry marker so they stay visually in sync. */
export const PILLAR_META: Record<Pillar, { label: string; icon: LucideIcon }> = {
  freedom: { label: "Freedom", icon: Feather },
  health: { label: "Health", icon: HeartPulse },
  relationship: { label: "Relationship", icon: HeartHandshake },
};
