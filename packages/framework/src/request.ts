/** Opt-in server request context; deliberately absent from the root barrel. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestScope } from "./renderer";

const requests = new AsyncLocalStorage<Request>();

export const runWithRequest: RequestScope = (request, fn) =>
  requests.run(request, fn);

export function getRequest(): Request | undefined {
  return requests.getStore();
}
