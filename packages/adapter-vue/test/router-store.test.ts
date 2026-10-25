import { describe, expect, test } from "bun:test";
import "../../react/test/dom";
import { h as hDOM } from "@tschk/moonshine-dom";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { h as hSSR, renderToString } from "@tschk/moonshine-dom/ssr";
import { computed, ref } from "../src/reactive";
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
  isNavigationFailure,
  NavigationFailureType,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  parseQuery,
  RouterLink,
  RouterView,
  START_LOCATION,
  stringifyQuery,
  useLink,
  useRoute,
  useRouter,
} from "../src/router";
import {
  createPinia,
  defineStore,
  getActivePinia,
  mapActions,
  mapGetters,
  mapState,
  mapStores,
  mapWritableState,
  MutationType,
  setActivePinia,
  storeToRefs,
} from "../src/store";

describe("@tschk/moonshine-vue/store (Pinia-compatible stores)", () => {
  test("supports Setup Stores and Option Stores with $patch, $reset, $subscribe, $onAction, and storeToRefs", async () => {
    const pinia = createPinia();
    let pluginCalls = 0;
    pinia.use(({ store }) => {
      pluginCalls++;
      return { pluginTag: `tagged:${store.$id}` };
    });
    setActivePinia(pinia);
    expect(getActivePinia()).toBe(pinia);

    const useCounterStore = defineStore("counter", () => {
      const count = ref(2);
      const name = ref("Alpha");
      const double = computed(() => count.value * 2);
      function increment(by = 1) {
        count.value += by;
        return count.value;
      }
      return { count, name, double, increment };
    });

    const counter = useCounterStore();
    expect(counter.$id).toBe("counter");
    expect((counter as unknown as { pluginTag: string }).pluginTag).toBe(
      "tagged:counter",
    );
    expect(pluginCalls).toBe(1);
    expect(useCounterStore()).toBe(counter);
    expect(pluginCalls).toBe(1);

    expect(counter.count).toBe(2);
    expect(counter.double).toBe(4);

    const refs = storeToRefs(counter);
    expect(refs.count.value).toBe(2);
    expect(refs.double.value).toBe(4);

    const mutations: Array<[MutationType, number]> = [];
    const unsubscribe = counter.$subscribe((mutation, state) => {
      mutations.push([mutation.type, state.count as number]);
    });

    const actionEvents: string[] = [];
    counter.$onAction(({ name, args, after, onError }) => {
      actionEvents.push(`start:${name}:${args.join(",")}`);
      after((res) => actionEvents.push(`after:${name}:${res}`));
      onError((err) => actionEvents.push(`error:${name}:${String(err)}`));
    });

    expect(counter.increment(3)).toBe(5);
    expect(counter.count).toBe(5);
    expect(counter.double).toBe(10);
    expect(refs.count.value).toBe(5);
    expect(refs.double.value).toBe(10);
    expect(actionEvents).toEqual(["start:increment:3", "after:increment:5"]);

    counter.$patch({ count: 10 });
    expect(counter.count).toBe(10);
    expect(counter.double).toBe(20);

    counter.$patch((state) => {
      state.count = 15;
      state.name = "Beta";
    });
    expect(counter.count).toBe(15);
    expect(counter.name).toBe("Beta");
    expect(mutations).toEqual([
      [MutationType.direct, 5],
      [MutationType.patchObject, 10],
      [MutationType.patchFunction, 15],
    ]);

    unsubscribe();

    const useCartStore = defineStore("cart", {
      state: () => ({ items: ["apple"], discount: 5 }),
      getters: {
        totalItems: (state) => state.items.length,
        summary(): string {
          return `${this.totalItems}:${this.discount}`;
        },
      },
      actions: {
        addItem(item: string) {
          this.items = [...this.items, item];
        },
      },
    });

    const cart = useCartStore();
    expect(cart.totalItems).toBe(1);
    expect(cart.summary).toBe("1:5");
    cart.addItem("pear");
    expect(cart.totalItems).toBe(2);
    expect(cart.summary).toBe("2:5");

    cart.$reset();
    expect(cart.items).toEqual(["apple"]);
    expect(cart.totalItems).toBe(1);

    const mappedState = mapState(useCartStore, ["items", "totalItems"]);
    expect(mappedState.items.call({})).toEqual(["apple"]);
    expect(mappedState.totalItems.call({})).toBe(1);

    const mappedGetters = mapGetters(useCartStore, { count: "totalItems" });
    expect(mappedGetters.count.call({})).toBe(1);

    const mappedWritable = mapWritableState(useCartStore, ["discount"]);
    mappedWritable.discount.set.call({}, 12);
    expect(cart.discount).toBe(12);
    expect(mappedWritable.discount.get.call({})).toBe(12);

    const mappedActions = mapActions(useCartStore, ["addItem"]);
    mappedActions.addItem.call({}, "plum");
    expect(cart.items).toEqual(["apple", "plum"]);

    const storesHelper = mapStores(useCartStore);
    expect(storesHelper.cartStore.call({})).toBe(cart);

    cart.$dispose();
    expect(useCartStore()).not.toBe(cart);
  });
});

