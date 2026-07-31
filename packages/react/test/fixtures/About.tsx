type AboutProps = {
  params?: { name?: string };
};

export default function About({ params }: AboutProps) {
  return <p>Hello {params?.name ?? "world"}</p>;
}
