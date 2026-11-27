import Image from "next/image";

/**
 * The Caprese tomato. Decorative wherever it appears (the name is always
 * written next to it), so it carries no alt text. Served as-is from
 * /icons — a public path, so the gate and the offline page can show it too.
 */
export default function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/logo.png"
      alt=""
      width={256}
      height={256}
      unoptimized
      loading="eager"
      draggable={false}
      className={`select-none object-contain ${className ?? ""}`}
    />
  );
}
