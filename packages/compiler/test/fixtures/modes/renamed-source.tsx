import { cookies } from "./ssr-helpers";

export default function Page() {
  return <p>{cookies().get("session")?.value}</p>;
}
