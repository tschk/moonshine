import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { navigate } from "@tschk/moonshine/router";
import {
  NotFoundError,
  RedirectError,
  notFound,
  permanentRedirect,
  redirect,
  splitLocation,
  useRouter,
  usePathname,
  useSearchParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from "../src/navigation";
import { render, setLocation, cleanup } from "./dom";

/** Renders `hook` and returns whatever it produced, as text. */
async function readHook(hook: () => string): Promise<string> {
  function Probe() {
    return createElement("i", { id: "out" }, hook());
  }
  const container = await render(createElement(Probe));
  return container.querySelector("#out")?.textContent ?? "";
}

function RefreshDuringSSRProbe() {
  useRouter().refresh();
  return null;
}

describe("next/navigation", () => {
  afterEach(cleanup);

  beforeEach(() => {
    setLocation("/start");
    navigate("/start");
  });

  describe("splitLocation", () => {
    test("splits a path and query", () => {
      expect(splitLocation("/a/b?x=1&y=2")).toEqual(["/a/b", "x=1&y=2"]);
    });

    test("leaves a bare path alone", () => {
      expect(splitLocation("/a/b")).toEqual(["/a/b", ""]);
    });

    test("handles a trailing question mark", () => {
      expect(splitLocation("/a?")).toEqual(["/a", ""]);
    });

    test("only splits on the first question mark", () => {
      expect(splitLocation("/a?q=1?2")).toEqual(["/a", "q=1?2"]);
    });
  });

  test("usePathname returns the path without the query", async () => {
    navigate("/products/42?sort=asc");
    expect(await readHook(() => usePathname())).toBe("/products/42");
  });

  test("useSearchParams reads the query the router carries", async () => {
    navigate("/products?sort=asc&page=3");
    const read = await readHook(() => {
      const params = useSearchParams();
      return `${params.get("sort")}|${params.get("page")}`;
    });
    expect(read).toBe("asc|3");
  });

  // A mounted tree, not a fresh render: the issue this guards was that a
  // navigation changing only the query wrote the same pathname to the location
  // signal, notified nobody, and left every already-mounted `useSearchParams`
  // caller showing the previous query. Re-rendering from scratch would pass
  // either way and prove nothing.
  test("useSearchParams updates a mounted tree when only the query changes", async () => {
    navigate("/settings?section=privacy");
    function Probe() {
      return createElement(
        "i",
        { id: "out" },
        useSearchParams().get("section") ?? "none",
      );
    }
    const container = await render(createElement(Probe));
    expect(container.querySelector("#out")?.textContent).toBe("privacy");

    await act(async () => {
      navigate("/settings?section=developer");
    });
    expect(container.querySelector("#out")?.textContent).toBe("developer");
  });

  test("usePathname ignores the query a mounted tree navigated to", async () => {
    navigate("/settings?section=privacy");
    function Probe() {
      return createElement("i", { id: "out" }, usePathname());
    }
    const container = await render(createElement(Probe));
    await act(async () => {
      navigate("/settings?section=developer");
    });
    expect(container.querySelector("#out")?.textContent).toBe("/settings");
  });

  test("useSearchParams is empty when there is no query", async () => {
    navigate("/plain");
    expect(await readHook(() => [...useSearchParams()].length.toString())).toBe(
      "0",
    );
  });

  test("useSelectedLayoutSegments splits the path into segments", async () => {
    navigate("/dashboard/settings/profile");
    expect(await readHook(() => useSelectedLayoutSegments().join(","))).toBe(
      "dashboard,settings,profile",
    );
  });

  test("useSelectedLayoutSegment returns the first segment", async () => {
    navigate("/dashboard/settings");
    expect(await readHook(() => useSelectedLayoutSegment() ?? "null")).toBe(
      "dashboard",
    );
  });

  test("useSelectedLayoutSegment is null at the root", async () => {
    navigate("/");
    expect(await readHook(() => useSelectedLayoutSegment() ?? "null")).toBe(
      "null",
    );
  });

  test("router.push navigates", async () => {
    let router!: ReturnType<typeof useRouter>;
    function Probe() {
      router = useRouter();
      return null;
    }
    await render(createElement(Probe));
    await act(async () => {
      router.push("/pushed");
    });
    expect(window.location.pathname).toBe("/pushed");
  });

  test("router.replace navigates without a new history entry", async () => {
    let router!: ReturnType<typeof useRouter>;
    function Probe() {
      router = useRouter();
      return null;
    }
    await render(createElement(Probe));
    const before = window.history.length;
    await act(async () => {
      router.replace("/replaced");
    });
    expect(window.location.pathname).toBe("/replaced");
    expect(window.history.length).toBe(before);
  });

  test("refresh reloads the document and prefetch remains callable", async () => {
    let router!: ReturnType<typeof useRouter>;
    function Probe() {
      router = useRouter();
      return null;
    }
    await render(createElement(Probe));
    const reload = spyOn(globalThis.location, "reload").mockImplementation(
      () => {},
    );
    try {
      router.refresh();
      expect(reload).toHaveBeenCalledTimes(1);
      expect(() => router.prefetch("/anywhere")).not.toThrow();
    } finally {
      reload.mockRestore();
    }
  });

  test("refresh is safe without a browser location during SSR", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "location")!;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: undefined,
    });
    try {
      expect(() =>
        renderToStaticMarkup(createElement(RefreshDuringSSRProbe)),
      ).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "location", descriptor);
    }
  });

  describe("control flow", () => {
    test("redirect throws a non-permanent RedirectError", () => {
      expect(() => redirect("/login")).toThrow(RedirectError);
      try {
        redirect("/login");
      } catch (error) {
        expect(error).toBeInstanceOf(RedirectError);
        expect((error as RedirectError).url).toBe("/login");
        expect((error as RedirectError).permanent).toBe(false);
      }
    });

    test("permanentRedirect marks the error permanent", () => {
      try {
        permanentRedirect("/moved");
      } catch (error) {
        expect((error as RedirectError).url).toBe("/moved");
        expect((error as RedirectError).permanent).toBe(true);
      }
    });

    test("notFound throws NotFoundError", () => {
      expect(() => notFound()).toThrow(NotFoundError);
    });
  });
});

