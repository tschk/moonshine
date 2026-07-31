import { createApp, createSignal, useSignal } from "@tschk/moonshine/react";
import { useFragmentShader } from "@tschk/moonshine-shaders";

const speed = createSignal(1);

function plasmaSource(speedValue: number): string {
  const s = speedValue.toFixed(3);
  return `
vec4 shade(vec2 uv, float t) {
  t *= ${s};
  float x = uv.x * 3.0;
  float y = uv.y * 3.0;
  float v = sin(x + t);
  v += sin(y + t * 0.7);
  v += sin(x + y + t * 0.4);
  float cx = uv.x + 0.5 * sin(t / 3.0);
  float cy = uv.y + 0.5 * cos(t / 2.0);
  v += sin(sqrt(cx * cx + cy * cy) * 6.0 + t);
  v *= 0.5;
  vec3 col = 0.5 + 0.5 * cos(6.2831 * (vec3(v, v + 0.33, v + 0.67)));
  return vec4(col, 1.0);
}
`;
}

function Plasma() {
  const s = useSignal(speed);
  const { canvasRef, setSource } = useFragmentShader(plasmaSource(s), {
    animate: true,
  });

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="canvas" />
      <div className="hud">
        <h1>moonshine shaders</h1>
        <p>
          <code>useFragmentShader</code> from{" "}
          <code>@tschk/moonshine-shaders</code>
        </p>
        <p className="muted">
          Same module as <code>@tschk/moonshine-next/shaders</code> — use in Next
          client islands or Bun hydrate.
        </p>
        <label>
          speed {s.toFixed(2)}
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={s}
            onChange={(e) => {
              const next = Number(e.target.value);
              speed.set(next);
              setSource(plasmaSource(next));
            }}
          />
        </label>
      </div>
    </div>
  );
}

createApp({ root: Plasma }).mount("#app");
