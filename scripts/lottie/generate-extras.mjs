/**
 * Generates the "extras" Lottie set (pure shapes, wallet theme):
 *
 *   empty-buddy.json  — wallet buddy idle (loops): floats, sways, blinks —
 *                       for empty states (no transactions / tokens / NFTs)
 *   dapp-connect.json — dApp chip and wallet chip linked by flowing dots
 *                       (loops) — for the dApp connect approval screen
 *
 * Preview: preview-extras.html (open directly, no server).
 *
 * Usage: node scripts/lottie/generate-extras.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CYAN,
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
  shapeLayer,
  at,
  doc,
} from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 240;
const C = W / 2;

const INK = [24 / 255, 26 / 255, 43 / 255];
const SNOW = [244 / 255, 245 / 255, 255 / 255];
const PINK = [255 / 255, 158 / 255, 198 / 255];

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

const rect = (x, y, w, h, rr) => ({
  ty: "rc",
  nm: "rect",
  p: staticVal([x, y]),
  s: staticVal([w, h]),
  r: staticVal(rr),
});

// ---------------------------------------------------------------------------
// wallet buddy (same design as the onboarding mascot)
// ---------------------------------------------------------------------------

const blinkScale = (blinkAts, op) => {
  const frames = [{ t: 0, s: [100, 100] }];
  for (const b of blinkAts) {
    frames.push(
      { t: b, s: [100, 100] },
      { t: b + 4, s: [100, 8] },
      { t: b + 8, s: [100, 100] },
    );
  }
  frames.push({ t: op, s: [100, 100] });
  return kf(frames);
};

function buddyShapes({ blinkAts, op }) {
  const eye = (x) => ({
    ty: "gr",
    nm: "eye",
    it: [
      circle(0, 0, 9),
      { ...circle(1.1, 0.9, 4.5), nm: "pupil" },
      fill(INK),
      {
        ty: "tr",
        p: staticVal([x, 10]),
        a: staticVal([0, 0]),
        s: blinkScale(blinkAts, op),
        r: staticVal(0),
        o: staticVal(100),
      },
    ],
  });
  const highlight = (x) => ({
    ty: "gr",
    nm: "eye-shine",
    it: [circle(x - 2, 8, 2.7), fill(WHITE), shapeTransform()],
  });
  return [
    eye(-12),
    eye(12),
    highlight(-12),
    highlight(12),
    {
      ty: "gr",
      nm: "smile",
      it: [
        {
          ty: "el",
          nm: "mouth",
          p: staticVal([0, 20]),
          s: staticVal([15, 12]),
        },
        {
          ty: "tm",
          nm: "bottom-arc",
          s: staticVal(33),
          e: staticVal(67),
          o: staticVal(0),
          m: 1,
        },
        stroke(INK, 2.4),
        shapeTransform(),
      ],
    },
    {
      ty: "gr",
      nm: "blush",
      it: [
        circle(-22, 17, 7),
        circle(22, 17, 7),
        { ...fill(PINK), o: staticVal(50) },
        shapeTransform(),
      ],
    },
    {
      ty: "gr",
      nm: "stitching",
      it: [
        rect(0, 10, 64, 40, 8),
        {
          ...stroke(INK, 1.5, 30),
          d: [
            { n: "d", nm: "dash", v: staticVal(4) },
            { n: "g", nm: "gap", v: staticVal(4) },
          ],
        },
        shapeTransform(),
      ],
    },
    { ty: "gr", nm: "clasp", it: [circle(34, 2, 8), fill(INK), shapeTransform()] },
    { ty: "gr", nm: "strap", it: [rect(31, 2, 18, 16, 8), fill(CYAN), shapeTransform()] },
    { ty: "gr", nm: "lid", it: [rect(0, -14, 74, 22, 10), fill(CYAN), shapeTransform()] },
    { ty: "gr", nm: "card", it: [rect(-16, -28, 30, 18, 4), fill(VIOLET), shapeTransform()] },
    { ty: "gr", nm: "body", it: [rect(0, 6, 74, 52, 12), fill(SNOW), shapeTransform()] },
  ];
}

/** 4-point sparkle twinkling once. */
function sparkleOnce({ ind, x, y, size, color, start, op }) {
  const dur = 28;
  return shapeLayer({
    ind,
    nm: `sparkle-${ind}`,
    op,
    ks: at(C + x, C + y, {
      s: kf([
        { t: 0, s: [0, 0, 100] },
        { t: start, s: [0, 0, 100] },
        { t: start + dur / 2, s: [100, 100, 100] },
        { t: start + dur, s: [0, 0, 100] },
        { t: op, s: [0, 0, 100] },
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
// 1. empty-buddy — idle loop for empty states
// ---------------------------------------------------------------------------

function emptyBuddy() {
  const op = 240; // frame 0 == frame 240 — seamless loop
  return doc({
    nm: "Empty State Buddy",
    w: W,
    h: W,
    op,
    layers: [
      sparkleOnce({ ind: 1, x: 62, y: -52, size: 9, color: CYAN, start: 66, op }),
      sparkleOnce({ ind: 2, x: -66, y: -34, size: 7, color: WHITE, start: 150, op }),
      // buddy floats, sways and blinks
      shapeLayer({
        ind: 10,
        nm: "buddy",
        op,
        ks: at(C, C, {
          p: kf([
            { t: 0, s: [C, C, 0] },
            { t: op / 2, s: [C, C - 10, 0] },
            { t: op, s: [C, C, 0] },
          ]),
          r: kf([
            { t: 0, s: [0] },
            { t: op / 4, s: [-4] },
            { t: (op * 3) / 4, s: [4] },
            { t: op, s: [0] },
          ]),
          s: staticVal([130, 130, 100]),
        }),
        shapes: buddyShapes({ blinkAts: [70, 180], op }),
      }),
      // soft shadow under the buddy, stretching as he floats up
      shapeLayer({
        ind: 20,
        nm: "shadow",
        op,
        ks: at(C, C + 62, {
          s: kf([
            { t: 0, s: [100, 100, 100] },
            { t: op / 2, s: [80, 80, 100] },
            { t: op, s: [100, 100, 100] },
          ]),
          o: kf([
            { t: 0, s: [22] },
            { t: op / 2, s: [12] },
            { t: op, s: [22] },
          ]),
        }),
        shapes: [
          {
            ty: "gr",
            nm: "shadow",
            it: [
              {
                ty: "el",
                nm: "ellipse",
                p: staticVal([0, 0]),
                s: staticVal([84, 14]),
              },
              fill(INK),
              shapeTransform(),
            ],
          },
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// 3. dapp-connect — dApp chip ↔ wallet chip, dots flowing between (loop)
// ---------------------------------------------------------------------------

function dappConnect() {
  const op = 180; // seamless loop
  const GAP = 62; // chip distance from center

  /** One of the two chips, bobbing gently. */
  const chip = (ind, nm, x, bob, glyphGroups) =>
    shapeLayer({
      ind,
      nm,
      op,
      ks: at(C + x, C, {
        p: kf([
          { t: 0, s: [C + x, C, 0] },
          { t: op / 2, s: [C + x, C + bob, 0] },
          { t: op, s: [C + x, C, 0] },
        ]),
      }),
      shapes: [
        ...glyphGroups,
        {
          ty: "gr",
          nm: "chip",
          it: [circle(0, 0, 52), fill(SNOW), shapeTransform()],
        },
      ],
    });

  // dApp glyph: a little globe (circle + meridian + equator)
  const globeGlyph = [
    {
      ty: "gr",
      nm: "globe",
      it: [
        circle(0, 0, 26),
        {
          ty: "el",
          nm: "meridian",
          p: staticVal([0, 0]),
          s: staticVal([13, 26]),
        },
        stroke(INK, 2.2),
        shapeTransform(),
      ],
    },
    {
      ty: "gr",
      nm: "equator",
      it: [polyline([[-13, 0], [13, 0]]), stroke(INK, 2.2), shapeTransform()],
    },
  ];

  // wallet side: the real Qiubit logo (white art), embedded as an image on
  // a dark chip so it stays visible
  const ICON_SIZE = 2160; // qiubit-icon.svg viewport
  const iconBuf = readFileSync(join(__dirname, "..", "..", "public", "qiubit-icon.svg"));
  const qiubitAsset = {
    id: "qiubit_icon",
    w: ICON_SIZE,
    h: ICON_SIZE,
    u: "",
    p: `data:image/svg+xml;base64,${iconBuf.toString("base64")}`,
    e: 1,
  };
  const walletBob = kf([
    { t: 0, s: [C + GAP, C, 0] },
    { t: op / 2, s: [C + GAP, C + 6, 0] },
    { t: op, s: [C + GAP, C, 0] },
  ]);
  const qiubitLogoLayer = {
    ddd: 0,
    ind: 3,
    ty: 2,
    nm: "qiubit-logo",
    refId: "qiubit_icon",
    sr: 1,
    ks: {
      o: staticVal(100),
      r: staticVal(0),
      p: walletBob,
      a: staticVal([ICON_SIZE / 2, ICON_SIZE / 2, 0]),
      s: staticVal([(34 / ICON_SIZE) * 100, (34 / ICON_SIZE) * 100, 100]),
    },
    ip: 0,
    op,
    st: 0,
  };
  const walletChipLayer = shapeLayer({
    ind: 4,
    nm: "wallet-chip",
    op,
    ks: { ...at(C + GAP, C), p: walletBob },
    shapes: [
      {
        ty: "gr",
        nm: "chip",
        it: [
          circle(0, 0, 52),
          fill([26 / 255, 26 / 255, 26 / 255]),
          stroke(CYAN, 2),
          shapeTransform(),
        ],
      },
    ],
  });

  // Five dots between the chips; a brightness wave flows left → right twice
  // per loop, so frame 0 and frame 180 match.
  const dots = Array.from({ length: 5 }, (_, i) => {
    const x = -28 + i * 14;
    const phase = (i / 5) * (op / 2); // stagger across half a cycle
    const wave = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      const base = cycle * (op / 2) + phase;
      wave.push(
        { t: base, s: [25] },
        { t: base + 12, s: [100] },
        { t: base + 30, s: [25] },
      );
    }
    return shapeLayer({
      ind: 30 + i,
      nm: `dot-${i}`,
      op,
      ks: at(C + x, C, {
        o: kf([
          { t: 0, s: [25] },
          ...wave.filter((f) => f.t > 0 && f.t < op),
          { t: op, s: [25] },
        ]),
      }),
      shapes: [
        {
          ty: "gr",
          nm: "dot",
          it: [circle(0, 0, 6), fill(CYAN), shapeTransform()],
        },
      ],
    });
  });

  return doc({
    nm: "dApp Connect",
    w: W,
    h: W,
    op,
    assets: [qiubitAsset],
    layers: [
      ...dots,
      chip(1, "dapp-chip", -GAP, -6, globeGlyph),
      qiubitLogoLayer,
      walletChipLayer,
    ],
  });
}

// ---------------------------------------------------------------------------
// write files + combined preview
// ---------------------------------------------------------------------------

const animations = [
  { file: "empty-buddy.json", label: "Empty State (loops)", data: emptyBuddy(), loop: true },
  { file: "dapp-connect.json", label: "dApp Connect (loops)", data: dappConnect(), loop: true },
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
<title>Qiubit Extra Animations — Preview</title>
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
  .anim { width: 160px; height: 160px; }
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
          loop,
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

writeFileSync(join(__dirname, "preview-extras.html"), preview);

const kb = (n) => (JSON.stringify(n).length / 1024).toFixed(1) + " KB";
console.log("Generated:");
for (const a of animations)
  console.log(`  scripts/lottie/${a.file}  ${kb(a.data)}`);
console.log("  scripts/lottie/preview-extras.html");
