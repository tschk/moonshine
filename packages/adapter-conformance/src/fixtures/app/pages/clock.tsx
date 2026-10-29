let renders = 0;

// Counts renders, so a reused response is observable.
export const loader = () => ({ render: ++renders });

export default function Clock({
  data,
}: {
  data: Record<string, { render: number }>;
}) {
  return <p>render {data.clock?.render}</p>;
}
