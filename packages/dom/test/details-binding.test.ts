import { afterEach, expect, test } from "bun:test";
import { bindOpen } from "../src/binding";
import { h, render } from "../src/dom";
import { h as serverH, renderToString } from "../src/ssr";
import {
  createRoot,
  createSignal,
  getOwner,
  runWithOwner,
} from "../src/reactive";
import "../../react/test/dom";

let stop = () => {};
afterEach(() => {
  stop();
  document.body.replaceChildren();
});

test("details bindings synchronize toggle events after user listeners and stop with their owner", () => {
  for (const initial of [undefined, null, false]) {
    const [value, set] = createSignal<boolean | null | undefined>(initial);
    const trace: unknown[] = [];
    const container = document.createElement("main");
    document.body.append(container);
    let details!: HTMLDetailsElement;
    stop = render(() => {
      details = h(
        "details",
        { open: false, onToggle: () => trace.push(["user", value()]) },
        h("summary", null, "summary"),
      );
      bindOpen(details, value, (next) => {
        trace.push(["binding", next]);
        set(next);
      });
      return details;
    }, container);
    expect(details.open).toBe(false);
    expect(value()).toBe(initial);
    expect(trace).toEqual([]);
    details.dispatchEvent(new Event("toggle"));
    expect(trace).toEqual([
      ["user", initial],
      ["binding", false],
    ]);
    expect(value()).toBe(false);
    set(true);
    expect(details.open).toBe(true);
    set(false);
    expect(details.open).toBe(false);
    stop();
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    expect(value()).toBe(false);
  }
});

test("details binding validation rejects unsupported elements and disposed ownership", () => {
  const details = document.createElement("details");
  expect(() =>
    bindOpen(
      details,
      () => false,
      () => {},
    ),
  ).toThrow("live native owner");
  let owner: ReturnType<typeof getOwner>;
  createRoot((dispose) => {
    owner = getOwner();
    expect(() =>
      bindOpen(
        document.createElement("div") as HTMLDetailsElement,
        () => false,
        () => {},
      ),
    ).toThrow("require details");
    expect(() => bindOpen(details, null as any, () => {})).toThrow(
      "getter/setter",
    );
    expect(() => bindOpen(details, () => false, null as any)).toThrow(
      "getter/setter",
    );
    dispose();
  });
  expect(() =>
    runWithOwner(owner, () =>
      bindOpen(
        details,
        () => false,
        () => {},
      ),
    ),
  ).toThrow("live native owner");
});

test("details SSR emits only a boolean open snapshot", () => {
  for (const open of [undefined, null, false, true])
    expect(
      renderToString(() =>
        serverH("details", { open }, serverH("summary", null, "summary")),
      ),
    ).toBe(
      `<details${open ? ' open=""' : ""}><summary>summary</summary></details>`,
    );
});
