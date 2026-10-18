import { expect, test } from "bun:test";
import { createComponent } from "../src/component";
import { createRoot } from "../src/reactive";
import { createResource as createClientResource } from "../src/resource";
import { createResource, type ServerResourceReturn } from "../src/resource-ssr";
import { renderToString } from "../src/ssr";

test("sources use JS truthiness, are read once per create/refetch, and never fetch", () => {
  const cases: [unknown, boolean][] = [
    [false, false],
    [null, false],
    [undefined, false],
    [0, false],
    ["", false],
    [true, true],
    [1, true],
    ["key", true],
  ];
  for (const [raw, enabled] of cases) {
    for (const accessor of [false, true]) {
      let reads = 0;
      let fetches = 0;
      renderToString(() => {
        const [value, actions] = createResource(
          accessor ? () => (reads++, raw as string) : (raw as string),
          () => {
            fetches++;
            return "fetched";
          },
        );
        expect(value.loading).toBe(enabled);
        expect(value.state).toBe("unresolved");
        expect(value()).toBeUndefined();
        expect(value.latest).toBeUndefined();
        expect(value.error).toBeUndefined();
        expect(actions.refetch()).toBe(enabled);
        expect(actions.refetch("info")).toBe(enabled);
        expect(value.loading).toBe(enabled);
        expect(value.state).toBe("unresolved");
        return "";
      });
      expect(fetches).toBe(0);
      expect(reads).toBe(accessor ? 3 : 0);
    }
  }
});

test("fetcher-only form is enabled and never fetches", () => {
  let fetches = 0;
  renderToString(() => {
    const [value, actions] = createResource(() => {
      fetches++;
      return 1;
    });
    expect(value.loading).toBe(true);
    expect(value()).toBeUndefined();
    expect(actions.refetch()).toBe(true);
    return "";
  });
  expect(fetches).toBe(0);
});

test("refetch re-reads the source and updates loading", () => {
  renderToString(() => {
    let enabled: unknown = false;
    const [value, actions] = createResource(
      () => enabled,
      () => "never",
    );
    expect(value.loading).toBe(false);
    enabled = "on";
    expect(value.loading).toBe(false);
    expect(actions.refetch()).toBe(true);
    expect(value.loading).toBe(true);
    enabled = 0;
    expect(actions.refetch()).toBe(false);
    expect(value.loading).toBe(false);
    return "";
  });
});

test("initialValue getter reads once; presence selects ready state", () => {
  renderToString(() => {
    const [none] = createResource(true, () => 1);
    expect(none.state).toBe("unresolved");
    const [absent] = createResource(true, () => 1, {});
    expect(absent.state).toBe("unresolved");
    const [undef, undefActions] = createResource(true, () => 1, {
      initialValue: undefined,
    });
    expect(undef.state).toBe("ready");
    expect(undef()).toBeUndefined();
    expect(undefActions.mutate(3)).toBe(3);
    expect(undef.state).toBe("ready");
    let reads = 0;
    const [seed, actions] = createResource(true, () => "fetched", {
      name: "seeded",
      get initialValue() {
        reads++;
        return "seed";
      },
    });
    expect(seed()).toBe("seed");
    expect(seed.latest).toBe("seed");
    expect(seed.state).toBe("ready");
    expect(seed.loading).toBe(true);
    actions.refetch();
    expect(reads).toBe(1);
    expect(seed.state).toBe("ready");
    const [inherited] = createResource(
      () => 1,
      Object.create({ initialValue: 9 }),
    );
    expect(inherited()).toBe(9);
    expect(inherited.state).toBe("ready");
    const [onlyFetcher] = createResource(() => 1, { initialValue: 7 });
    expect(onlyFetcher()).toBe(7);
    expect(onlyFetcher.state).toBe("ready");
    return "";
  });
});

test("mutate stores functions literally and returns its argument", () => {
  renderToString(() => {
    let invoked = 0;
    const next = (previous?: number) => {
      invoked++;
      return (previous ?? 0) + 1;
    };
    for (const options of [undefined, { initialValue: undefined }]) {
      const [value, actions] = createResource<unknown, true>(
        true,
        () => 1,
        options,
      );
      const state = value.state;
      expect(actions.mutate(next)).toBe(next);
      expect(value()).toBe(next);
      expect(value.latest).toBe(next);
      expect(value.state).toBe(state);
      expect(value.loading).toBe(true);
      expect(actions.mutate(undefined)).toBeUndefined();
      expect(value()).toBeUndefined();
    }
    expect(invoked).toBe(0);
    return "";
  });
});

