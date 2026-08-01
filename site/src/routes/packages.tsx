import { Chrome } from "../chrome";
import { GROUP_LABELS, PACKAGES, type PackageEntry } from "../packages";
import { fetchNpmLatest } from "../edge";
import type { PageData } from "../renderer";

type PackagesData = PageData & {
  npmLatest: string | null;
  renderedAt: string;
};

export async function loader(): Promise<PackagesData> {
  return {
    meta: {
      title: "moonshine — packages",
      description:
        "The nineteen @tschk/moonshine packages: kernel, compiler, router, server, renderers, host adapters and deployment adapters.",
    },
    npmLatest: await fetchNpmLatest(),
    renderedAt: new Date().toISOString(),
  };
}

function Group({
  group,
  entries,
}: {
  group: PackageEntry["group"];
  entries: PackageEntry[];
}) {
  return (
    <section aria-labelledby={`group-${group}`}>
      <h2 id={`group-${group}`}>{GROUP_LABELS[group]}</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Package</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.name}>
                <th scope="row">
                  <a href={`https://www.npmjs.com/package/${entry.name}`}>
                    {entry.name}
                  </a>
                </th>
                <td className="wrapcell">{entry.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Packages({ data }: { data: PackagesData }) {
  return (
    <Chrome current="/packages">
      <section>
        <h1>packages</h1>
        <p className="lede">
          Nineteen packages. Install the kernel alone and nothing else comes
          with it; every other layer is a separate dependency you opt into.
        </p>
        <p className="muted">
          Latest on npm at render time:{" "}
          <code>
            {data.npmLatest
              ? `@tschk/moonshine@${data.npmLatest}`
              : "registry unavailable"}
          </code>{" "}
          · fetched {data.renderedAt}
        </p>
      </section>
      <Group
        group="core"
        entries={PACKAGES.filter((entry) => entry.group === "core")}
      />
      <Group
        group="adapter"
        entries={PACKAGES.filter((entry) => entry.group === "adapter")}
      />
      <Group
        group="deploy"
        entries={PACKAGES.filter((entry) => entry.group === "deploy")}
      />
      <section>
        <h2>Machine-readable</h2>
        <p>
          The same list, plus this Worker&rsquo;s live request state, is served
          as JSON from <a href="/api/state">/api/state</a>.
        </p>
      </section>
    </Chrome>
  );
}
