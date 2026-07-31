type HomeProps = {
  data?: { title?: string };
};

export default function Home({ data }: HomeProps) {
  return <h1>{data?.title ?? "Home"}</h1>;
}