test("actions stay plain closures after render and request ends", () => {
  let retained!: ServerResourceReturn<string>;
  let reads = 0;
  renderToString(() => {
    retained = createResource<string, string>(
      () => (reads++, "key"),
      () => "never",
    );
    return "";
  });
  const [value, actions] = retained;
  expect(reads).toBe(1);
  expect(value.loading).toBe(true);
  expect(actions.mutate("later")).toBe("later");
  expect(value()).toBe("later");
  expect(actions.refetch()).toBe(true);
  expect(reads).toBe(2);
});

test("source errors propagate from creation and refetch without state changes", () => {
  const failure = new Error("source");
  expect(() =>
    renderToString(() => {
      createResource(
        () => {
          throw failure;
        },
        () => 1,
      );
      return "";
    }),
  ).toThrow(failure);
  renderToString(() => {
    let fail = false;
    const [value, actions] = createResource(
      () => {
        if (fail) throw failure;
        return true;
      },
      () => 1,
    );
    fail = true;
    expect(() => actions.refetch()).toThrow(failure);
    expect(value.loading).toBe(true);
    expect(value.error).toBeUndefined();
    return "";
  });
});

test("nested and sequential requests stay independent", () => {
  const outerReads: string[] = [];
  const html = renderToString(() => {
    const [outer, outerActions] = createResource(
      () => (outerReads.push("outer"), "o"),
      () => "never",
      { initialValue: "outer" },
    );
    const inner = renderToString(() => {
      const [value, actions] = createResource(false, () => "never");
      expect(value.loading).toBe(false);
      expect(actions.mutate("inner")).toBe("inner");
      return String(value());
    });
    expect(inner).toBe("inner");
    expect(outer()).toBe("outer");
    expect(outer.loading).toBe(true);
    expect(outerActions.refetch()).toBe(true);
    expect(outerReads).toEqual(["outer", "outer"]);
    return String(outer());
  });
  expect(html).toBe("outer");
  for (let request = 0; request < 2; request++) {
    renderToString(() => {
      const [value] = createResource(true, () => 1);
      expect(value.loading).toBe(true);
      expect(value()).toBeUndefined();
      return "";
    });
  }
});

test("creation requires an SSR render or SSR component context", () => {
  expect(() => createResource(true, () => 1)).toThrow(
    "requires an active SSR render or SSR component context",
  );
  createRoot((dispose) => {
    expect(() => createResource(true, () => 1)).toThrow("requires an active");
    expect(() =>
      createComponent(() => createResource(true, () => 1), {}, "dom"),
    ).toThrow("requires an active");
    const [value] = createComponent(
      () => createResource(true, () => 1, { initialValue: 5 }),
      {},
      "ssr",
    );
    expect(value()).toBe(5);
    expect(value.loading).toBe(true);
    dispose();
  });
  expect(() => createResource(true, () => 1)).toThrow("requires an active");
});

test("unsupported options reject before reading source or fetcher", () => {
  let reads = 0;
  const trap = {
    get initialValue() {
      reads++;
      return 1;
    },
    storage: () => [() => 1, () => {}],
  } as never;
  for (const options of [trap, { ssrLoadFrom: "initial" } as never]) {
    expect(() =>
      renderToString(() => {
        createResource(
          () => (reads++, true),
          () => (reads++, 1),
          options,
        );
        return "";
      }),
    ).toThrow("Unsupported native resource option");
    expect(() =>
      renderToString(() => {
        createResource(() => (reads++, 1), options);
        return "";
      }),
    ).toThrow("Unsupported native resource option");
  }
  expect(reads).toBe(0);
});

test("client createResource rejects SSR before reading callbacks or options", () => {
  let reads = 0;
  const options = {
    get initialValue() {
      reads++;
      return 1;
    },
  };
  const source = () => (reads++, true);
  const fetcher = () => (reads++, 1);
  expect(() =>
    renderToString(() => {
      createClientResource(source, fetcher, options);
      return "";
    }),
  ).toThrow("Client createResource is unavailable during SSR");
  createRoot((dispose) => {
    expect(() =>
      createComponent(
        () => createClientResource(source, fetcher, options),
        {},
        "ssr",
      ),
    ).toThrow("Client createResource is unavailable during SSR");
    dispose();
  });
  expect(reads).toBe(0);
});
