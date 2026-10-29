export const loader = () => ({ title: "Home from loader" });

export default function Home({
  data,
}: {
  data: Record<string, { title: string }>;
}) {
  return <h1>{data.home?.title}</h1>;
}
