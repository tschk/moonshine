export default async function Page() {
  const name = "x";
  const mod = await import(`./${name}`);
  return mod;
}
