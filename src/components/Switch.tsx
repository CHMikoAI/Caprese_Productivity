"use client";

/**
 * An on/off switch with its label — the iOS control for a setting that takes
 * effect at once. The whole row is the target, not just the knob.
 */
export default function Switch({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-medium text-neutral-200 ${className}`}
    >
      {label}
      <span
        className={`relative h-[1.9375rem] w-[3.1875rem] shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-accent" : "bg-neutral-700"
        }`}
        aria-hidden
      >
        <span
          className={`absolute left-0.5 top-0.5 h-[1.6875rem] w-[1.6875rem] rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </span>
    </button>
  );
}
