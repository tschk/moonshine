import { expect, test } from "bun:test";
import "../../react/test/dom";
import {
  h,
  render,
  createInsertionRange,
  prepareInsertionRange,
  moveInsertionRange,
  insertionRangeEnd,
} from "../src/dom";
import { createRoot, createSignal, onCleanup } from "../src/reactive";
const SVG = "http://www.w3.org/2000/svg",
  HTML = "http://www.w3.org/1999/xhtml";
test("detached range retains creation namespace for initial dynamic updates, then uses moved parent", () => {
  const svg = document.createElementNS(SVG, "svg");
  document.body.append(svg);
  let start!: Node;
  let write!: (x: number) => unknown;
  const stop = render(
    () => () => {
      const [value, set] = createSignal(0);
      write = set;
      start = createInsertionRange(() => h("a", { "data-value": value() }));
      prepareInsertionRange(start);
      write(1);
      return start;
    },
    svg,
  );
  expect(svg.querySelector("a")!.namespaceURI).toBe(SVG);
  expect(svg.querySelector("a")!.getAttribute("data-value")).toBe("1");
  const host = document.createElement("div");
  const target = document.createComment("target");
  host.append(target);
  document.body.append(host);
  moveInsertionRange(start, target);
  write(2);
  expect(host.querySelector("a")!.namespaceURI).toBe(HTML);
  stop();
  svg.remove();
  host.remove();
});
test("forward-crossed end rejects move and removal preserves foreign siblings with nested ranges", () => {
  let start!: Node;
  const host = document.createElement("div");
  document.body.append(host);
  const stop = render(() => {
    start = createInsertionRange([
      createInsertionRange(() => h("b", {}, "nested")),
      h("span", {}, "owned"),
    ]);
    return start;
  }, host);
  const sentinel = document.createElement("i");
  sentinel.textContent = "foreign";
  const target = document.createComment("target");
  host.append(sentinel, target);
  host.insertBefore(insertionRangeEnd(start), target);
  expect(() => moveInsertionRange(start, target)).toThrow(
    "Invalid insertion range boundaries",
  );
  expect(sentinel.isConnected).toBe(true);
  stop();
  expect(host.textContent).toBe("foreign");
  expect(host.contains(sentinel)).toBe(true);
  host.remove();
});

for (const nested of [false, true]) {
  test(`old range cleanup cancels ${nested ? "nested range" : "ordinary"} insertion before late DOM`, () => {
    const host = document.createElement("div");
    document.body.append(host);
    let stop = () => {};
    let write!: (value: boolean) => unknown;
    let clicks = 0;
    let retained!: HTMLButtonElement;
    stop = render(() => {
      const [value, set] = createSignal(true);
      write = set;
      const old = createInsertionRange(() => {
        onCleanup(() => stop());
        return h("b", {}, "old");
      });
      retained = h("button", { onClick: () => clicks++ }, "new");
      const next = createInsertionRange(retained);
      const read = () => (value() ? old : next);
      return nested ? createInsertionRange(read) : read;
    }, host);
    expect(host.textContent).toBe("old");
    expect(() => write(false)).not.toThrow();
    expect(host.childNodes.length).toBe(0);
    write(true);
    retained.click();
    expect(clicks).toBe(0);
    expect(host.childNodes.length).toBe(0);
    stop();
    host.remove();
  });
}

for (const detached of [false, true]) {
  test(`live outer range reconciles after its nested range owner retires (${detached ? "prepared in fragment" : "attached"})`, () => {
    const host = document.createElement("div");
    const foreign = document.createElement("i");
    foreign.textContent = "foreign";
    host.append(foreign);
    document.body.append(host);
    let outer!: Node;
    let write!: (value: boolean) => unknown;
    let retire!: () => void;
    let cleanups = 0;
    const stop = render(() => {
      const [shown, setShown] = createSignal(true);
      write = setShown;
      const nested = createRoot((dispose) => {
        retire = dispose;
        onCleanup(() => cleanups++);
        return createInsertionRange(() => h("b", {}, "nested"));
      });
      onCleanup(retire);
      outer = createInsertionRange(() => (shown() ? nested : undefined));
      if (detached) prepareInsertionRange(outer);
      return outer;
    }, host);
    const stopOther = render(() => h("span", {}, "other"), host);
    const other = host.querySelector("span")!;
    const end = insertionRangeEnd(outer);
    try {
      expect(host.textContent).toBe("foreignnestedother");
      retire();
      expect(cleanups).toBe(1);
      expect(outer.parentNode).toBe(host);
      expect(end.parentNode).toBe(host);
      expect(outer.nextSibling).toBe(end);
      expect(() => write(false)).not.toThrow();
      expect(host.textContent).toBe("foreignother");
      expect(host.contains(foreign)).toBe(true);
      expect(host.querySelector("span")).toBe(other);
      stop();
      stop();
      retire();
      expect(cleanups).toBe(1);
      expect(host.textContent).toBe("foreignother");
      expect(host.querySelector("span")).toBe(other);
      stopOther();
      expect(host.textContent).toBe("foreign");
      expect(host.firstChild).toBe(foreign);
    } finally {
      stop();
      stopOther();
      host.remove();
    }
  });
}

for (const disconnected of [false, true]) {
  test(`alive nested range ${disconnected ? "disconnected" : "moved out"} still rejects outer movement`, () => {
    const host = document.createElement("div");
    const elsewhere = document.createElement("div");
    const foreign = document.createElement("i");
    foreign.textContent = "foreign";
    const target = document.createComment("target");
    const otherTarget = document.createComment("other target");
    elsewhere.append(otherTarget);
    document.body.append(host, elsewhere);
    let outer!: Node, nested!: Node;
    const stop = render(() => {
      nested = createInsertionRange(() => h("b", {}, "nested"));
      outer = createInsertionRange(nested);
      return outer;
    }, host);
    host.append(foreign, target);
    try {
      if (disconnected) nested.parentNode!.removeChild(nested);
      else moveInsertionRange(nested, otherTarget);
      expect(() => moveInsertionRange(outer, target)).toThrow(
        "Invalid insertion range boundaries",
      );
      expect(host.contains(foreign)).toBe(true);
      expect(elsewhere.contains(otherTarget)).toBe(true);
      stop();
      expect(host.textContent).toBe("foreign");
      expect(host.contains(foreign)).toBe(true);
      expect(elsewhere.childNodes.length).toBe(1);
      expect(elsewhere.firstChild).toBe(otherTarget);
    } finally {
      stop();
      host.remove();
      elsewhere.remove();
    }
  });
}
