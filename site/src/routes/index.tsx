import { readEdgeFacts, jsonForScript, type EdgeFacts } from "../edge";
import SignalGraph, { ISLAND_ID } from "../islands/graph";
import { Chrome } from "../chrome";
import type { PageData } from "../renderer";

type HomeData = PageData & { edge: EdgeFacts };

export async function loader({
  request,
}: {
  request: Request;
}): Promise<HomeData> {
  return {
    meta: {
      title: "moonshine — a hyperminimal Bun-first UI runtime",
      description:
        "Moonshine is a Bun-first UI runtime built on a signal-only kernel of 2,985 minified bytes, plus opt-in compiler, routing, rendering, server and deployment layers.",
    },
    edge: await readEdgeFacts(request),
  };
}

function Live({ edge }: { edge: EdgeFacts }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="dot" aria-hidden="true" />
        <span>rendered for this request</span>
      </div>
      <dl className="kv">
        <dt>colo</dt>
        <dd>{edge.colo}</dd>
        <dt>where</dt>
        <dd>
          {edge.city}, {edge.region} ({edge.country})
        </dd>
        <dt>protocol</dt>
        <dd>
          {edge.protocol} · {edge.tlsVersion}
        </dd>
        <dt>rendered</dt>
        <dd>{edge.renderedAt}</dd>
        <dt>isolate</dt>
        <dd>
          request #{edge.isolateRequests} · up {edge.isolateAgeMs} ms
        </dd>
        <dt>nonce</dt>
        <dd>{edge.renderNonce}</dd>
        <dt>npm latest</dt>
        <dd>
          {edge.npmLatest
            ? `@tschk/moonshine@${edge.npmLatest} (fetched at the edge)`
            : "registry unavailable"}
        </dd>
      </dl>
    </div>
  );
}

