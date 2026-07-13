"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";

const PIN_LENGTH = 4;

export default function GatePage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(value: string) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
      if (res.ok) {
        window.location.replace("/calendar");
        return;
      }
      setError(true);
      setShake(true);
      setPin("");
      setBusy(false);
      window.setTimeout(() => {
        setShake(false);
        inputRef.current?.focus();
      }, 400);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
    setPin(digits);
    setError(false);
    // No Enter needed — as soon as all four digits are in, submit.
    if (digits.length === PIN_LENGTH) submit(digits);
  }

  return (
    <div className="relative flex flex-1 items-center justify-center px-4">
      {/* subtle on-brand ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm rounded-3xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl backdrop-blur">
        <div className="flex flex-col items-center text-center">
          {/* icon box with the Caprese logo */}
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800/80 shadow-lg shadow-accent/20 ring-1 ring-white/10">
            <Logo className="h-8 w-8" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-neutral-50">
            Enter PIN
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            Enter your 4-digit PIN to continue
          </p>

          {/* pin boxes */}
          <div
            className={`relative mt-7 flex gap-3 ${
              shake ? "animate-[shake_0.4s_ease-in-out]" : ""
            }`}
            onClick={() => inputRef.current?.focus()}
          >
            <input
              ref={inputRef}
              value={pin}
              onChange={onChange}
              type="tel"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={PIN_LENGTH}
              disabled={busy}
              autoFocus
              aria-label="4-digit PIN"
              className="absolute inset-0 h-full w-full cursor-default opacity-0"
            />
            {Array.from({ length: PIN_LENGTH }, (_, i) => {
              const filled = i < pin.length;
              return (
                <div
                  key={i}
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors ${
                    error
                      ? "border-accent/70 bg-accent/10"
                      : filled
                        ? "border-neutral-500 bg-neutral-800"
                        : "border-neutral-700 bg-neutral-800/40"
                  }`}
                >
                  {filled && (
                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-100" />
                  )}
                </div>
              );
            })}
          </div>

          <p
            className={`mt-3 h-4 text-sm text-accent transition-opacity ${
              error ? "opacity-100" : "opacity-0"
            }`}
          >
            Wrong PIN
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
