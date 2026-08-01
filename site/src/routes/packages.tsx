import type { CSSProperties } from "react";
import { Chrome } from "../chrome";
import { GROUP_LABELS, PACKAGES, type PackageEntry } from "../packages";
import {
  fetchNpmDownloads,
  fetchNpmScope,
  type DownloadSeries,
  type NpmScopeSnapshot,
} from "../registry";
import { DownloadChart } from "../downloads";
import { Crepuscularity, TscHk } from "../links";
import type { PageData } from "../renderer";

type PackagesData = PageData & {
  npm: NpmScopeSnapshot;
  npmDownloads: DownloadSeries;
  renderedAt: string;
  /** Wall clock the loader spent, measured inside the Worker. */
  loaderMs: number;
};

export async function loader(): Promise<PackagesData> {
  const startedAt = Date.now();
  const [npm, npmDownloads] = await Promise.all([
    fetchNpmScope(),
    fetchNpmDownloads(),
  ]);
  return {
    meta: {
      title: "moonshine — packages",
      description:
        "The @tschk/moonshine packages: kernel, compiler, router, server, renderers, host adapters and deployment adapters, with the versions npm is serving right now.",
    },
    npm,
    npmDownloads,
    renderedAt: new Date().toISOString(),
    loaderMs: Date.now() - startedAt,
  };
}

function Group({
  group,
  entries,
  versions,
}: {
  group: PackageEntry["group"];
  entries: PackageEntry[];
  versions: Map<string, string | null>;
}) {
  return (
    <section aria-labelledby={`group-${group}`}>
      <h2 id={`group-${group}`}>{GROUP_LABELS[group]}</h2>
      <div className="tablewrap" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Package</th>
              <th scope="col">Latest on npm</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const version = versions.get(entry.name) ?? null;
              return (
                <tr
                  key={entry.name}
                  className="reveal-row"
                  style={{ "--i": index } as CSSProperties}
                >
                  <th scope="row" translate="no">
                    <a
                      href={`https://www.npmjs.com/package/${entry.name}`}
                      rel="noopener noreferrer"
                    >
                      {entry.name}
                    </a>
                  </th>
                  <td className="num">
                    {version ?? <span className="muted">unavailable</span>}
                  </td>
                  <td className="wrapcell">{entry.role}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Packages({ data }: { data: PackagesData }) {
  const versions = new Map(
    data.npm.versions.map((entry) => [entry.name, entry.version]),
  );
  const { published, asked, distinct } = data.npm;

  return (
    <Chrome current="/packages">
      <section>
        <h1>packages</h1>
        <p className="lede">
          Install the kernel alone and nothing else comes with it; every other
          layer is a separate dependency you opt into.
        </p>
        <div className="panel">
          <div className="panel-head">
            <span className="dot" aria-hidden="true" />
            <span>counted on the npm registry, this request</span>
          </div>
          <dl className="kv">
            <dt>published</dt>
            <dd>
              {published} of {asked} asked for
            </dd>
            <dt>versions</dt>
            <dd>
              {distinct.length > 0
                ? distinct.join(", ")
                : "registry unavailable"}
            </dd>
            <dt>registry</dt>
            <dd>{data.npm.elapsedMs} ms for the whole fan-out</dd>
            <dt>loader</dt>
            <dd>
              {data.loaderMs} ms · {data.renderedAt}
            </dd>
          </dl>
        </div>
      </section>
      <Group
        group="core"
        entries={PACKAGES.filter((entry) => entry.group === "core")}
        versions={versions}
      />
      <Group
        group="adapter"
        entries={PACKAGES.filter((entry) => entry.group === "adapter")}
        versions={versions}
      />
      <Group
        group="deploy"
        entries={PACKAGES.filter((entry) => entry.group === "deploy")}
        versions={versions}
      />
      <section aria-labelledby="downloads-heading">
        <h2 id="downloads-heading">Downloads</h2>
        <p>
          Daily downloads of <code translate="no">@tschk/moonshine</code> for
          the last month, read from npm&rsquo;s download API while this response
          was built. Hover or focus the chart to move the readout.
        </p>
        <DownloadChart id="moonshine" series={data.npmDownloads} />
      </section>
      <section>
        <h2>Machine-readable</h2>
        <p>
          The same list, plus this Worker&rsquo;s live request state and the{" "}
          <Crepuscularity /> crate versions, is served as JSON from{" "}
          <a href="/api/state">/api/state</a>. Everything here lives under{" "}
          <TscHk />.
        </p>
      </section>
    </Chrome>
  );
}
