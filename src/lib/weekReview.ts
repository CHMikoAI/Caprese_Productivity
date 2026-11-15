import { addDays, startOfWeek } from "@/lib/dates";

/** A week's review opens on its Friday (Monday + 4 days)… */
export const REVIEW_OPENS_AFTER_DAYS = 4;
/** …and stays open through the week after. Then the moment has passed. */
export const REVIEW_OPEN_WEEKS_BACK = 1;

/**
 * Where a week stands for its review:
 *  - `ahead`   a week that has not begun
 *  - `running` the current week, before Friday — too early to judge
 *  - `open`    it can be closed now (from Friday, and all of the week after)
 *  - `expired` it went by without a review
 */
export type ReviewWindow = "ahead" | "running" | "open" | "expired";

export function reviewWindow(weekStart: Date, now: Date): ReviewWindow {
  const week = startOfWeek(weekStart);
  const current = startOfWeek(now);
  if (week.getTime() > current.getTime()) return "ahead";
  if (now.getTime() < addDays(week, REVIEW_OPENS_AFTER_DAYS).getTime()) {
    return "running";
  }
  const oldest = addDays(current, -7 * REVIEW_OPEN_WEEKS_BACK);
  return week.getTime() >= oldest.getTime() ? "open" : "expired";
}
