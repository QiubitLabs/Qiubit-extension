/**
 * Generates the transaction-feedback Lottie set (pure shapes, no images):
 *
 *   success-check.json — "Wallet Ready": green circle pops, check draws
 *                        itself, radar ring, confetti burst + sparkles
 *   tx-sent.json       — "Transaction Sent": cyan circle pops, up-arrow
 *                        draws, little coins rise, radar ring
 *   tx-failed.json     — "Transaction Failed": red circle pops, X draws,
 *                        head-shake, small red sparks
 *
 * All are one-shot animations (play once, hold the last frame).
 * Preview: preview-feedback.html (open directly, no server).
 *
 * Usage: node scripts/lottie/generate-feedback.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CYAN,
  GREEN,
  RED,
  VIOLET,
  WHITE,
  kf,
  kfSpring,
  staticVal,
  shapeTransform,
  fill,
  stroke,
  circle,
  polyline,
  trimDraw,
  shapeLayer,
  at,
  doc,
} from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 240;
const C = W / 2;

// ---------------------------------------------------------------------------
// shared building blocks
// ---------------------------------------------------------------------------

/** Linear keyframes (constant speed — used for seamless rotation loops). */
const kfLinear = (frames) => ({
  a: 1,
  k: frames.map(({ t, s }, i) => ({
    t,
    s,
    ...(i < frames.length - 1
      ? { i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] } }
      : {}),
  })),
});

/** Main filled badge circle popping in with overshoot. */
function badge({ color, popEnd = 26, op, start = 0 }) {
  return shapeLayer({
    ind: 90,
    nm: "badge",
    op,
    ks: at(C, C, {
      o: kfSpring([
        { t: start, s: [0] },
        { t: start + 10, s: [100] },
        { t: op, s: [100] },
      ]),
      s: kfSpring([
        { t: start, s: [0, 0, 100] },
        { t: start + popEnd * 0.65, s: [112, 112, 100] },
        { t: start + popEnd, s: [100, 100, 100] },
        { t: op, s: [100, 100, 100] },
      ]),
    }),
    shapes: [
      {
        ty: "gr",
        nm: "circle",
        it: [circle(0, 0, 96), fill(color), shapeTransform()],
      },
    ],
  });
}

/** Radar ring expanding + fading once. */
function ring({ color, start, dur, op }) {
  return shapeLayer({
    ind: 91,
    nm: "ring",
    op,
    ks: at(C, C, {
      o: kf([
        { t: 0, s: [0] },
        { t: start, s: [0] },
        { t: start + 1, s: [55] },
        { t: start + dur, s: [0] },
        { t: op, s: [0] },
      ]),
      s: kf([
        { t: start, s: [80, 80, 100] },
        { t: start + dur, s: [175, 175, 100] },
      ]),
    }),
    shapes: [
      {
        ty: "gr",
        nm: "ring",
        it: [circle(0, 0, 96), stroke(color, 4), shapeTransform()],
      },
    ],
  });
}

/** A stroked glyph (check / arrow / X piece) drawing itself inside the badge. */
function glyph({ ind, nm, points, drawFrom, drawTo, width = 11, op }) {
  return shapeLayer({
    ind,
    nm,
    op,
    ks: at(C, C),
    shapes: [
      {
        ty: "gr",
        nm,
        it: [
          polyline(points),
          trimDraw(drawFrom, drawTo),
          stroke(WHITE, width),
          shapeTransform(),
        ],
      },
    ],
  });
}

