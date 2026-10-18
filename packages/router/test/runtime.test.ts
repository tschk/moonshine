import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createMoonshineRouter, splitLocation } from "../src/runtime";
import { setLocation } from "./dom";

test("neutral runtime preserves state and atomic history for query-only navigation", () => {
  setLocation("/start");
  window.history.replaceState({ initial: true }, "", "/start");
  const router = createMoonshineRouter();
  const other = createMoonshineRouter("/other?owner=second");
  const snapshots: unknown[] = [];
  const stop = router.history.subscribe(() =>
    snapshots.push([router.getLocation(), router.history.peek()]),
  );
  try {
    expect(router.history.peek()).toEqual({
      action: "POP",
      state: { initial: true },
    });
    router.navigate("/start?tab=one#item", { state: { tab: 1 } });
    router.navigate("/start?tab=two", { replace: true, state: { tab: 2 } });
    window.history.replaceState(
      { restored: true },
      "",
      "/restored?query=1#ignored",
    );
    router.syncFromBrowser();
    expect(snapshots).toEqual([
      ["/start?tab=one", { action: "PUSH", state: { tab: 1 } }],
      ["/start?tab=two", { action: "REPLACE", state: { tab: 2 } }],
      ["/restored?query=1", { action: "POP", state: { restored: true } }],
    ]);
    expect(other.getLocation()).toBe("/other?owner=second");
    expect(splitLocation(router.getLocation())).toEqual([
      "/restored",
      "query=1",
    ]);
  } finally {
    stop();
  }
});

test("runtime and data subpaths work without browser globals and bundle without hosts", async () => {
  const runtime = resolve(import.meta.dir, "../src/runtime.ts");
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
const {createMoonshineRouter,splitLocation}=await import(process.argv[1]);
const first=createMoonshineRouter('/first?owner=one');
const second=createMoonshineRouter('/second?owner=two');
first.navigate('/changed?tab=one',{state:{secret:'one'}});
if(second.getLocation()!=='/second?owner=two'||second.history.peek().state!==null)throw Error('SSR state leaked');
if(JSON.stringify(splitLocation(first.getLocation()))!==JSON.stringify(['/changed','tab=one']))throw Error('Query changed');
const relative=createMoonshineRouter('/owner/folder/page?sort=asc#initial');
if(relative.fragment.peek()!=='#initial')throw Error('SSR explicit fragment lost');
if(relative.getLocation()!=='/owner/folder/page?sort=asc')throw Error('Initial fragment entered location');
relative.navigate('?page=2#results');
if(relative.getLocation()!=='/owner/folder/page?page=2')throw Error('SSR query-only navigation lost path');
relative.navigate('#details');
if(relative.getLocation()!=='/owner/folder/page?page=2')throw Error('SSR fragment navigation lost path/query');
relative.navigate('../detail?sort=next#ignored');
if(relative.getLocation()!=='/owner/detail?sort=next')throw Error('SSR relative path or fragment normalization failed');
const {createDataRouter}=await import(process.argv[2]);
const data=createDataRouter(({location})=>location,'/data');
await data.invalidate();
if(data.data.peek().data!=='/data')throw Error('Data runtime failed');
data.dispose();
const result=await Bun.build({entrypoints:[process.argv[1],process.argv[2]],target:'browser',minify:true,plugins:[{
name:'reject-host',setup(build){build.onResolve({filter:/^(react|react-dom|solid-js)(\\/|$)/},()=>{throw Error('Host runtime imported')})}
}]});
if(!result.success)throw new AggregateError(result.logs,'Host-free runtime bundle failed');
console.log('isolated runtime passed');
`,
      runtime,
      resolve(import.meta.dir, "../src/data.ts"),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, error).toBe(0);
  expect(output).toContain("isolated runtime passed");
});

test("relative navigation uses its owner's path rather than another browser location", () => {
  setLocation("/foreign/page?other=one");
  const router = createMoonshineRouter("/owner/folder/page?sort=asc#initial");
  const other = createMoonshineRouter("/other/page?keep=yes");
  expect(router.getLocation()).toBe("/owner/folder/page?sort=asc");
  const snapshots: unknown[] = [];
  const unsubscribe = router.history.subscribe(() =>
    snapshots.push([router.getLocation(), router.history.peek()]),
  );
  try {
    router.navigate("?page=2#results", { state: { step: 1 } });
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe("/owner/folder/page?page=2#results");
    window.history.replaceState(null, "", "/foreign/again?other=two");
    router.navigate("#details", { replace: true, state: { step: 2 } });
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe("/owner/folder/page?page=2#details");
    router.navigate("../detail", { state: { step: 3 } });
    expect(router.getLocation()).toBe("/owner/detail");
    expect(other.getLocation()).toBe("/other/page?keep=yes");
    expect(snapshots).toEqual([
      ["/owner/folder/page?page=2", { action: "PUSH", state: { step: 1 } }],
      ["/owner/folder/page?page=2", { action: "REPLACE", state: { step: 2 } }],
      ["/owner/detail", { action: "PUSH", state: { step: 3 } }],
    ]);
  } finally {
    unsubscribe();
  }
});

test("fragments are owned and atomic while location and history shapes remain unchanged", () => {
  setLocation("/page?q=1#browser");
  const browser = createMoonshineRouter(),
    first = createMoonshineRouter("/page?q=1#first"),
    second = createMoonshineRouter("/page?q=1#second");
  expect(browser.fragment.peek()).toBe("#browser");
  expect(first.fragment.peek()).toBe("#first");
  expect(second.fragment.peek()).toBe("#second");
  const seen: unknown[] = [];
  const stop = first.history.subscribe(() =>
    seen.push([
      first.getLocation(),
      first.fragment.peek(),
      first.history.peek(),
    ]),
  );
  try {
    first.navigate("#next");
    expect(first.fragment.peek()).toBe("#next");
    expect(second.fragment.peek()).toBe("#second");
    first.navigate("?q=2");
    expect(first.fragment.peek()).toBe("");
    window.history.replaceState({ back: true }, "", "/back?q=3#restored");
    first.syncFromBrowser();
    expect(first.fragment.peek()).toBe("#restored");
    expect(second.fragment.peek()).toBe("#second");
    expect(seen).toEqual([
      ["/page?q=1", "#next", { action: "PUSH", state: null }],
      ["/page?q=2", "", { action: "PUSH", state: null }],
      ["/back?q=3", "#restored", { action: "POP", state: { back: true } }],
    ]);
  } finally {
    stop();
  }
});
