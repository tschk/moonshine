import { island } from "../../src/islands";

const VisibleCounter = island(() => import("./Counter"), {
  hydrate: "visible",
});
const IdleGreet = island(() => import("./Greet"), { hydrate: "idle" });
const EagerCounter = island(() => import("./Counter"));

export default function DeferredIslandPage({
  data,
}: {
  data?: { eager?: boolean };
}) {
  return (
    <>
      <VisibleCounter start={3} />
      <IdleGreet name="Moon" />
      {data?.eager && <EagerCounter start={9} />}
    </>
  );
}