describe("@tschk/moonshine-vue/router (Vue Router 4 compatible)", () => {
  const Home = () => hSSR("main", null, "Home Page");
  const UserLayout = () =>
    hSSR("section", { class: "user-layout" }, [
      hSSR("h1", null, () => `User ${useRoute().params.id}`),
      hSSR(RouterView, {}),
    ]);
  const UserProfile = () =>
    hSSR("p", null, () => `Profile tab=${useRoute().query.tab ?? "main"}`);
  const NotFound = () => hSSR("p", null, "404 Not Found");

  test("parses/stringifies queries and resolves dynamic, nested, alias, and redirect routes with navigation guards", async () => {
    expect(parseQuery("?tag=vue&tag=moonshine&page=2&empty")).toEqual({
      tag: ["vue", "moonshine"],
      page: "2",
      empty: null,
    });
    expect(
      stringifyQuery({ tag: ["vue", "moonshine"], page: 2, empty: null }),
    ).toBe("tag=vue&tag=moonshine&page=2&empty");
    expect(START_LOCATION.fullPath).toBe("/");

    const Home = () => hSSR("main", null, "Home Page");
    const UserLayout = () =>
      hSSR("section", { class: "user-layout" }, [
        hSSR("h1", null, () => `User ${useRoute().params.id}`),
        hSSR(RouterView, {}),
      ]);
    const UserProfile = () =>
      hSSR("p", null, () => `Profile tab=${useRoute().query.tab ?? "main"}`);
    const NotFound = () => hSSR("p", null, "404 Not Found");

    const history = createMemoryHistory("/app");
    const router = createRouter({
      history,
      routes: [
        {
          path: "/",
          name: "home",
          component: Home,
          alias: "/welcome",
        },
        {
          path: "/old-home",
          redirect: { name: "home", query: { from: "old" } },
        },
        {
          path: "/users/:id",
          component: UserLayout,
          children: [
            {
              path: "profile",
              name: "user-profile",
              component: UserProfile,
              meta: { requiresAuth: true },
            },
          ],
        },
        {
          path: "/:pathMatch(.*)*",
          name: "not-found",
          component: NotFound,
        },
      ],
    });

    const guardLog: string[] = [];
    let allowAuth = true;
    router.beforeEach((to, from) => {
      guardLog.push(`beforeEach:${from.path}->${to.path}`);
      if (to.meta.requiresAuth && !allowAuth) {
        return false;
      }
      return true;
    });
    router.beforeResolve((to) => {
      guardLog.push(`beforeResolve:${to.path}`);
    });
    router.afterEach((to, from, failure) => {
      guardLog.push(
        `afterEach:${from.path}->${to.path}:${failure ? failure.type : "ok"}`,
      );
    });

    await router.push("/welcome");
    expect(router.currentRoute.value.name).toBe("home");
    expect(router.currentRoute.value.path).toBe("/welcome");

    const dupFailure = await router.push("/welcome");
    expect(
      isNavigationFailure(dupFailure, NavigationFailureType.duplicated),
    ).toBe(true);

    await router.push("/old-home");
    expect(router.currentRoute.value.path).toBe("/");
    expect(router.currentRoute.value.query).toEqual({ from: "old" });

    await router.push({
      name: "user-profile",
      params: { id: "42" },
      query: { tab: "settings" },
    });
    expect(router.currentRoute.value.path).toBe("/users/42/profile");
    expect(router.currentRoute.value.params).toEqual({ id: "42" });
    expect(router.currentRoute.value.query).toEqual({ tab: "settings" });

    const html = renderToString(() =>
      hSSR(() => {
        router.install();
        return hSSR("div", null, [
          hSSR(RouterLink, {
            to: { name: "home" },
            children: () => "Go Home",
          }),
          hSSR(RouterView, {}),
        ]);
      }, null),
    );
    expect(html).toContain('<a href="/app/">Go Home</a>');
    expect(html).toContain(
      '<section class="user-layout"><h1>User 42</h1><p>Profile tab=settings</p></section>',
    );

    allowAuth = false;
    const aborted = await router.push("/users/99/profile");
    expect(isNavigationFailure(aborted, NavigationFailureType.aborted)).toBe(
      true,
    );
    expect(router.currentRoute.value.params.id).toBe("42");

    expect(createWebHistory("/base").base).toBe("/base");
    expect(createWebHashHistory().base).toContain("#");
  });

  test("renders reactive RouterView/RouterLink and runs component navigation guards in DOM", async () => {
    const events: string[] = [];
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/items/:id",
          name: "item",
          component: () => {
            const route = useRoute();
            const r = useRouter();
            const link = useLink({ to: "/about" });
            onBeforeRouteUpdate((to, from) => {
              events.push(`update:${from.params.id}->${to.params.id}`);
            });
            onBeforeRouteLeave((to, from) => {
              events.push(`leave:${from.path}->${to.path}`);
            });
            return hDOM(
              "div",
              { "data-Href": () => link.href.value },
              () => `Item:${route.params.id}:${String(r === router)}`,
            );
          },
        },
        {
          path: "/about",
          name: "about",
          component: () => hDOM("p", null, "About View"),
        },
      ],
    });

    await router.push("/items/1");
    let disposeRoot!: () => void;
    const node = createRoot((dispose) => {
      disposeRoot = dispose;
      return hDOM(() => {
        router.install();
        return hDOM("main", null, [
          hDOM(RouterLink, { to: "/about", children: "About" }),
          hDOM(RouterView, {}),
        ]);
      }, null);
    }) as HTMLElement;

    expect(node.textContent).toBe("AboutItem:1:true");
    await router.push("/items/2");
    expect(node.textContent).toBe("AboutItem:2:true");
    await router.push("/about");
    expect(node.textContent).toBe("AboutAbout View");
    expect(events).toEqual(["update:1->2", "leave:/items/2->/about"]);
    disposeRoot();
  });
});
