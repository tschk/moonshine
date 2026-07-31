export function loader() {
  return { url: "/about" };
}

export default function AboutPage({ data }: { data: { url: string } }) {
  return <h1>{data.url}</h1>;
}
