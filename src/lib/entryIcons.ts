import {
  Calendar,
  ClipboardList,
  ListChecks,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { EntryType } from "@/lib/types";

/** Shared type -> icon mapping, used in both the calendar blocks and the
 * type selector in the create/edit dialog, so they always stay in sync.
 * Task = clipboard (a planned work item), todo = checklist (quick reminder) —
 * deliberately different silhouettes so they read apart at a glance. */
export const ENTRY_TYPE_ICON: Record<EntryType, LucideIcon> = {
  task: ClipboardList,
  event: Calendar,
  todo: ListChecks,
  goal: Trophy,
};
