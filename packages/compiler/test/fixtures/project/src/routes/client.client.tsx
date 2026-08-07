// Reads process.env deliberately: browsers have no `process`, so this is the
// shape that used to throw `ReferenceError: process is not defined` while the
// client entry evaluated, leaving the page blank with no error boundary.
const apiBase = process.env.MOONSHINE_TEST_API_BASE ?? "unset";

export default function ClientPage() {
  return <h1>client {apiBase}</h1>;
}
