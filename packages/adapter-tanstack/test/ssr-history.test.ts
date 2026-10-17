import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMoonshineRouter,
  MoonshineRouter,
  navigate,
} from "@tschk/moonshine/router";
import { useLocation } from "../src/navigation";

function Probe() {
  const location = useLocation();
  return createElement(
    "output",
    null,
    `${location.pathname}|${location.searchStr}|${JSON.stringify(location.state)}`,
  );
}

test("SSR location reads scoped pathname, query and history", () => {
  const runtime = createMoonshineRouter("/account?owner=alice");
  runtime.history.set({ action: "REPLACE", state: { owner: "alice" } });
  const output = renderToStaticMarkup(
    createElement(MoonshineRouter, {
      runtime,
      path: "/account?owner=alice",
      routes: [{ path: "/account", element: createElement(Probe) }],
    }),
  );
  expect(output).toContain("/account|?owner=alice|");
  expect(output).toContain("&quot;owner&quot;:&quot;alice&quot;");
});

test("SSR outside a router does not read process fallback history", () => {
  navigate("/other", { state: { private: "previous-request" } });
  const output = renderToStaticMarkup(createElement(Probe));
  expect(output).not.toContain("previous-request");
  expect(output).toContain("<output>/||{}</output>");
});
