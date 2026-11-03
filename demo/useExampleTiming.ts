import { useLayoutEffect, useRef, useState } from 'react';

/** Demo-only elapsed time; no instrumentation or callback in the public API. */
export function useExampleTiming(example: string) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    example: string;
    ms: number;
  } | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let start = performance.now(),
      frame = 0,
      wasBusy = true,
      finished = false;
    const busy = () =>
      host.querySelector('.flow-diagram')?.getAttribute('aria-busy') !==
      'false';
    setResult(null);
    const update = () => {
      if (busy()) {
        if (!wasBusy) {
          start = performance.now();
          setResult(null);
        }
        wasBusy = true;
        finished = false;
        cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      wasBusy = false;
      if (finished || frame) return;
      // Two frame callbacks provide a paint opportunity after the SVG commit.
      // This is elapsed "ready" time, not an exact paint/CPU measurement.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!busy()) {
            finished = true;
            setResult({ example, ms: performance.now() - start });
          }
        });
      });
    };
    const observer = new MutationObserver(update);
    observer.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-busy'],
    });
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [example]);
  return { hostRef, readyMs: result?.example === example ? result.ms : null };
}