/** Confetti burst: bits fly outward from the center, spin, and fall. */
function confetti({ start, op }) {
  const bits = [
    { angle: -80, dist: 92, color: CYAN, size: 8, kind: "rect", delay: 0 },
    { angle: -35, dist: 100, color: VIOLET, size: 7, kind: "circle", delay: 2 },
    { angle: -120, dist: 96, color: GREEN, size: 7, kind: "rect", delay: 3 },
    { angle: 15, dist: 88, color: WHITE, size: 5, kind: "circle", delay: 5 },
    { angle: -60, dist: 108, color: VIOLET, size: 6, kind: "rect", delay: 6 },
    { angle: 165, dist: 88, color: CYAN, size: 6, kind: "circle", delay: 4 },
    { angle: -145, dist: 102, color: WHITE, size: 6, kind: "rect", delay: 7 },
    { angle: 205, dist: 94, color: GREEN, size: 5, kind: "circle", delay: 8 },
    { angle: -100, dist: 112, color: CYAN, size: 5, kind: "rect", delay: 9 },
    { angle: 40, dist: 96, color: VIOLET, size: 6, kind: "rect", delay: 1 },
  ];
  const groups = bits.map((b, i) => {
    const rad = (b.angle * Math.PI) / 180;
    const tx = Math.cos(rad) * b.dist;
    const ty = Math.sin(rad) * b.dist;
    const t0 = start + b.delay;
    const t1 = t0 + 44;
    const shape =
      b.kind === "rect"
        ? {
            ty: "rc",
            nm: "bit",
            p: staticVal([0, 0]),
            s: staticVal([b.size, b.size * 1.6]),
            r: staticVal(1.5),
          }
        : circle(0, 0, b.size);
    return {
      ty: "gr",
      nm: `bit-${i}`,
      it: [
        shape,
        fill(b.color),
        {
          ty: "tr",
          p: kf([
            { t: t0, s: [0, 0] },
            { t: t0 + 26, s: [tx, ty] },
            { t: t1, s: [tx, ty + 16] }, // gravity settles it downward
          ]),
          a: staticVal([0, 0]),
          s: kf([
            { t: t0, s: [0, 0] },
            { t: t0 + 6, s: [100, 100] },
            { t: t1, s: [70, 70] },
          ]),
          r: kf([
            { t: t0, s: [0] },
            { t: t1, s: [b.kind === "rect" ? 260 : 120] },
          ]),
          o: kf([
            { t: t0, s: [100] },
            { t: t0 + 30, s: [100] },
            { t: t1, s: [0] },
          ]),
        },
      ],
    };
  });
  return shapeLayer({
    ind: 60,
    nm: "confetti",
    op,
    ks: at(C, C),
    shapes: groups,
  });
}

