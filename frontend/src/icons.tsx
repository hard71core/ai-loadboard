/* Small hand-drawn line-icon set — no icon library dependency for a
handful of glyphs. 24x24 viewBox, stroke = currentColor, so each icon
inherits color from its container. */

type IconProps = { className?: string };

export function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PackageIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RouteIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="19" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6.8 7.6c1.6 1.6 2.8 2 4.7 2 4.6 0 4.6 5 0 5-2 0-3.2.4-4.7 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="0.5 3.4"
      />
    </svg>
  );
}

export function SparkleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z"
        fill="currentColor"
      />
    </svg>
  );
}
