import { createElement, Fragment, type CSSProperties } from "react";
import { createApp } from "@tschk/moonshine/react";
import { renderCrepusIr } from "@tschk/crepus-moonshine";
import { Sparkline, BarChart } from "@tschk/moonshine-components";

const sparkValues = [2, 4, 3, 7, 5, 9, 6, 8, 10, 7, 9, 11, 8];
const barValues = [4, 8, 5, 12, 9, 14, 7, 11];

function App() {
  const ir = renderCrepusIr(
    {
      version: 1,
      root: [
        {
          kind: "stack",
          axis: "column",
          spacing: 16,
          children: [
            { kind: "badge", label: "View IR", tone: "accent" },
            {
              kind: "sparkline",
              values: sparkValues,
              width: 280,
              height: 48,
              color: "#358ff3",
            },
            {
              kind: "list",
              children: [
                { kind: "listItem", label: "signals + createApp" },
                { kind: "listItem", label: "Bayer dither charts" },
                { kind: "listItem", label: "Jaspr IR → TS emit" },
              ],
            },
            {
              kind: "forEach",
              items: ["ready", "steady"],
              itemTemplate: { kind: "badge", label: "{item}", tone: "muted" },
            },
            {
              kind: "button",
              label: "Ping",
              onClick: "ping",
            },
          ],
        },
      ],
    },
    {
      onAction: (handler) => {
        console.log("action:", handler);
      },
    },
  );

  const subtitleStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "var(--ms-muted, #8b8b96)",
    fontSize: 15,
    lineHeight: 1.45,
    maxWidth: "36ch",
  };

  return createElement(
    Fragment,
    null,
    createElement(
      "header",
      { style: { marginBottom: 28 } },
      createElement(
        "h1",
        {
          style: {
            margin: 0,
            fontSize: 42,
            fontWeight: 600,
            letterSpacing: "-0.04em",
            fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
          },
        },
        "moonshine",
      ),
      createElement(
        "p",
        { style: subtitleStyle },
        "View IR bridge + Bayer dither kit — light React runtime.",
      ),
    ),
    ir,
    createElement(
      "section",
      {
        style: {
          marginTop: 32,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        },
      },
      createElement(
        "h2",
        {
          style: {
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ms-muted, #8b8b96)",
          },
        },
        "dither",
      ),
      createElement(Sparkline, {
        values: sparkValues,
        color: "blue",
        height: 56,
      }),
      createElement(BarChart, {
        values: barValues,
        color: "green",
        height: 120,
      }),
    ),
  );
}

createApp({ root: App }).mount("#app");
