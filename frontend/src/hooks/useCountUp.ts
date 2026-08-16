import { useEffect, useRef, useState } from "react";

/** Animates a number from its previous value up (or down) to `target` over
`durationMs`, via requestAnimationFrame — no dependency, cheap enough for a
couple of stat counters. Purely cosmetic: the displayed value always lands
exactly on `target`, this only smooths how it gets there. */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  valueRef.current = value;

  useEffect(() => {
    const start = valueRef.current;
    const delta = target - start;
    if (delta === 0) return;

    let frame: number;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(start + delta * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
