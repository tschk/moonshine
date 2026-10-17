import { afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import {
  createMoonshineRouter,
  MoonshineRouter,
} from "@tschk/moonshine/router";
import { render, click, cleanup, setLocation } from "../../router/test/dom";
import { Link } from "../src/link";

afterEach(cleanup);
async function mount(props: ComponentProps<typeof Link>) {
  setLocation("/page");
  const runtime = createMoonshineRouter("/page");
  const container = await render(
    createElement(MoonshineRouter, {
      runtime,
      routes: [{ path: "/page", element: createElement(Link, props, "go") }],
    }),
  );
  return { runtime, anchor: container.querySelector("a")! };
}
test.each([true, "", "proof.txt"])(
  "download %s belongs to browser without prefetch",
  async (download) => {
    const { runtime, anchor } = await mount({
      to: "/download-react-router" + String(download),
      download,
    });
    const before = document.head.querySelectorAll("link[rel=prefetch]").length;
    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect((await click(anchor)).defaultPrevented).toBe(false);
    expect(runtime.getLocation()).toBe("/page");
    expect(document.head.querySelectorAll("link[rel=prefetch]").length).toBe(
      before,
    );
  },
);
test.each([false, null])(
  "omitted download %s preserves internal prefetch/navigation",
  async (download) => {
    const url = "/internal-react-router" + String(download);
    const { runtime, anchor } = await mount({ to: url, download });
    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect((await click(anchor)).defaultPrevented).toBe(true);
    expect(runtime.getLocation()).toBe(url);
    expect(
      document.head.querySelector('link[rel=prefetch][href="' + url + '"]'),
    ).not.toBeNull();
  },
);
