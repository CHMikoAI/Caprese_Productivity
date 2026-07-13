// Hard guard: importing this module from a Client Component fails the build,
// so the service-role key can never end up in the browser bundle.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Server-only Supabase client using the service-role key. Returns null when
 * the env vars are missing so the UI can render a setup hint instead of
 * crashing.
 */
export function getSupabase(): SupabaseClient | null {
  if (cached === undefined) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    cached =
      url && key
        ? createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
  }
  return cached;
}
