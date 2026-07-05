"use client";

import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((msg: string) => {
    setMessage(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 4000);
  }, []);

  return { message, show };
}

export default function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm text-neutral-100 shadow-lg">
      {message}
    </div>
  );
}
