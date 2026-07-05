export const GATE_COOKIE = "caprese_gate";

/**
 * Token stored in the gate cookie: a hash of the configured password, so the
 * password itself never lives in the browser. Runs in both the proxy (edge)
 * and route handlers via Web Crypto.
 */
export async function gateToken(): Promise<string> {
  const password = process.env.APP_PASSWORD ?? "";
  const bytes = new TextEncoder().encode(`caprese-gate:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
