export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="13.6" r="8.4" fill="#E63946" />
      <path
        d="M12 5.4c-1.1-1.9-2.9-3-5-3.1 1.2 1 2 2.3 2.2 3.8"
        stroke="#7C8B6F"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 5.4c1.1-1.9 2.9-3 5-3.1-1.2 1-2 2.3-2.2 3.8"
        stroke="#7C8B6F"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
