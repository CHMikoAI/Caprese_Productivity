"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, List, ListOrdered, Strikethrough } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";

const COMMANDS = [
  { cmd: "bold", icon: Bold, label: "Bold" },
  { cmd: "italic", icon: Italic, label: "Italic" },
  { cmd: "strikeThrough", icon: Strikethrough, label: "Strikethrough" },
  { cmd: "insertUnorderedList", icon: List, label: "Bullet list" },
  { cmd: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
] as const;

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  expanded = false,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  expanded?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [empty, setEmpty] = useState(true);

  // Set the initial content once — never on every render, or the caret jumps.
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = sanitizeHtml(value ?? "");
      setEmpty((ref.current.textContent ?? "").trim() === "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshActive() {
    const next: Record<string, boolean> = {};
    for (const c of COMMANDS) {
      try {
        next[c.cmd] = document.queryCommandState(c.cmd);
      } catch {
        next[c.cmd] = false;
      }
    }
    setActive(next);
  }

  function handleInput() {
    const el = ref.current;
    if (!el) return;
    setEmpty((el.textContent ?? "").trim() === "");
    onChange(el.innerHTML);
  }

  function exec(cmd: string) {
    document.execCommand(cmd, false);
    ref.current?.focus();
    handleInput();
    refreshActive();
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 focus-within:border-accent ${
        expanded ? "flex min-h-0 flex-1 flex-col" : ""
      }`}
    >
      <div className="flex items-center gap-0.5 border-b border-neutral-800 px-1 py-1">
        {COMMANDS.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.cmd}
              type="button"
              // Keep the text selection while clicking the toolbar.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(c.cmd)}
              title={c.label}
              aria-label={c.label}
              className={`rounded-md p-1.5 transition-colors ${
                active[c.cmd]
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <div className={`relative ${expanded ? "min-h-0 flex-1" : ""}`}>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={handleInput}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onFocus={refreshActive}
          className={`overflow-y-auto px-3 py-2.5 text-sm leading-relaxed text-neutral-100 focus:outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 ${
            expanded ? "h-full" : "min-h-[150px]"
          }`}
        />
        {empty && placeholder && (
          <p className="pointer-events-none absolute left-3 top-2.5 text-sm text-neutral-600">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
}
