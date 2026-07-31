import type { HTMLAttributes } from "react";

export type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  src?: string;
  alt?: string;
  initials?: string;
  size?: number;
};

export function Avatar({
  src,
  alt = "",
  initials,
  size = 40,
  style,
  ...rest
}: AvatarProps) {
  return (
    <div
      data-ms="avatar"
      role="img"
      aria-label={alt || initials || "avatar"}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ms-surface, #141418)",
        color: "var(--ms-fg, #f2f2f5)",
        fontSize: size * 0.4,
        fontWeight: 600,
        ...style,
      }}
      {...rest}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        (initials ?? "?").slice(0, 2)
      )}
    </div>
  );
}
