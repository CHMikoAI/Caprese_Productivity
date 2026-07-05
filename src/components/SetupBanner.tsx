export default function SetupBanner() {
  return (
    <div className="mx-4 mt-4 rounded-xl border border-neutral-800 border-l-2 border-l-accent bg-neutral-900/60 px-4 py-3 text-sm text-neutral-300 sm:mx-6">
      <span className="font-medium text-neutral-100">Supabase is not connected</span>
      {" — "}
      the UI works, but nothing is saved. Set{" "}
      <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs">SUPABASE_URL</code>{" "}
      and{" "}
      <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs">
        SUPABASE_SERVICE_ROLE_KEY
      </code>{" "}
      in <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs">.env.local</code>,
      run <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs">supabase/schema.sql</code>{" "}
      in the Supabase SQL editor, then restart the dev server.
    </div>
  );
}
