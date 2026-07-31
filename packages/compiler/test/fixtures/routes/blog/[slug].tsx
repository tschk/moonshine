export default function BlogPostPage({ data }: { data: unknown }) {
  return <h1>{String(data)}</h1>;
}
