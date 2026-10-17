import {
  normalizeClass,
  normalizeStyle,
  normalizeStaticStyle,
} from "../src/normalize";
declare function Child(props: {
  class?: string;
  style?: string | Record<string, string | number>;
}): void;
Child({
  class: normalizeClass(["active"]),
  style: normalizeStyle({ color: "red" }),
});
Child({ style: normalizeStaticStyle("color:red") });
Child({ style: normalizeStyle(["color:red", { opacity: 1 }]) });
Child({ style: normalizeStyle([["font-size:12px"], { opacity: 1 }]) });
// @ts-expect-error object values remain objects, not widened to CSS scalar values
Child({ style: normalizeStyle({ color: { invalid: true } }) });

declare const dynamicEntries: unknown[];
// @ts-expect-error unknown array entries cannot promise scalar CSS declarations
Child({ style: normalizeStyle(dynamicEntries) });
// @ts-expect-error arrays retain invalid object-valued declarations
Child({ style: normalizeStyle([{ color: { invalid: true } }]) });
