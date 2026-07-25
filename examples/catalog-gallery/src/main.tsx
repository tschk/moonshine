import { useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AreaChart,
  Badge,
  BarChart,
  Button,
  Card,
  Dialog,
  Gradient,
  Progress,
  Sparkline,
  Toggle,
} from "@tschk/moonshine-components";

const sparkValues = [2, 4, 3, 7, 5, 9, 6, 8, 10, 7, 9, 11, 8];
const barValues = [4, 8, 5, 12, 9, 14, 7, 11];
const areaValues = [3, 5, 4, 8, 6, 10, 7, 12, 9, 11];

const sectionLabel: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ms-muted, #8b8b96)",
};

const section: CSSProperties = {
  marginTop: 36,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={section}>
      <h2 style={sectionLabel}>{title}</h2>
      {children}
    </section>
  );
}

function App() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toggled, setToggled] = useState(true);
  const [progress] = useState(0.62);

  return (
    <>
      <header style={{ marginBottom: 28 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 42,
            fontWeight: 600,
            letterSpacing: "-0.04em",
            fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
          }}
        >
          moonshine
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            color: "var(--ms-muted, #8b8b96)",
            fontSize: 15,
            lineHeight: 1.45,
            maxWidth: "42ch",
          }}
        >
          Catalog gallery — dither charts, primitives, and motion.
        </p>
      </header>

      <Section title="charts">
        <Sparkline values={sparkValues} color="blue" height={56} />
        <BarChart values={barValues} color="green" height={120} />
        <AreaChart values={areaValues} color="purple" height={120} />
      </Section>

      <Section title="primitives">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Button variant="solid" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Badge tone="accent">accent</Badge>
          <Badge tone="muted">muted</Badge>
          <Badge tone="success">success</Badge>
          <Toggle pressed={toggled} onPressedChange={setToggled}>
            {toggled ? "On" : "Off"}
          </Toggle>
        </div>

        <Card title="Card">
          Surface container for interactive content groups.
          <div style={{ marginTop: 12 }}>
            <Progress value={progress} />
          </div>
        </Card>

        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Dialog"
        >
          <p style={{ margin: "0 0 16px", color: "var(--ms-muted)" }}>
            Modal dialog surface with focus trap.
          </p>
          <Button variant="solid" onClick={() => setDialogOpen(false)}>
            Close
          </Button>
        </Dialog>
      </Section>

      <Section title="motion">
        <Gradient from="blue" to="purple" height={140} />
      </Section>
    </>
  );
}

const root = document.querySelector("#app");
if (!root) throw new Error("#app missing");
createRoot(root).render(<App />);
