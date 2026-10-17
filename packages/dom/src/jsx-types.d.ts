import type { DOMChild } from "./dom";

/** Opt-in source checking only; Crepus lowers JSX, not a JSX runtime. */
declare global {
  namespace JSX {
    type Element = DOMChild;
    // Component props are checked at JSX use sites; this admits any prop shape.
    type ElementType = keyof IntrinsicElements | ((props: any) => DOMChild);
    interface ElementChildrenAttribute {
      children: {};
    }
    type IntrinsicElements = {
      [K in keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap]: Record<
        string,
        unknown
      > & { children?: DOMChild };
    };
  }
}
