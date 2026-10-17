import { expect, test } from "bun:test";
import { renderToString } from "@tschk/moonshine-dom/ssr";
import Home, { loader } from "../src/routes/home";
import Layout, { loader as layoutLoader } from "../src/layout";
import { loader as counterLoader } from "../src/routes/counter";

test("server route escapes request data inside its layout", () => {
  const data = {
    home: loader({
      request: new Request("http://localhost/?name=%3Cscript%3E"),
    }),
    "src/layout.ts": layoutLoader(),
  };
  const html = renderToString(() => Layout({ data, children: Home({ data }) }));
  expect(html).toContain("hello, &lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("moonshine native");
  expect(counterLoader()).toEqual({ start: 2 });
});
