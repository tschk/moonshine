import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useOverlayFocus } from "./_focus";

export type CommandItem = { id: string; label: string; onSelect?: () => void };

export type CommandPaletteProps = HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
};

function CommandPaletteOverlay({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      data-ms="command-palette-root"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "start center",
        paddingTop: "15vh",
        zIndex: 80,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function CommandPalettePanel({
  children,
  panelRef,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={panelRef}
      data-ms="command-palette"
      role="dialog"
      aria-label="Command palette"
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(520px, 92vw)",
        background: "var(--ms-surface, #141418)",
        border: "1px solid var(--ms-border, #2a2a30)",
        borderRadius: 12,
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function CommandPaletteInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: 14,
        border: "none",
        borderBottom: "1px solid var(--ms-border, #2a2a30)",
        background: "transparent",
        color: "var(--ms-fg, #f2f2f5)",
        font: "inherit",
        outline: "none",
      }}
    />
  );
}

function CommandPaletteList({ children }: { children: ReactNode }) {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 6,
        maxHeight: 280,
        overflow: "auto",
      }}
    >
      {children}
    </ul>
  );
}

function CommandPaletteItem({
  item,
  onOpenChange,
}: {
  item: CommandItem;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          item.onSelect?.();
          onOpenChange?.(false);
        }}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          color: "var(--ms-fg, #f2f2f5)",
          cursor: "pointer",
          font: "inherit",
          borderRadius: 8,
        }}
      >
        {item.label}
      </button>
    </li>
  );
}

export function CommandPalette({
  open = false,
  onOpenChange,
  items,
  placeholder = "Type a command…",
  style,
  ...rest
}: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onOpenChange?.(false), [onOpenChange]);
  useOverlayFocus(open, close, panelRef);

  const filtered = useMemo(
    () => items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())),
    [items, q],
  );
  if (!open) return null;
  return (
    <CommandPaletteOverlay onClick={close}>
      <CommandPalettePanel panelRef={panelRef} style={style} {...rest}>
        <CommandPaletteInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
        />
        <CommandPaletteList>
          {filtered.map((item) => (
            <CommandPaletteItem
              key={item.id}
              item={item}
              onOpenChange={onOpenChange}
            />
          ))}
        </CommandPaletteList>
      </CommandPalettePanel>
    </CommandPaletteOverlay>
  );
}
