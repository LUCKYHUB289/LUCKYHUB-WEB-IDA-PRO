import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal virtualization for long, uniform lists (hex rows, string tables).
 * The container must have a fixed height and `overflow-auto`.
 */
export function useVirtualWindow(rowCount: number, rowHeight: number, overscan = 8) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    if (ref.current) setScrollTop(ref.current.scrollTop);
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil((height || 480) / rowHeight) + overscan * 2;
  const end = Math.min(rowCount, start + visibleCount);

  return {
    ref,
    onScroll,
    range: { start, end },
    padTop: start * rowHeight,
    padBottom: Math.max(0, (rowCount - end) * rowHeight),
  };
}
