import type { HTMLAttributes, ReactNode } from "react";
import { useState } from "react";

export type AccordionItem = { id: string; title: ReactNode; content: ReactNode };

export type AccordionProps = HTMLAttributes<HTMLDivElement> & {
  items: AccordionItem[];
  type?: "single" | "multiple";
};

export function Accordion({ items, type = "single", style, ...rest }: AccordionProps) {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (id: string) => {
    setOpen((prev) => {
      const has = prev.includes(id);
      if (type === "single") return has ? [] : [id];
      return has ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };
  return (
    <div data-ms="accordion" style={style} {...rest}>
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        return (
          <div key={item.id} data-ms="accordion-item" style={{ borderBottom: "1px solid var(--ms-border, #2a2a30)" }}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(item.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 0",
                background: "transparent",
                border: "none",
                color: "var(--ms-fg, #f2f2f5)",
                cursor: "pointer",
                font: "inherit",
                fontWeight: 600,
              }}
            >
              {item.title}
            </button>
            {isOpen ? <div style={{ paddingBottom: 12 }}>{item.content}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
