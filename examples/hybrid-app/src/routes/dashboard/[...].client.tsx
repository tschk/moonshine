import { createElement } from "react";
import { createRoot } from "react-dom/client";

export default function Dashboard() {
  return <h1>dashboard</h1>;
}

if (typeof document !== "undefined") {
  const el = document.getElementById("moonshine-app");
  if (el) {
    createRoot(el).render(createElement(Dashboard));
  }
}
