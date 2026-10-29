import { useState } from "react";
import type { RouteContext } from "@tschk/moonshine-server";

export const loader = (ctx: RouteContext) => ({ name: ctx.params.name });

// The hook fails if route modules and the renderer use different React copies.
export default function Hello({
  data,
}: {
  data: Record<string, { name: string }>;
}) {
  const [greeting] = useState("hello");
  return <p>{`${greeting} ${data.hello?.name}`}</p>;
}