test.each(["push", "replace"] as const)(
  "external %s delegates to the document location only",
  async (method) => {
    setLocation("/start");
    navigate("/start");
    let router!: ReturnType<typeof useRouter>;
    function Probe() {
      router = useRouter();
      return createElement("p", null, "live");
    }
    await render(createElement(Probe));
    const assign = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );
    const replace = spyOn(window.location, "replace").mockImplementation(
      () => {},
    );
    const scroll = spyOn(globalThis, "scrollTo").mockImplementation(() => {});
    try {
      router[method]("https://other.example/account?x=1#part");
      expect(assign).toHaveBeenCalledTimes(method === "push" ? 1 : 0);
      expect(replace).toHaveBeenCalledTimes(method === "replace" ? 1 : 0);
      expect(method === "push" ? assign : replace).toHaveBeenCalledWith(
        "https://other.example/account?x=1#part",
      );
      expect(window.location.pathname).toBe("/start");
      expect(scroll).not.toHaveBeenCalled();
      await act(async () =>
        router[method](window.location.origin + "/next?x=2", { scroll: false }),
      );
      expect(window.location.pathname + window.location.search).toBe(
        "/next?x=2",
      );
      expect(assign).toHaveBeenCalledTimes(method === "push" ? 1 : 0);
      expect(replace).toHaveBeenCalledTimes(method === "replace" ? 1 : 0);
    } finally {
      assign.mockRestore();
      replace.mockRestore();
      scroll.mockRestore();
      await cleanup();
    }
  },
);

test.each(["push", "replace"] as const)(
  "%s never assigns executable schemes",
  async (method) => {
    setLocation("/start");
    navigate("/start");
    let router!: ReturnType<typeof useRouter>;
    function Probe() {
      router = useRouter();
      return null;
    }
    await render(createElement(Probe));
    const assign = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );
    const replace = spyOn(window.location, "replace").mockImplementation(
      () => {},
    );
    try {
      for (const href of [
        "javascript:globalThis.executed=true",
        "data:text/html,<script>bad()</script>",
        "java\tscript:globalThis.executed=true",
      ]) {
        await act(async () => router[method](href, { scroll: false }));
        expect(assign).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
      }
    } finally {
      assign.mockRestore();
      replace.mockRestore();
      await cleanup();
    }
  },
);
