import type { HTMLAttributes, ReactNode } from "react";

export type MarqueeProps = HTMLAttributes<HTMLDivElement> & {
  speed?: number;
  pauseOnHover?: boolean;
  children: ReactNode;
};

export function Marquee({
  speed = 20,
  pauseOnHover = true,
  children,
  style,
  className,
  ...rest
}: MarqueeProps) {
  return (
    <div
      data-ms="marquee"
      className={className}
      style={{
        overflow: "hidden",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          display: "inline-flex",
          gap: 32,
          animation: `ms-marquee ${speed}s linear infinite`,
          animationPlayState: "running",
        }}
        onMouseEnter={(e) => {
          if (pauseOnHover) (e.currentTarget.style.animationPlayState = "paused");
        }}
        onMouseLeave={(e) => {
          if (pauseOnHover) (e.currentTarget.style.animationPlayState = "running");
        }}
      >
        <span>{children}</span>
        <span aria-hidden>{children}</span>
      </div>
      <style>{`@keyframes ms-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}
