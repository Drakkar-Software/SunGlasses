interface Props {
  /** Size in pixels (width; height is proportional). Default: 28 */
  size?: number;
  className?: string;
}

/** Minimal inline SVG sunglasses glyph — the brand mark. */
export function SunglassesMark({ size = 28, className }: Props) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={Math.round(size * 0.55)}
      viewBox="0 0 20 11"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Left lens */}
      <rect x="0.5" y="1" width="8" height="7.5" rx="2.5" fill="var(--color-lens)" />
      {/* Left lens glare highlight */}
      <path
        d="M2 2.5 L4 2"
        stroke="white"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* Bridge */}
      <path
        d="M8.5 4.75h3"
        stroke="var(--color-lens)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Right lens */}
      <rect x="11.5" y="1" width="8" height="7.5" rx="2.5" fill="var(--color-lens)" />
      {/* Right lens glare highlight */}
      <path
        d="M13 2.5 L15 2"
        stroke="white"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}
