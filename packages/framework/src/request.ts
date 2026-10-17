/** Opt-in server request context; deliberately absent from the root barrel. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestScope } from "./renderer";

const requests = new AsyncLocalStorage<{
  request: Request;
  responseHeaders?: Headers;
}>();

export const runWithRequest: RequestScope = (request, fn, responseHeaders) =>
  requests.run({ request, responseHeaders }, fn);

export function getRequest(): Request | undefined {
  return requests.getStore()?.request;
}

/** Response fields accumulated by the opt-in server pipeline for this request. */
export function getResponseHeaders(): Headers | undefined {
  return requests.getStore()?.responseHeaders;
}
