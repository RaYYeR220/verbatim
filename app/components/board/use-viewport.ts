import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.04;
export const MAX_SCALE = 1.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Pan and zoom for the board: wheel pans, ctrl/⌘ + wheel or pinch zooms
 * around the pointer, dragging empty space pans. World → screen is
 * `screen = world * scale + offset`.
 */
export function useViewport(container: RefObject<HTMLElement | null>) {
  const [vp, setVp] = useState<Viewport>({ x: 120, y: 120, scale: 0.8 });
  const vpRef = useRef(vp);
  vpRef.current = vp;

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = container.current?.getBoundingClientRect();
    const v = vpRef.current;
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }, [container]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = container.current?.getBoundingClientRect();
    setVp((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      const wx = (sx - v.x) / v.scale;
      const wy = (sy - v.y) / v.scale;
      return { scale, x: sx - wx * scale, y: sy - wy * scale };
    });
  }, [container]);

  /**
   * Fits `bounds` into view. With `minScale`, never zooms out past it: the view
   * then starts at the top-left of the content instead of shrinking cards
   * until they can't be read.
   */
  const fit = useCallback(
    (bounds: { x: number; y: number; w: number; h: number } | null, opts: { padding?: number; minScale?: number } = {}) => {
      const el = container.current;
      const padding = opts.padding ?? 80;
      if (!el || !bounds || bounds.w <= 0 || bounds.h <= 0) return;
      const { width, height } = el.getBoundingClientRect();
      const fitted = clamp(Math.min((width - padding * 2) / bounds.w, (height - padding * 2) / bounds.h), MIN_SCALE, 1);
      if (opts.minScale && fitted < opts.minScale) {
        const scale = opts.minScale;
        setVp({ scale, x: padding / 2 - bounds.x * scale, y: padding / 2 - bounds.y * scale });
        return;
      }
      setVp({
        scale: fitted,
        x: (width - bounds.w * fitted) / 2 - bounds.x * fitted,
        y: (height - bounds.h * fitted) / 2 - bounds.y * fitted,
      });
    },
    [container],
  );

  /** Smoothly bring a world rect into view (used when the agent works off-screen). */
  const reveal = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      const el = container.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      const v = vpRef.current;
      const left = rect.x * v.scale + v.x;
      const top = rect.y * v.scale + v.y;
      const right = left + rect.w * v.scale;
      const bottom = top + rect.h * v.scale;
      const margin = 60;
      if (left >= margin && top >= margin && right <= width - margin && bottom <= height - margin) return;
      setVp({ ...v, x: width / 2 - (rect.x + rect.w / 2) * v.scale, y: height / 2 - (rect.y + rect.h / 2) * v.scale });
    },
    [container],
  );

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0022));
      } else {
        setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [container, zoomAt]);

  const panBy = useCallback((dx: number, dy: number) => setVp((v) => ({ ...v, x: v.x + dx, y: v.y + dy })), []);

  return { vp, setVp, toWorld, zoomAt, fit, reveal, panBy };
}
