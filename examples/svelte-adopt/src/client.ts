import { hydrate } from "svelte";
import Counter from "./Counter.svelte";

hydrate(Counter as never, {
  target: document.getElementById("app")!,
  props: { start: 3 },
});
