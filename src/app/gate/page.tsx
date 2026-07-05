"use client";

import { useState } from "react";
import Logo from "@/components/Logo";

export default function GatePage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.replace("/calendar");
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Something went wrong.");
    } catch {
      setError("Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo className="h-12 w-12" />
          <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
            Caprese
          </h1>
          <p className="text-sm text-neutral-500">Enter the password to continue.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
          {error && <p className="text-center text-sm text-accent">{error}</p>}
        </form>
      </div>
    </div>
  );
}
