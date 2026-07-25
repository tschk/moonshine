import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Overlay a11y: Escape-to-close, focus first focusable on open, restore on close.
 */
export function useOverlayFocus(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
): void {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE);
    // Defer so autoFocus / portal mounts settle.
    const focusId = requestAnimationFrame(() => {
      first?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(focusId);
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose, containerRef]);
}

export { FOCUSABLE };
