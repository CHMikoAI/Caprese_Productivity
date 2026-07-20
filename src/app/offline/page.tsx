import Logo from "@/components/Logo";

export const metadata = { title: "Offline — Caprese" };

/** Served by the service worker when a page load fails without a network. */
export default function OfflinePage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-sm flex-col items-center text-center">
        <Logo className="h-12 w-12 opacity-60" />
        <h1 className="mt-5 text-lg font-semibold text-neutral-100">
          You&rsquo;re offline
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          Caprese keeps your plan on the server, so it needs a connection.
          Reconnect and try again.
        </p>
      </div>
    </div>
  );
}
