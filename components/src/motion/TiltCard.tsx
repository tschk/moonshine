import type { HTMLAttributes } from "react";
import { useRef, useState } from "react";

export type TiltCardProps = HTMLAttributes<HTMLDivElement> & {
  maxTilt?: number;
};

export function TiltCard({
  maxTilt = 10,
  children,
  style,
  ...rest
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState(
    "perspective(800px) rotateX(0deg) rotateY(0deg)",
  );

  return (
    <div
      ref={ref}
      data-ms="tilt-card"
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        setTransform(
          `perspective(800px) rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg)`,
        );
      }}
      onMouseLeave={() =>
        setTransform("perspective(800px) rotateX(0deg) rotateY(0deg)")
      }
      style={{
        transform,
        transition: "transform 120ms ease-out",
        background: "var(--ms-surface, #141418)",
        border: "1px solid var(--ms-border, #2a2a30)",
        borderRadius: 12,
        padding: 16,
        color: "var(--ms-fg, #f2f2f5)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
