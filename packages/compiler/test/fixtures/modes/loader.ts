import { request } from "./request";

export function loader() {
  return request.url;
}
