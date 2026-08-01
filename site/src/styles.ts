export const STYLES = `
:root {
  --bg: #09090b;
  --panel: #0e0e11;
  --line: #27272a;
  --line-soft: #1c1c20;
  --fg: #e4e4e7;
  --fg-dim: #a1a1aa;
  /* Lifted from #71717a: that read at 4.24:1 on the page background, under
     the 4.5:1 floor for the small type this variable is used on. */
  --fg-faint: #8f8f99;
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
  padding: 28px max(20px, env(safe-area-inset-right)) 72px
    max(20px, env(safe-area-inset-left));
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
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
td.wrapcell { white-space: normal; min-width: 22ch; }

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

/*
 * The fill is scaled, not resized: \`transform\` keeps the bar off the layout
 * path, so a recomputing memo never triggers reflow inside the track.
 */
.bar {
  display: block;
  height: 100%;
  width: 100%;
  background: var(--live);
  opacity: 0.8;
  transform-origin: left center;
  transform: scaleX(var(--fill, 0));
}

/*
 * The fill cell is the positioning context for the confetti canvas, which is
 * absolutely positioned and never in the layout path, so a burst cannot shift
 * anything or widen the page.
 */
.fillcell { position: relative; }

/* The canvas only exists while a burst is on screen: at rest it is display:none
   so it never overlaps the values it sits in front of. */
.confetti {
  display: none;
  position: absolute;
  left: 0;
  top: -70px;
  width: 100%;
  height: 150px;
  pointer-events: none;
}

/* Past 100% the track cannot grow, so it changes treatment instead: the
   border lights up and the fill goes striped while the label keeps counting. */
.track[data-over="true"] { border-color: var(--live); }
.track[data-over="true"] .bar {
  opacity: 1;
  background: repeating-linear-gradient(115deg, var(--live) 0 5px, #4d7c0f 5px 10px);
}

.fillnum { font-variant-numeric: tabular-nums; }
.fillnum[data-over="true"] { color: var(--live); font-weight: 600; }

/* Full-bleed strip: the reading column is 74ch, but the carousel spans the
   viewport. 100vw includes the scrollbar gutter, so the row is clipped to the
   page width to avoid introducing a horizontal scrollbar of its own. */
.bleed {
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  width: 100vw;
  max-width: 100vw;
  overflow: hidden;
  margin-bottom: 18px;
}
.bleed-note {
  max-width: none;
  text-align: center;
  margin: 8px 0 0;
  font-size: 12px;
}

.carousel { position: relative; }
.carousel-track { display: flex; flex-wrap: wrap; }
.carousel .carousel-dup { display: none; }

.dl {
  margin: 0;
  padding: 12px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dl-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 2px 16px;
  font-size: 11.5px;
}
.dl-sub { color: var(--fg); overflow-wrap: anywhere; }
.dl-read { color: var(--fg-faint); font-variant-numeric: tabular-nums; }
.dl-read strong { color: var(--fg); font-weight: 600; }
.dl-read[data-tracking="yes"],
.dl-read[data-tracking="yes"] strong { color: var(--live); }

.dl-svg { display: block; width: 100%; height: auto; aspect-ratio: 600 / 140; }
.dl-base { stroke: var(--line); stroke-width: 1; }
.dl-line {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.dl-dim { stroke: var(--line); }
.dl-hot { stroke: var(--live); }
.dl-cursor line { stroke: var(--fg-faint); stroke-width: 1; }
.dl-cursor circle { fill: var(--live); stroke: var(--bg); stroke-width: 2; }

.dl-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 2px 12px;
  color: var(--fg-faint);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dl-note { margin: 6px 0 0; font-size: 11.5px; }

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

.chips {
  list-style: none;
  margin: 0;
  padding: 12px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chips li {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: #17171a;
  padding: 2px 8px;
  font-size: 11.5px;
  max-width: 100%;
}
.chips a { border: 0; overflow-wrap: anywhere; }
.chip-v { color: var(--live); font-variant-numeric: tabular-nums; }

@media (max-width: 560px) {
  .row { grid-template-columns: 1fr; gap: 0; }
  .kv { grid-template-columns: 1fr; gap: 0 0; }
  .kv dd { margin-bottom: 8px; }
}

/*
 * Motion lives in one block, opt-in rather than opt-out: under
 * \`prefers-reduced-motion: reduce\` none of these rules are ever parsed, so
 * there is no animation left to override. Only transform, opacity and colour
 * are animated, so nothing below can move layout.
 */
@media (prefers-reduced-motion: no-preference) {
  @keyframes rise {
    from { opacity: 0; transform: translate3d(0, 6px, 0); }
    to { opacity: 1; transform: none; }
  }

  @keyframes flash {
    from { color: var(--live); }
    to { color: var(--fg); }
  }

  main > section,
  .topbar,
  footer {
    animation: rise 460ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  .topbar { animation-delay: 0ms; }
  main > section:nth-of-type(1) { animation-delay: 60ms; }
  main > section:nth-of-type(2) { animation-delay: 110ms; }
  main > section:nth-of-type(3) { animation-delay: 160ms; }
  main > section:nth-of-type(4) { animation-delay: 210ms; }
  main > section:nth-of-type(n + 5) { animation-delay: 260ms; }
  footer { animation-delay: 300ms; }

  /* Per-request values arrive new on every render; they settle from live to
     resting colour instead of appearing already stale. */
  .kv dd,
  .chip-v {
    animation: flash 900ms ease-out 220ms both;
  }

  .chips li {
    animation: rise 400ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
    animation-delay: calc(260ms + var(--i, 0) * 18ms);
  }

  .reveal-row {
    animation: rise 380ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
    animation-delay: calc(120ms + var(--i, 0) * 22ms);
  }

  a { position: relative; transition: color 140ms ease, border-color 140ms ease; }
  a:not(.brand):not(.skip)::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    border-bottom: 1px solid var(--live);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  a:not(.brand):not(.skip):hover::after,
  a:not(.brand):not(.skip):focus-visible::after { transform: scaleX(1); }

  .bar { transition: transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1); }
  .status { transition: color 240ms ease; }

  /*
   * Cross-document view transitions. Navigation here is a full document load
   * with no client router, so the browser drives this entirely from CSS; a
   * browser without support simply ignores the rule and navigates normally.
   */
  @view-transition { navigation: auto; }

  /* The pivot link is the same named element on both pages, so the browser
     morphs the anchor's box and cross-fades its old label into its new one
     instead of the whole page fading as one. The brand and footer are named
     too so the chrome stays put while only the content crossfades. */
  .pivot { view-transition-name: pivot; }
  .brand { view-transition-name: brand; }
  footer { view-transition-name: sitefoot; }

  ::view-transition-old(root),
  ::view-transition-new(root) { animation-duration: 260ms; }
  ::view-transition-old(pivot),
  ::view-transition-new(pivot) {
    animation-duration: 320ms;
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  ::view-transition-group(pivot) { animation-duration: 320ms; }

  @keyframes marquee {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(-50%, 0, 0); }
  }

  /* Auto-advance only exists here, so the reduce path never sees a carousel:
     the track keeps its wrapping flex layout and the duplicate row stays
     display:none, leaving the plain static chip list. */
  .carousel {
    overflow-x: auto;
    scrollbar-width: none;
    mask-image: linear-gradient(
      90deg,
      transparent 0,
      #000 22px,
      #000 calc(100% - 22px),
      transparent 100%
    );
  }
  .carousel::-webkit-scrollbar { display: none; }
  .carousel .chips { flex-wrap: nowrap; }
  .carousel .carousel-dup { display: flex; }
  .carousel-track {
    flex-wrap: nowrap;
    width: max-content;
    animation: marquee 60s linear infinite;
  }
  .carousel:hover .carousel-track,
  .carousel:focus-within .carousel-track { animation-play-state: paused; }

  @keyframes dl-draw {
    from { stroke-dashoffset: 1600; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes dl-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dl-hot {
    stroke-dasharray: 1600;
    animation: dl-draw 1100ms cubic-bezier(0.22, 0.61, 0.36, 1) 180ms both;
  }
  .dl-area { animation: dl-fade 700ms ease 620ms both; }
  .dl-dim { animation: dl-fade 600ms ease 840ms both; }
  .dl-read { transition: color 160ms ease; }
  button { transition: background 140ms ease, border-color 140ms ease, transform 90ms ease; }
  button:active:not(:disabled) { transform: translate3d(0, 1px, 0); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
`;
