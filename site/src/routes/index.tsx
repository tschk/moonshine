import type { CSSProperties } from "react";
import { readEdgeFacts, type EdgeFacts } from "../edge";
import {
  fetchNpmDownloads,
  fetchCrepusCrates,
  type CratesSnapshot,
  type CrateVersion,
  type DownloadSeries,
} from "../registry";
import { DownloadChart } from "../downloads";
import SignalGraph, { ISLAND_ID } from "../islands/graph";
import { Chrome } from "../chrome";
import { Crepuscularity, TscHk } from "../links";
import type { PageData } from "../renderer";

type HomeData = PageData & {
  edge: EdgeFacts;
  crates: CratesSnapshot;
  moonshineDownloads: DownloadSeries;
  /** Wall clock the loader itself spent, measured in the Worker. */
  loaderMs: number;
};

export async function loader({
  request,
}: {
  request: Request;
}): Promise<HomeData> {
  const startedAt = Date.now();
  // Both upstreams are on the request path, so they overlap rather than queue.
  const [edge, crates, moonshineDownloads] = await Promise.all([
    readEdgeFacts(request),
    fetchCrepusCrates(),
    fetchNpmDownloads(),
  ]);
  return {
    meta: {
      title: "moonshine — a hyperminimal Bun-first UI runtime",
      description:
        "Moonshine is a Bun-first UI runtime built on a signal-only kernel of 2,985 minified bytes, plus opt-in compiler, routing, rendering, server and deployment layers.",
    },
    edge,
    crates,
    moonshineDownloads,
    loaderMs: Date.now() - startedAt,
  };
}

function Live({ edge, loaderMs }: { edge: EdgeFacts; loaderMs: number }) {
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
          {edge.city}, {edge.region} ({edge.country}) · {edge.timezone}
        </dd>
        <dt>round trip</dt>
        <dd>
          {edge.clientTcpRtt === null
            ? "not reported by this runtime"
            : `${edge.clientTcpRtt} ms measured on this TCP connection`}
        </dd>
        <dt>server time</dt>
        <dd>
          loader {loaderMs} ms · edge facts {edge.edgeMs} ms · npm{" "}
          {edge.upstreamMs} ms
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

function Crates({ crates }: { crates: CratesSnapshot }) {
  if (!crates.ok || crates.count === 0) {
    return (
      <p className="muted" data-live="true">
        crates.io was unreachable while this page was built, so no versions are
        shown — nothing here is baked into the bundle.
      </p>
    );
  }
  return (
    // Full-bleed: the carousel escapes the reading column so the strip runs the
    // whole viewport, rather than sitting in a panel the text has to step around.
    <div className="bleed">
      <div className="carousel">
        <div className="carousel-track">
          <CrateChips crates={crates.crates} />
          <CrateChips crates={crates.crates} duplicate />
        </div>
      </div>
      <p className="muted bleed-note">
        {crates.count} crates on crates.io · read in {crates.elapsedMs} ms
      </p>
    </div>
  );
}

/**
 * The carousel is two identical rows sliding as one. Only the first is in the
 * accessibility tree and in the tab order, so a screen reader still reads the
 * 25 crates exactly once; the second exists purely so the loop has no seam,
 * and it is display:none under `prefers-reduced-motion: reduce`, where the
 * first row falls back to the plain wrapping chip list.
 */
function CrateChips({
  crates,
  duplicate,
}: {
  crates: CrateVersion[];
  duplicate?: boolean;
}) {
  return (
    <ul
      className={duplicate ? "chips carousel-dup" : "chips"}
      {...(duplicate ? { "aria-hidden": true } : {})}
    >
      {crates.map((crate, index) => (
        <li
          key={crate.name}
          translate="no"
          style={{ "--i": index } as CSSProperties}
        >
          <a
            href={`https://crates.io/crates/${crate.name}`}
            rel="noopener noreferrer"
            {...(duplicate ? { tabIndex: -1 } : {})}
          >
            {crate.name}
          </a>
          <span className="chip-v">{crate.version}</span>
        </li>
      ))}
    </ul>
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
        <Live edge={edge} loaderMs={data.loaderMs} />
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
          data-props={JSON.stringify({ seed })}
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
          <code>moonshine adopt</code> walks up from the working directory,
          detects what the project is, and edits no source files. Next,
          react-router/Remix, TanStack Router and Waku apps keep their imports:
          every specifier the matching adapter implements is remapped through{" "}
          <code>tsconfig</code> paths, so <code>next/*</code>,{" "}
          <code>react-router</code>, <code>@remix-run/*</code>,{" "}
          <code>@tanstack/react-router</code> and <code>waku/*</code> resolve to
          moonshine implementations instead.
        </p>
        <p>
          Svelte, Vue, Astro and Angular have no adapter, so they take the
          rougher path: each <code>.svelte</code>, <code>.vue</code>,{" "}
          <code>.astro</code> or Angular component template compiles through{" "}
          <Crepuscularity /> into View IR, and adopt writes a generated React
          module that renders it — under <code>moonshine/routes</code> when the
          filename maps to a URL, otherwise <code>moonshine/components</code>,
          compiled but unmounted. Only markup is compiled. Svelte{" "}
          <code>&lt;script&gt;</code> blocks, Vue&rsquo;s Composition API,
          Astro&rsquo;s <code>---</code> frontmatter and the Angular component
          class are never executed, so that logic has to be ported by hand.
        </p>
        <p>
          It also prints, bluntly, what does not carry over. For Next:
          middleware, the Next config, <code>generateMetadata</code>, ISR,
          server actions, async server components, parallel and intercepting
          routes. For the template path: unsupported constructs are parse errors
          reported per file — Astro rejects imported component tags,{" "}
          <code>&lt;slot /&gt;</code>, spreads and <code>transition:*</code>, so
          a real Astro app usually adopts partially rather than whole, and
          Angular has no file-based routing, so nothing is mounted at a URL at
          all.
        </p>
        <div className="panel">
          <pre tabIndex={0}>
            <code>{`$ moonshine adopt --dry-run
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
        <h2 id="crepus-heading">One parser, six frontends</h2>
        <p>
          <code>.crepus</code> templates are not parsed in TypeScript. They go
          through the <Crepuscularity /> Rust parser compiled to WebAssembly and
          published as <code>@tschk/crepuscularity-wasm</code>. It accepts{" "}
          <code>.crepus</code>, JSX/TSX, <code>.svelte</code>, <code>.vue</code>
          , <code>.astro</code> and Angular templates, lowering all of them to
          one View IR that the React and Solid renderers consume. Class tokens
          survive as <code>className</code> verbatim, so UnoCSS or Tailwind
          still owns the styling.
        </p>
        <Crates crates={data.crates} />
        {data.moonshineDownloads.ok ? (
          <>
            <p className="muted">
              Daily downloads across every <code>@tschk/*</code> package for the
              last month, summed from the npm downloads API in this same
              request. Hover or focus the chart to move the readout.
            </p>
            <DownloadChart id="moonshine" series={data.moonshineDownloads} />
          </>
        ) : null}
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
        <div className="tablewrap" tabIndex={0}>
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
          <pre tabIndex={0}>
            <code>{`$ bun add @tschk/moonshine
$ bunx moonshine new my-app --react --adapter cloudflare
$ bunx moonshine dev`}</code>
          </pre>
        </div>
        <p className="muted">
          Everything is published under <code>@tschk/</code> — part of <TscHk />{" "}
          — and the <a href="/packages">full list</a> says what each one is for,
          with the version npm is serving at the moment you load it.
        </p>
      </section>
    </Chrome>
  );
}
