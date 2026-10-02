import { cn } from "@moa/ui";

/**
 * Renders one of the design's exported SVGs.
 *
 * The files carry baked stroke colours because Figma exported each one in the
 * state it appears in the wireframe — ticket-01 black (active, on lime), the
 * rest white (inactive, on grey) or #979797 (row actions). An interactive app
 * needs the same glyph in whichever state the user is in, so the SVG is used
 * as a mask and the colour comes from `currentColor`. The asset itself is
 * untouched; only how it is painted changes.
 */
export function Icon({
  name,
  className,
  size = 24,
}: {
  name: string;
  className?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        width: size,
        height: size,
        maskImage: `url(/icons/${name}.svg)`,
        WebkitMaskImage: `url(/icons/${name}.svg)`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
