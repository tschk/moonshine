export function loader({ request }: { request: Request }) {
  return new URL(request.url).pathname;
}

export function action({ request }: { request: Request }) {
  return new URL(request.url).pathname;
}
