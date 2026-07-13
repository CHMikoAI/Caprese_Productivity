import Image from "next/image";

/**
 * Ingredient / salad illustration. `src` comes from the server (PNG when the
 * hand-made artwork exists in public/pantry, bundled SVG fallback otherwise).
 * SVGs skip the optimizer; PNGs are resized through it.
 */
export default function PantryArt({
  src,
  alt,
  size,
  className,
}: {
  src: string;
  alt: string;
  size: number;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized={src.endsWith(".svg")}
      // The pantry is a small, image-centric page (and cards flip into view);
      // eager loading avoids pop-in during the reveal animations.
      loading="eager"
      className={className}
      draggable={false}
    />
  );
}
