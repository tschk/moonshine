import { formatRequestId } from "./request-utils";

export default function Page() {
  return <p>{formatRequestId("abc")}</p>;
}
