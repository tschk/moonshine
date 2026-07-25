import { createApp, renderCrepusIr } from "@tschk/crepus-moonshine";

function App() {
  return renderCrepusIr(
    {
      version: 1,
      root: [
        {
          kind: "stack",
          axis: "column",
          gap: 16,
          children: [
            { kind: "text", content: "moonshine × crepus", style: { fontSize: 22, fontWeight: 600 } },
            { kind: "badge", label: "View IR", tone: "accent" },
            {
              kind: "sparkline",
              values: [2, 4, 3, 7, 5, 9, 6, 8, 10, 7],
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
}

createApp({ root: App }).mount("#app");
