export const STYLES = `
:root {
  --bg: #09090b;
  --panel: #0e0e11;
  --line: #27272a;
  --line-soft: #1c1c20;
  --fg: #e4e4e7;
  --fg-dim: #a1a1aa;
  --fg-faint: #71717a;
  --accent: #d4d4d8;
  --live: #a3e635;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; color-scheme: dark; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg-dim);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.75;
  font-variant-ligatures: none;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

a { color: var(--fg); text-decoration: none; border-bottom: 1px solid var(--line); }
a:hover { color: #fff; border-bottom-color: var(--fg-faint); }

:focus-visible {
  outline: 2px solid var(--live);
  outline-offset: 3px;
  border-radius: 1px;
}

.skip {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 8px 12px;
  z-index: 10;
}
.skip:focus { left: 12px; top: 12px; }

.wrap {
  max-width: 74ch;
  margin: 0 auto;
  padding: 28px 20px 72px;
}

.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 20px;
  padding-bottom: 28px;
}
.topbar nav { display: flex; flex-wrap: wrap; gap: 14px; }
.brand { color: var(--fg); border: 0; letter-spacing: 0.02em; }
.brand:hover { border: 0; }

h1, h2, h3, p, li { text-wrap: pretty; }
h1, h2, h3 { scroll-margin-top: 24px; }

h1 {
  color: #fafafa;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  margin: 0 0 10px;
}

h2 {
  color: var(--fg-faint);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  margin: 0 0 14px;
}

h3 { color: var(--fg); font-size: 13px; font-weight: 600; margin: 0 0 4px; }

p { margin: 0 0 14px; max-width: 68ch; }

section { padding: 30px 0; border-top: 1px solid var(--line-soft); }
section:first-of-type { border-top: 0; padding-top: 0; }

code, kbd { color: var(--fg); background: #17171a; padding: 1px 5px; border-radius: 2px; }

.lede { color: var(--fg); }
.muted { color: var(--fg-faint); }

.panel {
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 3px;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--line);
  font-size: 10.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--fg-faint);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--live);
  box-shadow: 0 0 0 0 rgba(163, 230, 53, 0.5);
  animation: pulse 2.4s ease-out infinite;
  flex: none;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(163, 230, 53, 0.45); }
  70% { box-shadow: 0 0 0 7px rgba(163, 230, 53, 0); }
  100% { box-shadow: 0 0 0 0 rgba(163, 230, 53, 0); }
}

.kv {
  display: grid;
  grid-template-columns: minmax(9ch, max-content) 1fr;
  gap: 2px 18px;
  margin: 0;
  padding: 14px;
}
.kv dt { color: var(--fg-faint); }
.kv dd { margin: 0; color: var(--fg); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }

.rows { display: flex; flex-direction: column; gap: 16px; }
.row { display: grid; grid-template-columns: 16ch 1fr; gap: 4px 18px; }
.row > :first-child { color: var(--fg); }
.row > :last-child { color: var(--fg-dim); }

.tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 3px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { text-align: left; padding: 7px 14px; border-bottom: 1px solid var(--line-soft); white-space: nowrap; }
th { color: var(--fg-faint); font-weight: 500; }
tbody tr:last-child td { border-bottom: 0; }
td.num { text-align: right; color: var(--fg); font-variant-numeric: tabular-nums; }
td.wrapcell { white-space: normal; min-width: 30ch; }

ul.plain { list-style: none; margin: 0 0 14px; padding: 0; }
ul.plain li { padding-left: 16px; position: relative; }
ul.plain li::before { content: "—"; position: absolute; left: 0; color: var(--fg-faint); }

pre {
  margin: 0;
  padding: 14px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.7;
  color: var(--fg);
}

.island-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; }

button {
  font: inherit;
  color: var(--fg);
  background: #17171a;
  border: 1px solid var(--line);
  border-radius: 2px;
  padding: 4px 12px;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: background 120ms ease, border-color 120ms ease;
}
button:hover:not(:disabled) { background: #202024; border-color: var(--fg-faint); }
button:disabled { opacity: 0.45; cursor: not-allowed; }

.graph { display: grid; grid-template-columns: minmax(11ch, max-content) 1fr; gap: 2px 18px; }
.graph dt { color: var(--fg-faint); }
.graph dd { margin: 0; color: var(--fg); font-variant-numeric: tabular-nums; }

.track {
  display: inline-block;
  vertical-align: middle;
  width: 120px;
  max-width: 45%;
  height: 8px;
  background: #17171a;
  border: 1px solid var(--line);
  border-radius: 1px;
  overflow: hidden;
}

.bar {
  display: block;
  height: 100%;
  background: var(--live);
  opacity: 0.8;
  max-width: 100%;
  transition: width 160ms ease;
}

.status { color: var(--fg-faint); font-size: 11.5px; }
.status[data-hydrated="true"] { color: var(--live); }

footer {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid var(--line-soft);
  color: var(--fg-faint);
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  justify-content: space-between;
}

@media (max-width: 560px) {
  .row { grid-template-columns: 1fr; gap: 0; }
  .kv { grid-template-columns: 1fr; gap: 0 0; }
  .kv dd { margin-bottom: 8px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
`;
