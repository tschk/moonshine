import { describe, expect, test } from "bun:test";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { createState } from "../src/runes";
import {
  createAttachmentKey,
  fromAction,
  isAttachmentKey,
} from "../src/attachments";
import {
  blur,
  crossfade,
  draw,
  fade,
  fly,
  scale,
  slide,
} from "../src/transition";
import { flip } from "../src/animate";

describe("@tschk/moonshine-svelte/attachments", () => {
  test("createAttachmentKey generates distinct recognized symbols", () => {
    const k1 = createAttachmentKey();
    const k2 = createAttachmentKey();
    expect(typeof k1).toBe("symbol");
    expect(k1).not.toBe(k2);
    expect(isAttachmentKey(k1)).toBe(true);
    expect(isAttachmentKey(k2)).toBe(true);
    expect(isAttachmentKey("class")).toBe(false);
    expect(isAttachmentKey(Symbol("other"))).toBe(false);
  });

  test("fromAction converts a Svelte action into an Attachment with reactive update and cleanup", () => {
    const events: string[] = [];
    const myAction = (node: { id: string }, param: number) => {
      events.push(`init:${node.id}:${param}`);
      return {
        update(next: number) {
          events.push(`update:${node.id}:${next}`);
        },
        destroy() {
          events.push(`destroy:${node.id}`);
        },
      };
    };

    createRoot((dispose) => {
      const count = createState(1);
      const attachment = fromAction(myAction, () => count.value);
      const stop = attachment({ id: "btn" } as any);
      expect(events).toEqual(["init:btn:1"]);

      count.value = 2;
      expect(events).toEqual(["init:btn:1", "update:btn:2"]);

      // Same primitive value does not re-trigger update
      count.value = 2;
      expect(events).toEqual(["init:btn:1", "update:btn:2"]);

      if (typeof stop === "function") stop();
      expect(events).toEqual(["init:btn:1", "update:btn:2", "destroy:btn"]);
      dispose();
    });
  });
});

describe("@tschk/moonshine-svelte/transition & animate", () => {
  const fakeElement = {
    style: {
      opacity: "0.8",
      transform: "none",
      filter: "none",
      height: "100px",
      width: "200px",
      paddingTop: "10px",
      paddingBottom: "10px",
      marginTop: "0px",
      marginBottom: "0px",
      borderTopWidth: "2px",
      borderBottomWidth: "2px",
      strokeLinecap: "round",
      strokeWidth: "4",
    },
    getTotalLength: () => 96,
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
    }),
  } as unknown as Element & SVGElement & { getTotalLength(): number };

  test("fade, blur, fly, slide, scale, and draw compute transition CSS and durations", () => {
    const f = fade(fakeElement, { duration: 250 });
    expect(f.duration).toBe(250);
    expect(f.css!(0.5, 0.5)).toBe("opacity: 0.4");

    const b = blur(fakeElement, { amount: "10rem", opacity: 0.2 });
    expect(b.css!(0.5, 0.5)).toContain("blur(5rem)");

    const fl = fly(fakeElement, { x: 40, y: "20%", opacity: 0 });
    expect(fl.css!(0.5, 0.5)).toContain("translate(20px, 10%)");

    const sl = slide(fakeElement, { axis: "y" });
    expect(sl.css!(0.5, 0.5)).toContain("height: 50px");
    expect(sl.css!(0.5, 0.5)).toContain("padding-top: 5px");

    const sc = scale(fakeElement, { start: 0.5 });
    expect(sc.css!(0.5, 0.5)).toContain("scale(0.75)");

    const dr = draw(fakeElement, { speed: 2 });
    // 96 + 4 (round strokeLinecap) = 100; duration = 100 / 2 = 50
    expect(dr.duration).toBe(50);
    expect(dr.css!(0.5, 0.5)).toContain("stroke-dasharray: 100");
    expect(dr.css!(0.5, 0.5)).toContain("stroke-dashoffset: 50");
  });

  test("crossfade pairs send/receive nodes by key and falls back when unpaired", () => {
    const [send, receive] = crossfade({
      duration: 300,
      fallback: () => ({ duration: 150, css: (t) => `opacity: ${t}` }),
    });

    const nodeA = {
      style: { opacity: "1", transform: "none" },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 50 }),
    } as unknown as Element;
    const nodeB = {
      style: { opacity: "1", transform: "none" },
      getBoundingClientRect: () => ({
        left: 30,
        top: 40,
        width: 100,
        height: 100,
      }),
    } as unknown as Element;

    const sendFn = send(nodeA, { key: "item-1" });
    const receiveFn = receive(nodeB, { key: "item-1" });
    const cfg = receiveFn();
    expect(cfg.duration).toBe(300);
    expect(cfg.css!(0.5, 0.5)).toContain("translate(-15px,-20px)");
    expect(sendFn).toBeFunction();

    // Unpaired key uses fallback
    const orphanFn = send(nodeA, { key: "orphan" });
    expect(orphanFn().duration).toBe(150);
  });

  test("flip computes FLIP transform animation between from and to rects", () => {
    const anim = flip(
      fakeElement,
      {
        from: { left: 10, top: 20, width: 100, height: 50 },
        to: { left: 30, top: 60, width: 200, height: 100 },
      },
      { duration: 200 },
    );
    expect(anim.duration).toBe(200);
    expect(anim.css!(0.5, 0.5)).toBe(
      "transform: translate(-10px, -20px) scale(0.75, 0.75);",
    );
  });
});
