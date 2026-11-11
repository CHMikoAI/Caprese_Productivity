import { PageSkeleton } from "@/components/Skeleton";

/**
 * Shown while a page's data is on the way. Without it a navigation paints
 * nothing at all until the server render lands — the app looked frozen on a
 * slow connection. The shell (navigation) is already up by then, so this only
 * stands in for the page body. Calendar, Planner and Thoughts bring their own
 * shape.
 */
export default function Loading() {
  return <PageSkeleton />;
}
