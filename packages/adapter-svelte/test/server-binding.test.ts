import { expect, test } from "bun:test";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import { onDestroy } from "../src/svelte";
import { afterRender, createServerProp, settle } from "../src/ssr";

test("server bindings stabilize buffered parent text with one-time setup and accepted cleanup", () => {
  for (const initial of [undefined, 1]) {
    for (const assigned of [false, true]) {
      const trace: unknown[] = [];
      let parentSetups = 0;
      const Child = (props: object) => {
        const value = createServerProp<number>(props, "value", () => 3);
        trace.push(["setup", value.value]);
        if (assigned) value.value = 5;
        onDestroy(() => trace.push(["child", value.value]));
        return afterRender(h("p", null, value.value), value.commit);
      };
      const Parent = () => {
        parentSetups++;
        let value = initial;
        onDestroy(() => trace.push(["parent", value]));
        return settle((invalidate) =>
          h(
            "section",
            null,
            h("i", null, value),
            h(Child, {
              get value() {
                return value;
              },
              set value(next) {
                value = next;
                invalidate();
              },
            }),
            h("b", null, value),
          ),
        );
      };
      const finalChild = assigned ? 5 : (initial ?? 3);
      const finalParent = initial ?? finalChild;
      expect(renderToString(() => h(Parent, {}))).toBe(
        `<section><i>${finalParent}</i><p>${finalChild}</p><b>${finalParent}</b></section>`,
      );
      expect(parentSetups).toBe(1);
      expect(trace).toEqual([
        ["setup", initial ?? 3],
        ...(initial === undefined ? [["setup", finalParent]] : []),
        ["child", finalChild],
        ["parent", finalParent],
      ]);
    }
  }
});

test("failed server child serialization skips binding publication and discarded destroy callbacks", () => {
  const trace: unknown[] = [];
  const Parent = () => {
    let value: number | undefined;
    onDestroy(() => trace.push(["parent", value]));
    return settle((invalidate) =>
      h(() => {
        const prop = createServerProp<number>(
          {
            get value() {
              return value;
            },
            set value(next) {
              value = next;
              invalidate();
            },
          },
          "value",
          () => 3,
        );
        onDestroy(() => trace.push("discarded child"));
        return afterRender(
          h(
            "select",
            { value: "missing" },
            h("option", { value: "present" }, "present"),
          ),
          prop.commit,
        );
      }, {}),
    );
  };
  expect(() => renderToString(() => h(Parent, {}))).toThrow(
    "no matching option",
  );
  expect(trace).toEqual([["parent", undefined]]);
});
