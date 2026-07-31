export default function Page({
  params,
  data,
}: {
  params: Record<string, string>;
  data: unknown;
}) {
  const d = (data ?? {}) as Record<string, string>;
  return (
    <main data-moonshine-mode={d.mode ?? "default"}>
      <h1>{d.title ?? "Moonshine"}</h1>
      {d.message ? <p>{d.message}</p> : null}
      {Object.entries(params).map(([k, v]) => (
        <dl key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </dl>
      ))}
    </main>
  );
}
