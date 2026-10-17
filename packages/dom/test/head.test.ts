import { afterEach, expect, test } from "bun:test";
import "../../react/test/dom";
import { h, render } from "../src/dom";
import { head, title } from "../src/head";
import {
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  type Owner,
} from "../src/reactive";
import { renderToString } from "../src/ssr";
import { getContext, setContext } from "../src/component";

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  document.head.replaceChildren();
});
const metas = () =>
  [...document.head.querySelectorAll("meta[name=description]")].map((node) =>
    node.getAttribute("content"),
  );
function start(read: () => void): () => void {
  return createRoot((stop) => {
    stops.push(stop);
    read();
    return stop;
  });
}

test("head nodes are owned independently while title writes persist", () => {
  document.head.innerHTML =
    '<title>Existing</title><meta name="description" content="existing">';
  const [parent, setParent] = createSignal("Parent <&");
  const [child, setChild] = createSignal("Child <&");
  const parentStop = start(() =>
    head(() => {
      title(parent);
      return h("meta", { name: "description", content: parent });
    }),
  );
  const childStop = start(() =>
    head(() => {
      title(child);
      return [
        h("meta", { name: "description", content: child }),
        h("link", { rel: "canonical", href: "/child" }),
      ];
    }),
  );
  expect(document.title).toBe("Child <&");
  expect(metas()).toEqual(["existing", "Parent <&", "Child <&"]);
  setParent("Parent changed");
  expect(document.title).toBe("Parent changed");
  setChild("Child changed");
  expect(document.title).toBe("Child changed");
  childStop();
  expect(metas()).toEqual(["existing", "Parent changed"]);
  expect(document.head.querySelector("link")).toBeNull();
  expect(document.title).toBe("Child changed");
  setChild("stopped child");
  expect(document.title).toBe("Child changed");
  parentStop();
  expect(metas()).toEqual(["existing"]);
  setParent("stopped parent");
  expect(document.title).toBe("Child changed");
});

test("invalid ownership and SSR reject before reading children or title", () => {
  let reads = 0;
  expect(() =>
    head(() => {
      reads++;
      return null;
    }),
  ).toThrow("live browser owner");
  expect(() =>
    title(() => {
      reads++;
      return "bad";
    }),
  ).toThrow("live browser owner");
  let owner!: Owner;
  createRoot((stop) => {
    owner = getOwner()!;
    stop();
  });
  expect(() =>
    runWithOwner(owner, () =>
      head(() => {
        reads++;
        return null;
      }),
    ),
  ).toThrow("live browser owner");
  expect(() =>
    renderToString(() => {
      head(() => {
        reads++;
        return null;
      });
      return null;
    }),
  ).toThrow("live browser owner");
  expect(reads).toBe(0);
});

test("failed child setup and parent failure clean head work without hiding errors", () => {
  let cleaned = 0;
  expect(() =>
    start(() =>
      head(() => {
        onCleanup(() => cleaned++);
        throw new Error("head setup failed");
      }),
    ),
  ).toThrow("head setup failed");
  expect(cleaned).toBe(1);
  expect(() =>
    start(() => {
      head(() => h("meta", { name: "description", content: "owned" }));
      throw new Error("parent failed");
    }),
  ).toThrow("parent failed");
  expect(metas()).toEqual([]);
});

test("child setup disposing the parent leaves no head nodes or subscriptions", () => {
  const [value, setValue] = createSignal("initial");
  let reads = 0;
  createRoot((stop) => {
    head(() => {
      title(() => {
        reads++;
        return value();
      });
      stop();
      return h("meta", { name: "description", content: value });
    });
  });
  expect(metas()).toEqual([]);
  const before = reads;
  setValue("later");
  expect(reads).toBe(before);
});

test("reactive title reads retain their declaring component context", () => {
  const key = Symbol("head context");
  const [value, setValue] = createSignal("one");
  const target = document.createElement("main");
  function App() {
    setContext(key, "context:");
    head(() => {
      title(() => getContext<string>(key)! + value());
      return null;
    });
    return h("p", null, "body");
  }
  const stop = render(() => h(App, {}), target);
  stops.push(stop);
  expect(document.title).toBe("context:one");
  setValue("two");
  expect(document.title).toBe("context:two");
});
