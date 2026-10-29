export const loader = () => ({ where: "edge function" });

export default function Edge({
  data,
}: {
  data: Record<string, { where: string }>;
}) {
  return <p>{data.edge?.where}</p>;
}
