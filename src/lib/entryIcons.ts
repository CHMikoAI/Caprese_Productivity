import { Calendar, ListTodo, Trophy, type LucideIcon } from "lucide-react";
import type { EntryType } from "@/lib/types";

/** Shared type -> icon mapping, used in both the calendar blocks and the
 * type selector in the create/edit dialog, so they always stay in sync. */
export const ENTRY_TYPE_ICON: Record<EntryType, LucideIcon> = {
  task: ListTodo,
  event: Calendar,
  goal: Trophy,
};