export default function Home({ data }: { data: HomeData }) {
  const edge = data.edge;
  const seed = edge.isolateRequests % 12;

  return (
    <Chrome current="/">
      <section>
        <h1>moonshine</h1>
        <p className="lede">
          A hyperminimal, Bun-first UI runtime built around a signal-only
          kernel. Start with signals; add only the compiler, routing, rendering,
          server and deployment layers a project actually needs, then ship to
          Bun, Node, Cloudflare or Vercel from one manifest.
        </p>
        <p>
          This page is one of them. It is a moonshine project — file-system
          routes, a loader, a custom <code>Renderer</code>, an island — built by{" "}
          <code>moonshine build --adapter cloudflare</code> and served from a
          Cloudflare Worker.
        </p>
      </section>

      <section aria-labelledby="live-heading">
        <h2 id="live-heading">Live from the edge</h2>
        <p>
          Every value below is read inside the Worker while this response is
          being built. Reload and they change; the JSON at{" "}
          <a href="/api/state">/api/state</a> is the same data from an{" "}
          <code>api</code> route.
        </p>
        <Live edge={edge} />
      </section>

      <section aria-labelledby="graph-heading">
        <h2 id="graph-heading">The signal graph, hydrated</h2>
        <p>
          Server-rendered from <code>@tschk/moonshine</code> signals seeded with
          this request&rsquo;s number, then hydrated on the client. The buttons
          write signals; the memos below them recompute on demand. No virtual
          DOM diff drives the derived values — the graph does.
        </p>
        <div className="panel">
          <div className="panel-head">
            <span>island · seed {seed}</span>
          </div>
          <div data-island={ISLAND_ID}>
            <SignalGraph seed={seed} />
          </div>
        </div>
        <script
          type="application/json"
          data-island-props={ISLAND_ID}
          dangerouslySetInnerHTML={{ __html: jsonForScript({ seed }) }}
        />
      </section>

      <section aria-labelledby="layers-heading">
        <h2 id="layers-heading">Layers, all optional</h2>
        <div className="rows">
          <div className="row">
            <span>kernel</span>
            <span>
              signals, memos, stores, resources. 2,985 bytes minified, measured
              by <code>bun run check:size</code>.
            </span>
          </div>
          <div className="row">
            <span>compiler</span>
            <span>
              discovers <code>src/routes</code>, analyses each module with the
              TypeScript AST, and classifies it as <code>static</code>,{" "}
              <code>ssr</code>, <code>island</code>, <code>spa</code> or{" "}
              <code>api</code> — per route, automatically or explicitly.
            </span>
          </div>
          <div className="row">
            <span>router</span>
            <span>
              renderer-neutral route graph and matcher, with optional React
              navigation.
            </span>
          </div>
          <div className="row">
            <span>server</span>
            <span>
              request pipeline: loaders, actions, middleware, error boundaries,
              static files.
            </span>
          </div>
          <div className="row">
            <span>renderers</span>
            <span>
              React and Solid own their output; there is no shared vnode. The{" "}
              <code>Renderer</code> contract is <code>name</code>,{" "}
              <code>render</code> and <code>prerender</code> — small enough that
              this site implements its own to control <code>&lt;head&gt;</code>.
            </span>
          </div>
          <div className="row">
            <span>deployment</span>
            <span>
              Bun, Node, Cloudflare and Vercel adapters, all built from the same
              manifest and tested against one shared conformance suite.
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="adopt-heading">
        <h2 id="adopt-heading">Adopting an existing app</h2>
        <p>
          <code>moonshine adopt</code> points at an existing Next application,
          scans it, and aliases <code>next/*</code> specifiers to moonshine
          implementations through <code>tsconfig</code> paths — no source edits.
          It also prints, bluntly, what does not carry over: middleware, the
          Next config, <code>generateMetadata</code>, ISR, server actions,
          parallel and intercepting routes.
        </p>
        <div className="panel">
          <pre>
            <code>{`$ moonshine adopt ./my-next-app --dry-run
$ moonshine build --adapter cloudflare
$ moonshine preview`}</code>
          </pre>
        </div>
      </section>

      <section aria-labelledby="adapters-heading">
        <h2 id="adapters-heading">Six adapters</h2>
        <p>
          Four reimplement another framework&rsquo;s API surface natively, with
          no dependency on that framework:
        </p>
        <ul className="plain">
          <li>
            <code>@tschk/moonshine-next</code> — Next.js API surface
          </li>
          <li>
            <code>@tschk/moonshine-react-router</code> — react-router / Remix
            client API
          </li>
          <li>
            <code>@tschk/moonshine-tanstack</code> — TanStack Router / Start
            client API
          </li>
          <li>
            <code>@tschk/moonshine-waku</code> — Waku client router API
          </li>
        </ul>
        <p>Two host a real library or contract instead of replacing it:</p>
        <ul className="plain">
          <li>
            <code>@tschk/moonshine-solid</code> — re-exports{" "}
            <code>solid-js</code> alongside the Solid renderer and signal
            bridges
          </li>
          <li>
            <code>@tschk/moonshine-adapter-conformance</code> — the deployment
            contract suite every deploy adapter runs against
          </li>
        </ul>
      </section>

      <section aria-labelledby="crepus-heading">
        <h2 id="crepus-heading">One parser, four frontends</h2>
        <p>
          <code>.crepus</code> templates are not parsed in TypeScript. They go
          through the crepuscularity Rust parser compiled to WebAssembly and
          published as <code>@tschk/crepuscularity-wasm</code>. That parser now
          accepts four input languages — <code>.crepus</code>, JSX/TSX,{" "}
          <code>.svelte</code> and <code>.vue</code> — and lowers all of them to
          a single View IR, which the React and Solid renderers consume.
        </p>
        <p>
          Class tokens from the template survive as <code>className</code>{" "}
          verbatim; the renderers never turn IR style hints into inline CSS, so
          UnoCSS or Tailwind still owns the styling.
        </p>
      </section>

      <section aria-labelledby="measured-heading">
        <h2 id="measured-heading">One app, measured</h2>
        <p>
          <a href="https://undivisible.dev">undivisible.dev</a> is a
          content-heavy site — three routes, ~9,000 lines, twelve{" "}
          <code>&quot;use client&quot;</code> components including canvas
          shaders. It ran on Next.js 15 with a static export and now runs on
          moonshine, served from the same host, with identical rendered text and
          every interactive component still working.
        </p>
        <div className="tablewrap">
          <table>
            <caption className="muted" style={{ padding: "7px 14px" }}>
              Uncompressed transfer bytes: HTML plus every script and stylesheet
              it references.
            </caption>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Asset</th>
                <th scope="col">Next.js</th>
                <th scope="col">Moonshine</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">/</th>
                <td>HTML</td>
                <td className="num">99,931</td>
                <td className="num">79,899</td>
                <td className="num">−20%</td>
              </tr>
              <tr>
                <th scope="row">/</th>
                <td>JS</td>
                <td className="num">894,470</td>
                <td className="num">183,265</td>
                <td className="num">−80%</td>
              </tr>
              <tr>
                <th scope="row">/</th>
                <td>CSS</td>
                <td className="num">53,509</td>
                <td className="num">41,166</td>
                <td className="num">−23%</td>
              </tr>
              <tr>
                <th scope="row">/agent</th>
                <td>HTML</td>
                <td className="num">13,195</td>
                <td className="num">3,923</td>
                <td className="num">−70%</td>
              </tr>
              <tr>
                <th scope="row">/agent</th>
                <td>JS</td>
                <td className="num">654,653</td>
                <td className="num">0</td>
                <td className="num">−100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">
          This is one application on one host. It is evidence that a React app
          using few Next-specific APIs sheds most of its client JavaScript on
          moonshine; it is not a general benchmark, and an app leaning on RSC,
          ISR or image optimisation would not port this cleanly. The site also
          lost Next&rsquo;s client router, so in-app navigation is a full page
          load. Full caveats live in{" "}
          <a href="https://github.com/tschk/moonshine/blob/main/docs/COMPARE.md">
            docs/COMPARE.md
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="start-heading">
        <h2 id="start-heading">Start</h2>
        <div className="panel">
          <pre>
            <code>{`$ bun add @tschk/moonshine
$ bunx moonshine new my-app --react --adapter cloudflare
$ bunx moonshine dev`}</code>
          </pre>
        </div>
        <p className="muted">
          Nineteen packages are published under <code>@tschk/</code>; the{" "}
          <a href="/packages">full list</a> says what each one is for.
        </p>
      </section>
    </Chrome>
  );
}
