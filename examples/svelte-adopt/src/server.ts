import { createSignal } from "@tschk/moonshine";
import { createMoonshineServer } from "@tschk/moonshine/server";
import { render } from "svelte/server";
import Counter from "./Counter.svelte";

const clientBundle = await Bun.file(
  new URL("../public/client.js", import.meta.url),
)
  .text()
  .catch(() => "");

const hits = createSignal(0);

const envPort = Number(process.env.PORT);
const server = createMoonshineServer({
  port:
    Number.isInteger(envPort) && envPort >= 0 && envPort <= 65535
      ? envPort
      : 3000,
  pages: {
    "/": {
      render() {
        hits.set(hits() + 1);
        const out = render(Counter, { props: { start: hits() } });
        return `<!DOCTYPE html><html><head>${out.head}</head><body><div id="app">${out.body}</div><script type="module" src="/client.js"></script></body></html>`;
      },
    },
    "/client.js": {
      render: () =>
        new Response(clientBundle, {
          headers: { "content-type": "text/javascript" },
        }),
    },
  },
});

server.listen();
console.log(`svelte-adopt on http://localhost:${server.port}/`);
