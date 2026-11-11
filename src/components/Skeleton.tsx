/**
 * Page-shaped placeholders. They stand in twice: while a navigation waits for
 * the server (the route `loading.tsx` files), and for the first frame of a hard
 * load, before the browser has drawn the page in its own time zone (see
 * `ClientOnly`). Same shape in both cases, so nothing jumps between them.
 */

const block = "rounded-2xl bg-neutral-900";

/** Title, a row of stat cards, one big card — Journal, Pantry, Partner. */
export function PageSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-4xl flex-1 animate-pulse px-4 pt-5 sm:px-6 sm:pt-6"
      aria-hidden
    >
      <div className="h-9 w-40 rounded-xl bg-neutral-900" />
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-24 ${block}`} />
        ))}
      </div>
      <div className={`mt-5 h-64 ${block}`} />
    </div>
  );
}

/** Title with actions, a filter row, a list of rows — Planner, Thoughts. */
export function ListSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={`mx-auto w-full flex-1 animate-pulse px-4 pt-5 sm:px-6 sm:pt-6 ${
        wide ? "max-w-4xl xl:max-w-none" : "max-w-4xl"
      }`}
      aria-hidden
    >
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-36 rounded-xl bg-neutral-900" />
        <div className="ml-auto h-9 w-24 rounded-xl bg-neutral-900" />
      </div>
      <div className="mt-4 h-9 w-64 max-w-full rounded-xl bg-neutral-900" />
      <div className="mt-8 flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-[4.5rem] ${block}`} />
        ))}
      </div>
    </div>
  );
}

/** The calendar's toolbar over an hour grid. */
export function CalendarSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse flex-col" aria-hidden>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-neutral-800 px-4 py-3 sm:px-6">
        <div className="h-7 w-24 rounded-lg bg-neutral-900" />
        <div className="h-5 w-32 rounded-lg bg-neutral-900" />
        <div className="ml-auto h-9 w-20 rounded-xl bg-neutral-900" />
        <div className="h-8 w-56 rounded-xl bg-neutral-900 phone:w-full desk:order-first desk:ml-auto" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className="h-11 border-t border-neutral-800/60" />
        ))}
      </div>
    </div>
  );
}
