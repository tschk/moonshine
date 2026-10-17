import { h } from "@tschk/moonshine-dom/ssr";

export default function About() {
  return h(
    "section",
    null,
    h("h1", null, "a static route"),
    h(
      "p",
      null,
      "Signals, HTML and DOM rendering are separate opt-in modules.",
    ),
  );
}
