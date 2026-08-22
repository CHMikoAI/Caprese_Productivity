/**
 * Shown while a page's data is on the way. Without it a navigation paints
 * nothing at all until the server render lands — the app looked frozen on a
 * slow connection. The shell (top bar, tab bar) is already up by then, so this
 * only stands in for the page body.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 animate-pulse px-4 py-6 sm:px-6">
      <div className="h-8 w-44 rounded-xl bg-neutral-900" />
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-neutral-900" />
        ))}
      </div>
      <div className="mt-5 h-72 rounded-2xl bg-neutral-900" />
    </div>
  );
}
