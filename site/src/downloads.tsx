import { jsonForScript } from "./edge";
import Downloads, {
  DOWNLOADS_ISLAND,
  DownloadsUnavailable,
} from "./islands/downloads";
import type { DownloadSeries } from "./registry";

/**
 * A download chart is server-rendered from the series the loader read, then
 * hydrated so the readout can follow the cursor. When the registry had nothing
 * the island is not mounted at all and the unavailable state is plain HTML.
 */
export function DownloadChart({
  id,
  series,
}: {
  id: string;
  series: DownloadSeries;
}) {
  if (!series.ok || series.points.length === 0) {
    return <DownloadsUnavailable series={series} />;
  }
  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <span className="dot" aria-hidden="true" />
          <span>
            {series.source} downloads · read in {series.elapsedMs} ms
          </span>
        </div>
        <div data-island={DOWNLOADS_ISLAND} data-chart-id={id}>
          <Downloads id={id} series={series} />
        </div>
      </div>
      <script
        type="application/json"
        data-island-props={`${DOWNLOADS_ISLAND}:${id}`}
        dangerouslySetInnerHTML={{ __html: jsonForScript({ id, series }) }}
      />
    </>
  );
}
