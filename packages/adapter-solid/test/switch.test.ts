import { expect, test } from "bun:test";
import { dirname, join } from "node:path";
import {
  Switch,
  Match,
  createRoot,
  createSignal,
  onCleanup,
} from "../src/solid";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";

test("Switch resolves nested accessors and boolean children in first-match order", () => {
  createRoot((stop) => {
    const later = Match({ when: true, children: "later" });
    const first = Match({ when: true, children: "first" });
    const selected = Switch({
      children: [
        false,
        () => [Match({ when: false, children: "no" }), [() => first, later]],
      ],
    });
    expect(selected()).toBe("first");
    expect(Switch({ children: () => later })()).toBe("later");
    expect(Switch({ children: [false, true, []], fallback: "empty" })()).toBe(
      "empty",
    );
    for (const invalid of [null, undefined, {}, "invalid"])
      expect(() => Switch({ children: [invalid, later] as any })).toThrow(
        "Switch children must be Match branches",
      );
    stop();
  });
});

test("reactive nested children retain selected branches and dispose replacements", () => {
  createRoot((stop) => {
    const [item, setItem] = createSignal({ id: "one" });
    const [group, setGroup] = createSignal(0);
    const setups: string[] = [],
      cleanups: string[] = [];
    const first = Match({
      get when() {
        return item();
      },
      children: (value) => {
        setups.push("first");
        onCleanup(() => cleanups.push("first"));
        return () => value().id;
      },
    });
    const second = Match({ when: true, children: () => "second" });
    const selected = Switch({
      get children() {
        return group() === 0 ? [[() => first]] : [false, [second]];
      },
    });
    const retained = selected();
    expect((retained as () => string)()).toBe("one");
    setItem({ id: "two" });
    expect(selected()).toBe(retained);
    expect((selected() as () => string)()).toBe("two");
    expect(setups).toEqual(["first"]);
    setGroup(1);
    expect((selected() as () => string)()).toBe("second");
    expect(cleanups).toEqual(["first"]);
    stop();
  });
});

test("nested keyed Match descriptors still replace on identity changes", () => {
  createRoot((stop) => {
    const [item, setItem] = createSignal({ id: "one" });
    const trace: string[] = [];
    const keyed = Match({
      keyed: true,
      get when() {
        return item();
      },
      children: (value) => {
        trace.push("setup:" + value.id);
        onCleanup(() => trace.push("clean:" + value.id));
        return value.id;
      },
    });
    const selected = Switch({ children: () => [false, [() => keyed]] });
    expect(selected()).toBe("one");
    setItem({ id: "two" });
    expect(selected()).toBe("two");
    expect(trace).toEqual(["setup:one", "clean:one", "setup:two"]);
    stop();
    expect(trace.at(-1)).toBe("clean:two");
  });
});

test("SSR accepts nested lazy Match groups and escapes selected content", () => {
  let ignored = 0;
  expect(
    renderToString(() =>
      h(
        "section",
        null,
        Switch({
          children: [
            false,
            () => [
              Match({
                when: false,
                get children() {
                  ignored++;
                  return "ignored";
                },
              }),
              [Match({ when: true, children: "<selected>" })],
            ],
          ],
          fallback: "empty",
        }),
      ),
    ),
  ).toBe("<section>&lt;selected&gt;</section>");
  expect(ignored).toBe(0);
});

test("nested child shapes match installed Solid 1.9", async () => {
  const reference = await import(
    join(
      dirname(Bun.resolveSync("solid-js/package.json", import.meta.dir)),
      "dist/solid.js",
    )
  );
  const native = await import("../src/solid");
  expect(shapes(native)).toEqual(shapes(reference));
});
function shapes(api: any) {
  return api.createRoot((stop: () => void) => {
    const result = [];
    for (const make of [
      (match: any) => [false, [() => match]],
      (match: any) => () => match,
      () => [false, true, []],
      (match: any) => [null, match],
      (match: any) => [undefined, match],
    ]) {
      try {
        result.push(
          api.Switch({
            children: make(api.Match({ when: true, children: "yes" })),
            fallback: "empty",
          })(),
        );
      } catch {
        result.push("invalid");
      }
    }
    stop();
    return result;
  });
}