/** A 4-point sparkle twinkling once. */
function sparkleOnce({ ind, x, y, size, color, start, op }) {
  const dur = 26;
  return shapeLayer({
    ind,
    nm: `sparkle-${ind}`,
    op,
    ks: at(C + x, C + y, {
      s: kf([
        { t: start, s: [0, 0, 100] },
        { t: start + dur / 2, s: [100, 100, 100] },
        { t: start + dur, s: [0, 0, 100] },
      ]),
      r: kf([
        { t: start, s: [0] },
        { t: start + dur, s: [90] },
      ]),
    }),
    shapes: [
      {
        ty: "gr",
        nm: "star",
        it: [
          {
            ty: "sr",
            nm: "spark",
            sy: 1,
            d: 1,
            pt: staticVal(4),
            p: staticVal([0, 0]),
            r: staticVal(0),
            ir: staticVal(size * 0.28),
            is: staticVal(0),
            or: staticVal(size),
            os: staticVal(0),
          },
          fill(color),
          shapeTransform(),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. success-check — "Wallet Ready!"
// ---------------------------------------------------------------------------

function successCheck() {
  const op = 120;
  return doc({
    nm: "Success Check",
    w: W,
    h: W,
    op,
    layers: [
      sparkleOnce({ ind: 1, x: 74, y: -62, size: 10, color: CYAN, start: 46, op }),
      sparkleOnce({ ind: 2, x: -80, y: -40, size: 8, color: WHITE, start: 56, op }),
      sparkleOnce({ ind: 3, x: 64, y: 66, size: 9, color: VIOLET, start: 64, op }),
      confetti({ start: 20, op }),
      glyph({
        ind: 10,
        nm: "check",
        points: [
          [-21, 3],
          [-6, 18],
          [24, -14],
        ],
        drawFrom: 18,
        drawTo: 42,
        op,
      }),
      ring({ color: GREEN, start: 14, dur: 40, op }),
      badge({ color: GREEN, op }),
    ],
  });
}

// ---------------------------------------------------------------------------
// 2. tx-sent — "Transaction Sent"
// ---------------------------------------------------------------------------

/** Little coin rising past the badge and fading. */
function risingCoin({ ind, x, startY, size, start, op }) {
  const dur = 46;
  return shapeLayer({
    ind,
    nm: `coin-${ind}`,
    op,
    ks: at(C + x, C + startY, {
      p: kf([
        { t: start, s: [C + x, C + startY, 0] },
        { t: start + dur, s: [C + x, C + startY - 74, 0] },
      ]),
      o: kf([
        { t: start, s: [0] },
        { t: start + 8, s: [90] },
        { t: start + dur, s: [0] },
      ]),
      s: kfSpring([
        { t: start, s: [0, 0, 100] },
        { t: start + 8, s: [100, 100, 100] },
        { t: op, s: [100, 100, 100] },
      ]),
    }),
    shapes: [
      {
        ty: "gr",
        nm: "coin",
        it: [
          circle(0, 0, size * 0.6),
          stroke(WHITE, 1.6, 80),
          circle(0, 0, size),
          fill(CYAN),
          shapeTransform(),
        ],
      },
    ],
  });
}

function txSent() {
  const op = 120;
  return doc({
    nm: "Transaction Sent",
    w: W,
    h: W,
    op,
    layers: [
      sparkleOnce({ ind: 1, x: 70, y: -66, size: 9, color: CYAN, start: 50, op }),
      sparkleOnce({ ind: 2, x: -76, y: -48, size: 8, color: WHITE, start: 60, op }),
      risingCoin({ ind: 20, x: -70, startY: 46, size: 12, start: 26, op }),
      risingCoin({ ind: 21, x: 74, startY: 56, size: 9, start: 34, op }),
      risingCoin({ ind: 22, x: -58, startY: -20, size: 7, start: 44, op }),
      // arrow-up: shaft then head, drawn as one continuous stroke
      glyph({
        ind: 10,
        nm: "arrow-shaft",
        points: [
          [0, 24],
          [0, -18],
        ],
        drawFrom: 16,
        drawTo: 32,
        op,
      }),
      glyph({
        ind: 11,
        nm: "arrow-head",
        points: [
          [-15, -5],
          [0, -20],
          [15, -5],
        ],
        drawFrom: 28,
        drawTo: 44,
        op,
      }),
      ring({ color: CYAN, start: 14, dur: 40, op }),
      badge({ color: CYAN, op }),
    ],
  });
}

// ---------------------------------------------------------------------------
// 3. tx-failed — "Transaction Failed"
// ---------------------------------------------------------------------------

function txFailed() {
  const op = 110;
  // head-shake after the X lands
  const shake = kf([
    { t: 0, s: [C, C, 0] },
    { t: 46, s: [C, C, 0] },
    { t: 52, s: [C - 7, C, 0] },
    { t: 58, s: [C + 6, C, 0] },
    { t: 64, s: [C - 4, C, 0] },
    { t: 70, s: [C + 2, C, 0] },
    { t: 76, s: [C, C, 0] },
  ]);

  const shaken = (layer) => ({
    ...layer,
    ks: { ...layer.ks, p: shake },
  });

  return doc({
    nm: "Transaction Failed",
    w: W,
    h: W,
    op: 110,
    layers: [
      sparkleOnce({ ind: 1, x: 72, y: -58, size: 8, color: RED, start: 48, op: 110 }),
      sparkleOnce({ ind: 2, x: -74, y: 52, size: 7, color: WHITE, start: 56, op: 110 }),
      shaken(
        glyph({
          ind: 10,
          nm: "x-1",
          points: [
            [-16, -16],
            [16, 16],
          ],
          drawFrom: 18,
          drawTo: 32,
          op: 110,
        }),
      ),
      shaken(
        glyph({
          ind: 11,
          nm: "x-2",
          points: [
            [16, -16],
            [-16, 16],
          ],
          drawFrom: 30,
          drawTo: 44,
          op: 110,
        }),
      ),
      ring({ color: RED, start: 14, dur: 38, op: 110 }),
      shaken(badge({ color: RED, op: 110 })),
    ],
  });
}

// ---------------------------------------------------------------------------
// 4. swap-success — two tokens trade places, then the check lands
// ---------------------------------------------------------------------------

/** One of the two swapping token circles, arcing over/under the center. */
function swapToken({ ind, color, fromX, viaY, start, mergeAt, op }) {
  const toX = -fromX;
  return shapeLayer({
    ind,
    nm: `token-${ind}`,
    op,
    ks: at(C + fromX, C, {
      o: kfSpring([
        { t: 0, s: [0] },
        { t: 8, s: [100] },
        { t: mergeAt, s: [100] },
        { t: mergeAt + 10, s: [0] },
        { t: op, s: [0] },
      ]),
      p: kf([
        { t: start, s: [C + fromX, C, 0] },
        { t: start + 12, s: [C, C + viaY, 0] },
        { t: start + 24, s: [C + toX, C, 0] },
        { t: mergeAt, s: [C + toX, C, 0] },
        { t: mergeAt + 10, s: [C, C, 0] },
      ]),
      s: kfSpring([
        { t: 0, s: [0, 0, 100] },
        { t: 10, s: [100, 100, 100] },
        { t: mergeAt, s: [100, 100, 100] },
        { t: mergeAt + 10, s: [30, 30, 100] },
      ]),
    }),
    shapes: [
      {
        ty: "gr",
        nm: "token",
        it: [circle(0, 0, 30), fill(color), shapeTransform()],
      },
    ],
  });
}

function swapSuccess() {
  const op = 130;
  const mergeAt = 40;
  const badgeStart = 46;
  return doc({
    nm: "Swap Success",
    w: W,
    h: W,
    op,
    layers: [
      sparkleOnce({ ind: 1, x: 72, y: -60, size: 9, color: CYAN, start: 88, op }),
      sparkleOnce({ ind: 2, x: -78, y: -44, size: 8, color: WHITE, start: 96, op }),
      sparkleOnce({ ind: 3, x: 62, y: 64, size: 8, color: VIOLET, start: 104, op }),
      glyph({
        ind: 10,
        nm: "check",
        points: [
          [-21, 3],
          [-6, 18],
          [24, -14],
        ],
        drawFrom: badgeStart + 16,
        drawTo: badgeStart + 38,
        op,
      }),
      swapToken({ ind: 20, color: CYAN, fromX: -32, viaY: -28, start: 12, mergeAt, op }),
      swapToken({ ind: 21, color: VIOLET, fromX: 32, viaY: 28, start: 12, mergeAt, op }),
      ring({ color: GREEN, start: badgeStart + 10, dur: 40, op }),
      badge({ color: GREEN, op, start: badgeStart }),
    ],
  });
}

// ---------------------------------------------------------------------------
// 5. tx-pending — seamless loop: rotating arc + pulsing core
// ---------------------------------------------------------------------------

function txPending() {
  const op = 120; // every layer returns to its frame-0 state — seamless loop

  /** Small comet dot orbiting the outer ring; trailing copies fade behind. */
  const cometDot = (ind, angleOffset, size, opacity) =>
    shapeLayer({
      ind,
      nm: `comet-${ind}`,
      op,
      ks: at(C, C, {
        // start offset by angleOffset; +360 over the cycle keeps it seamless
        r: kfLinear([
          { t: 0, s: [angleOffset] },
          { t: op, s: [angleOffset + 360] },
        ]),
      }),
      shapes: [
        {
          ty: "gr",
          nm: "dot",
          it: [circle(0, -48, size), fill(CYAN, opacity), shapeTransform()],
        },
      ],
    });

  return doc({
    nm: "Transaction Pending",
    w: W,
    h: W,
    op,
    layers: [
      // comet head + two trailing dots on the outer ring
      cometDot(1, 0, 10, 100),
      cometDot(2, -16, 7, 55),
      cometDot(3, -30, 5, 30),

      // main arc: gradient cyan→violet, length "breathes" 18%→70%→18% while
      // spinning two full turns per cycle — the classic chasing spinner
      shapeLayer({
        ind: 4,
        nm: "main-arc",
        op,
        ks: at(C, C, {
          r: kfLinear([
            { t: 0, s: [0] },
            { t: op, s: [720] },
          ]),
        }),
        shapes: [
          {
            ty: "gr",
            nm: "arc",
            it: [
              circle(0, 0, 96),
              {
                ty: "tm",
                nm: "breathe",
                s: staticVal(0),
                e: kf([
                  { t: 0, s: [18] },
                  { t: op / 2, s: [70] },
                  { t: op, s: [18] },
                ]),
                o: staticVal(0),
                m: 1,
              },
              {
                ty: "gs",
                nm: "gradient-stroke",
                t: 1,
                s: staticVal([-48, 0]),
                e: staticVal([48, 0]),
                g: { p: 2, k: staticVal([0, ...CYAN, 1, ...VIOLET]) },
                o: staticVal(100),
                w: staticVal(5.5),
                lc: 2,
                lj: 2,
              },
              shapeTransform(),
            ],
          },
        ],
      }),

      // faint full track under everything
      shapeLayer({
        ind: 6,
        nm: "track",
        op,
        ks: at(C, C),
        shapes: [
          {
            ty: "gr",
            nm: "track",
            it: [circle(0, 0, 96), stroke(CYAN, 5.5, 12), shapeTransform()],
          },
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// write files + combined preview
// ---------------------------------------------------------------------------

const animations = [
  { file: "success-check.json", label: "Wallet Ready", data: successCheck() },
  { file: "tx-sent.json", label: "Transaction Sent", data: txSent() },
  { file: "tx-failed.json", label: "Transaction Failed", data: txFailed() },
  { file: "swap-success.json", label: "Swap / Bridge Success", data: swapSuccess() },
  { file: "tx-pending.json", label: "Pending (loops)", data: txPending(), loop: true },
];

const ASSETS_DIR = join(__dirname, "..", "..", "src", "assets", "lottie");
for (const a of animations) {
  const json = JSON.stringify(a.data);
  writeFileSync(join(__dirname, a.file), json);
  // Keep the copies the wallet actually bundles in sync
  writeFileSync(join(ASSETS_DIR, a.file), json);
}

const preview = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Qiubit Feedback Animations — Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 20px;
    background: #141414;
    font-family: system-ui, -apple-system, sans-serif;
    color: #ffffff;
    padding: 24px;
  }
  .card {
    width: 260px;
    border: 1px solid #2a2a2a;
    border-radius: 16px;
    background: #0d0d0d;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px 18px;
    gap: 10px;
  }
  .anim { width: 150px; height: 150px; }
  .label { font-size: 14px; font-weight: 600; }
  .card button {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid #333333;
    background: #1a1a1a;
    color: #cccccc;
    font-size: 12px;
    cursor: pointer;
  }
  .card button:hover { background: #222222; }
</style>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js"></script>
  <script>
    const ANIMS = ${JSON.stringify(
      animations.map((a) => ({ label: a.label, data: a.data, loop: !!a.loop })),
    )};
    for (const { label, data, loop } of ANIMS) {
      const card = document.createElement("div");
      card.className = "card";
      const box = document.createElement("div");
      box.className = "anim";
      const title = document.createElement("div");
      title.className = "label";
      title.textContent = label;
      const btn = document.createElement("button");
      btn.textContent = "Replay";
      card.append(box, title, btn);
      document.body.appendChild(card);

      let anim;
      const play = () => {
        if (anim) anim.destroy();
        anim = lottie.loadAnimation({
          container: box,
          renderer: "svg",
          loop,              // one-shots hold the last frame; pending loops
          autoplay: true,
          animationData: data,
        });
      };
      btn.addEventListener("click", play);
      play();
    }
  </script>
</body>
</html>
`;

writeFileSync(join(__dirname, "preview-feedback.html"), preview);

const kb = (n) => (JSON.stringify(n).length / 1024).toFixed(1) + " KB";
console.log("Generated:");
for (const a of animations)
  console.log(`  scripts/lottie/${a.file}  ${kb(a.data)}`);
console.log("  scripts/lottie/preview-feedback.html");
