import { expect, test } from "bun:test";
import { renderToString, scopeSSRChild } from "@tschk/moonshine-dom/ssr";
import { createRoot, getRenderScheduler } from "@tschk/moonshine-dom/reactive";
import { createRunePreEffect, withRuneScheduler } from "../src/pre";

function forbidden() {
  throw Error("server pre callback ran");
}
test("bare, nested and foreign-owner SSR suppress pre callbacks without installing scheduling", () => {
  const setup = () =>
    withRuneScheduler(() => {
      expect(getRenderScheduler()).toBeUndefined();
      createRunePreEffect(forbidden);
      return "server";
    });
  expect(renderToString(setup)).toBe("server");
  expect(renderToString(() => renderToString(setup))).toBe("server");
  createRoot((stop) => {
    const foreign = scopeSSRChild(setup);
    expect(renderToString(() => foreign)).toBe("server");
    stop();
  });
  createRoot((stop) => {
    withRuneScheduler(() => {
      const inherited = getRenderScheduler();
      const foreign = scopeSSRChild(() =>
        withRuneScheduler(() => {
          expect(getRenderScheduler()).toBe(inherited);
          createRunePreEffect(forbidden);
          return "foreign scheduled owner";
        }),
      );
      expect(renderToString(() => foreign)).toBe("foreign scheduled owner");
    });
    stop();
  });
  expect(() => createRunePreEffect(forbidden)).toThrow("Pre effects require");
});
