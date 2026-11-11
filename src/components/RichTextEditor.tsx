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
  autoFocus = false,
  ariaLabel,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  expanded?: boolean;
  /** Put the caret in the editor as soon as it mounts. */
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [empty, setEmpty] = useState(
    () => value.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim() === "",
  );

  // Set the initial content once — never on every render, or the caret jumps.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = sanitizeHtml(value ?? "");
    if (autoFocus) {
      el.focus();
      // Caret to the end, so a transcript can be continued straight away.
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
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
    ref.current?.focus();
    document.execCommand(cmd, false);
    handleInput();
    refreshActive();
  }

  return (
    <div
      className={`overflow-hidden rounded-xl bg-neutral-800 focus-within:ring-2 focus-within:ring-accent/40 ${
        expanded ? "flex min-h-0 flex-1 flex-col" : ""
      }`}
    >
      <div
        className="flex items-center gap-0.5 border-b border-neutral-700/60 px-1 py-1"
        role="toolbar"
        aria-label="Formatting"
      >
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
              aria-pressed={Boolean(active[c.cmd])}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors sm:h-8 sm:w-8 ${
                active[c.cmd]
                  ? "bg-neutral-600 text-white"
                  : "text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
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
          aria-label={ariaLabel ?? placeholder}
          onInput={handleInput}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onFocus={refreshActive}
          onPaste={(e) => {
            // Paste as plain text: formatting from other apps (fonts, colours,
            // backgrounds) has no business in a note, and none of it survives
            // the sanitizer on save anyway.
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          className={`overflow-y-auto px-3.5 py-2.5 text-sm leading-relaxed text-neutral-100 focus:outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 ${
            expanded ? "h-full" : "min-h-[150px]"
          }`}
        />
        {empty && placeholder && (
          <p className="pointer-events-none absolute left-3.5 top-2.5 text-sm text-neutral-500">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
}
