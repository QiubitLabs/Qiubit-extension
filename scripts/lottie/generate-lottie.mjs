/**
 * Generates the Qiubit onboarding Lottie animation — Phantom-style.
 *
 * The wallet icon (public/qiubit-icon.svg) is embedded as a base64 image
 * asset. Around it, native Lottie layers build a playful, polished intro:
 *
 *   intro (0–60):  icon bounces in with squash & stretch + rotation wiggle,
 *                  a gradient arc draws itself around the icon,
 *                  ambient gradient blobs fade in behind everything
 *   loop (60–240): icon floats and sways gently, the arc slowly orbits,
 *                  sparkles twinkle around the icon in staggered waves —
 *                  frame 60 and frame 240 are identical, so the loop is
 *                  seamless
 *
 * Outputs (same folder):
 *   qiubit-onboarding.json  — the Lottie animation
 *   preview.html            — standalone review page (open directly, no server)
 *
 * Usage: node scripts/lottie/generate-lottie.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

const ICON_SVG_PATH = join(ROOT, "public", "qiubit-icon.svg");
const ICON_SIZE = 2160; // qiubit-icon.svg viewport

// Composition
const W = 512;
const H = 512;
const CX = W / 2;
const CY = H / 2;
const FR = 60;
const INTRO_END = 60; // frames 0..60   = bounce-in intro (play once)
const OP = 240; //       frames 60..240 = seamless loop segment
const MID = (INTRO_END + OP) / 2;

// Brand palette (0..1 RGB for Lottie)
const CYAN = [0 / 255, 212 / 255, 255 / 255];
const INDIGO = [99 / 255, 102 / 255, 241 / 255];
const VIOLET = [167 / 255, 139 / 255, 250 / 255];
const WHITE = [1, 1, 1];
const INK = [24 / 255, 26 / 255, 43 / 255]; // eyes / mouth
const SNOW = [244 / 255, 245 / 255, 255 / 255]; // mascot body (pops on indigo)
const PINK = [255 / 255, 158 / 255, 198 / 255]; // blush

const ICON_SCALE = 9.6; // % of 2160 → ~207px inside the 512 comp

const svg = readFileSync(ICON_SVG_PATH);
const iconDataUri = `data:image/svg+xml;base64,${svg.toString("base64")}`;

// ---------------------------------------------------------------------------
// chain logos — embedded as base64 image assets, masked to circles
// ---------------------------------------------------------------------------

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
  let pos = 2;
  while (pos < buf.length - 8) {
    if (buf[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = buf[pos + 1];
    // SOF0..SOF15 except DHT(C4)/JPG(C8)/DAC(CC) carry the frame dimensions
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(pos + 5), w: buf.readUInt16BE(pos + 7) };
    }
    pos += 2 + buf.readUInt16BE(pos + 2);
  }
  throw new Error("could not parse JPEG dimensions");
}

function webpSize(buf) {
  const fourCC = buf.toString("ascii", 12, 16);
  if (fourCC === "VP8X")
    return {
      w: 1 + buf.readUIntLE(24, 3),
      h: 1 + buf.readUIntLE(27, 3),
    };
  if (fourCC === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourCC === "VP8 ")
    return {
      w: buf.readUInt16LE(26) & 0x3fff,
      h: buf.readUInt16LE(28) & 0x3fff,
    };
  throw new Error("could not parse WebP dimensions");
}

function svgSize(buf) {
  const text = buf.toString("utf8");
  const w = text.match(/width="([\d.]+)/)?.[1];
  const h = text.match(/height="([\d.]+)/)?.[1];
  if (w && h) return { w: Number(w), h: Number(h) };
  const vb = text.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
  if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
  throw new Error("could not parse SVG dimensions");
}

/** Sniff the real format from magic bytes — extensions in /chains lie
 *  (several .jpg files are actually WebP). */
function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { mime: "image/png", size: pngSize };
  if (buf[0] === 0xff && buf[1] === 0xd8) return { mime: "image/jpeg", size: jpegSize };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return { mime: "image/webp", size: webpSize };
  return { mime: "image/svg+xml", size: svgSize };
}

function loadChainLogo(relPath) {
  const buf = readFileSync(join(ROOT, "public", "chains", relPath));
  const { mime, size } = sniff(buf);
  return {
    ...size(buf),
    dataUri: `data:${mime};base64,${buf.toString("base64")}`,
  };
}

const CHAIN_LOGOS = {
  ethereum: loadChainLogo("ethereum/logo.png"),
  solana: loadChainLogo("solana/logo.jpg"),
  bitcoin: loadChainLogo("bitcoin/btc.png"),
  sui: loadChainLogo("sui/logo.jpg"),
  octra: loadChainLogo("octra/logo.svg"),
};

// ---------------------------------------------------------------------------
// keyframe helpers
// ---------------------------------------------------------------------------

/** Smooth ease-in-out keyframes. */
const kf = (frames) => ({
  a: 1,
  k: frames.map(({ t, s }, i) => ({
    t,
    s,
    ...(i < frames.length - 1
      ? { i: { x: [0.35], y: [1] }, o: { x: [0.55], y: [0] } }
      : {}),
  })),
});

/** Snappy spring-flavored keyframes (fast out, soft landing). */
const kfSpring = (frames) => ({
  a: 1,
  k: frames.map(({ t, s }, i) => ({
    t,
    s,
    ...(i < frames.length - 1
      ? { i: { x: [0.15], y: [1] }, o: { x: [0.45], y: [0] } }
      : {}),
  })),
});

const staticVal = (v) => ({ a: 0, k: v });

const shapeTransform = () => ({
  ty: "tr",
  p: staticVal([0, 0]),
  a: staticVal([0, 0]),
  s: staticVal([100, 100]),
  r: staticVal(0),
  o: staticVal(100),
});

// ---------------------------------------------------------------------------
// layer builders
// ---------------------------------------------------------------------------

let LAYER_INDEX = 0;
const nextInd = () => ++LAYER_INDEX;

/**
 * A 4-point sparkle star that twinkles (scale 0→100→0 with a quarter turn).
 * Fires `count` times inside the loop with period spacing, so frame 60 and
 * frame 240 both land on scale 0 — seamless.
 */
function sparkle({ x, y, size, color, firstFire, duration = 42 }) {
  const period = (OP - INTRO_END) / 2; // two twinkles per loop
  const fires = [firstFire, firstFire + period].filter(
    (t) => t + duration <= OP,
  );

  const scaleFrames = [{ t: 0, s: [0, 0, 100] }];
  const rotFrames = [{ t: 0, s: [0] }];
  for (const f of fires) {
    scaleFrames.push(
      { t: f, s: [0, 0, 100] },
      { t: f + duration / 2, s: [100, 100, 100] },
      { t: f + duration, s: [0, 0, 100] },
    );
    rotFrames.push({ t: f, s: [0] }, { t: f + duration, s: [90] });
  }
  scaleFrames.push({ t: OP, s: [0, 0, 100] });
  rotFrames.push({ t: OP, s: [90] });

  return {
    ddd: 0,
    ind: nextInd(),
    ty: 4,
    nm: `sparkle-${x}-${y}`,
    sr: 1,
    ks: {
      o: staticVal(100),
      r: kf(rotFrames),
      p: staticVal([CX + x, CY + y, 0]),
      a: staticVal([0, 0, 0]),
      s: kf(scaleFrames),
    },
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
          { ty: "fl", nm: "fill", c: staticVal([...color, 1]), o: staticVal(100) },
          shapeTransform(),
        ],
      },
    ],
    ip: 0,
    op: OP,
    st: 0,
  };
}

// --- kawaii face parts (shared by both mascots) ----------------------------

const fill = (color) => ({
  ty: "fl",
  nm: "fill",
  c: staticVal([...color, 1]),
  o: staticVal(100),
});

const circle = (x, y, d) => ({
  ty: "el",
  nm: "c",
  p: staticVal([x, y]),
  s: staticVal([d, d]),
});

/** Blink: eye group squishes shut briefly at each `blinkAt` frame. */
const blinkScale = (blinkAts) => {
  const frames = [{ t: 0, s: [100, 100] }];
  for (const b of blinkAts) {
    frames.push(
      { t: b, s: [100, 100] },
      { t: b + 4, s: [100, 8] },
      { t: b + 8, s: [100, 100] },
    );
  }
  frames.push({ t: OP, s: [100, 100] });
  return kf(frames);
};

/** Pair of round eyes (with pupils + highlights) that blink, plus a smile. */
function kawaiiFace({ eyeGap, eyeY, eyeSize, blinkAts, smileY, smileW }) {
  const eye = (x) => ({
    ty: "gr",
    nm: "eye",
    it: [
      circle(0, 0, eyeSize),
      { ...circle(eyeSize * 0.12, eyeSize * 0.1, eyeSize * 0.5), nm: "pupil" },
      fill(INK),
      {
        ty: "tr",
        p: staticVal([x, eyeY]),
        a: staticVal([0, 0]),
        s: blinkScale(blinkAts),
        r: staticVal(0),
        o: staticVal(100),
      },
    ],
  });
  const highlight = (x) => ({
    ty: "gr",
    nm: "eye-shine",
    it: [
      circle(x - eyeSize * 0.22, eyeY - eyeSize * 0.22, eyeSize * 0.3),
      fill(WHITE),
      shapeTransform(),
    ],
  });
  const smile = {
    ty: "gr",
    nm: "smile",
    it: [
      {
        ty: "el",
        nm: "mouth",
        p: staticVal([0, smileY]),
        s: staticVal([smileW, smileW * 0.8]),
      },
      {
        ty: "tm",
        nm: "bottom-arc",
        s: staticVal(33),
        e: staticVal(67),
        o: staticVal(0),
        m: 1,
      },
      {
        ty: "st",
        nm: "stroke",
        c: staticVal([...INK, 1]),
        o: staticVal(100),
        w: staticVal(2.4),
        lc: 2,
        lj: 2,
      },
      shapeTransform(),
    ],
  };
  return [eye(-eyeGap / 2), eye(eyeGap / 2), highlight(-eyeGap / 2), highlight(eyeGap / 2), smile];
}

/** Shared mascot layer wrapper: pops in during the intro, bobs in the loop. */
function mascotLayer({ name, x, y, shapes, popAt, bobPhase, sway }) {
  const bx = CX + x;
  const by = CY + y;
  const bob = bobPhase === 0 ? -9 : 9;
  return {
    ddd: 0,
    ind: nextInd(),
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o: kfSpring([
        { t: popAt, s: [0] },
        { t: popAt + 10, s: [100] },
        { t: OP, s: [100] },
      ]),
      r: kf([
        { t: INTRO_END, s: [0] },
        { t: MID, s: [sway] },
        { t: OP, s: [0] },
      ]),
      p: kf([
        { t: INTRO_END, s: [bx, by, 0] },
        { t: MID, s: [bx, by + bob, 0] },
        { t: OP, s: [bx, by, 0] },
      ]),
      a: staticVal([0, 0, 0]),
      s: kfSpring([
        { t: popAt, s: [0, 0, 100] },
        { t: popAt + 14, s: [116, 116, 100] },
        { t: popAt + 22, s: [100, 100, 100] },
        { t: OP, s: [100, 100, 100] },
      ]),
    },
    shapes,
    ip: 0,
    op: OP,
    st: 0,
  };
}

/**
 * Cute wallet buddy — drawn to actually read as a bifold wallet:
 * near-white body, cyan fold (lid) across the top, a card peeking out of the
 * top, a side strap with clasp button, stitching along the edge, kawaii face
 * on the lower front.
 */
function walletMascot() {
  const rect = (x, y, w, h, rr) => ({
    ty: "rc",
    nm: "rect",
    p: staticVal([x, y]),
    s: staticVal([w, h]),
    r: staticVal(rr),
  });
  const shapes = [
    ...kawaiiFace({
      eyeGap: 24,
      eyeY: 10,
      eyeSize: 9,
      blinkAts: [110, 200],
      smileY: 20,
      smileW: 15,
    }),
    // blush cheeks
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
    // stitching along the body edge (dashed)
    {
      ty: "gr",
      nm: "stitching",
      it: [
        rect(0, 10, 64, 40, 8),
        {
          ty: "st",
          nm: "stitch",
          c: staticVal([...INK, 1]),
          o: staticVal(30),
          w: staticVal(1.5),
          lc: 2,
          lj: 2,
          d: [
            { n: "d", nm: "dash", v: staticVal(4) },
            { n: "g", nm: "gap", v: staticVal(4) },
          ],
        },
        shapeTransform(),
      ],
    },
    // side strap + clasp button
    {
      ty: "gr",
      nm: "clasp",
      it: [circle(34, 2, 8), fill(INK), shapeTransform()],
    },
    {
      ty: "gr",
      nm: "strap",
      it: [rect(31, 2, 18, 16, 8), fill(CYAN), shapeTransform()],
    },
    // fold / lid across the top — makes the bifold silhouette obvious
    {
      ty: "gr",
      nm: "lid",
      it: [rect(0, -14, 74, 22, 10), fill(CYAN), shapeTransform()],
    },
    // card peeking out of the top, behind the lid
    {
      ty: "gr",
      nm: "card",
      it: [rect(-16, -28, 30, 18, 4), fill(VIOLET), shapeTransform()],
    },
    // body
    {
      ty: "gr",
      nm: "body",
      it: [rect(0, 6, 74, 52, 12), fill(SNOW), shapeTransform()],
    },
  ];
  return mascotLayer({
    name: "wallet-buddy",
    x: -163,
    y: -94,
    shapes,
    popAt: 34,
    bobPhase: 0,
    sway: -6,
  });
}

// --- floating chain tokens (Phantom-style) ---------------------------------

const CHIP_SIZE = 48; // white circle behind each logo
const LOGO_SIZE = 40; // logo diameter inside the chip

/**
 * One floating chain token: a white chip + the real chain logo (embedded
 * image, masked to a circle), popping in during the intro and bobbing
 * seamlessly in the loop. Pops must settle before INTRO_END so frame 60
 * equals frame 240.
 */
function chainToken({ chain, x, y, popAt, bob, sway }) {
  const logo = CHAIN_LOGOS[chain];
  const bx = CX + x;
  const by = CY + y;

  const popOpacity = kfSpring([
    { t: popAt, s: [0] },
    { t: popAt + 6, s: [100] },
    { t: OP, s: [100] },
  ]);
  const popScale = (base) =>
    kfSpring([
      { t: popAt, s: [0, 0, 100] },
      { t: popAt + 6, s: [base * 1.16, base * 1.16, 100] },
      { t: popAt + 10, s: [base, base, 100] },
      { t: OP, s: [base, base, 100] },
    ]);
  const bobPosition = kf([
    { t: INTRO_END, s: [bx, by, 0] },
    { t: MID, s: [bx, by + bob, 0] },
    { t: OP, s: [bx, by, 0] },
  ]);
  const swayRotation = kf([
    { t: INTRO_END, s: [0] },
    { t: MID, s: [sway] },
    { t: OP, s: [0] },
  ]);

  // Circular mask in the asset's own pixel space
  const r = Math.min(logo.w, logo.h) / 2;
  const c = r * 0.5523; // cubic-bezier circle constant
  const mx = logo.w / 2;
  const my = logo.h / 2;
  const maskCircle = {
    inv: false,
    mode: "a",
    o: staticVal(100),
    x: staticVal(0),
    pt: staticVal({
      c: true,
      v: [
        [mx, my - r],
        [mx + r, my],
        [mx, my + r],
        [mx - r, my],
      ],
      i: [
        [-c, 0],
        [0, -c],
        [c, 0],
        [0, c],
      ],
      o: [
        [c, 0],
        [0, c],
        [-c, 0],
        [0, -c],
      ],
    }),
  };

  const logoLayer = {
    ddd: 0,
    ind: nextInd(),
    ty: 2,
    nm: `token-${chain}`,
    refId: `logo_${chain}`,
    sr: 1,
    hasMask: true,
    masksProperties: [maskCircle],
    ks: {
      o: popOpacity,
      r: swayRotation,
      p: bobPosition,
      a: staticVal([mx, my, 0]),
      s: popScale((LOGO_SIZE / Math.min(logo.w, logo.h)) * 100),
    },
    ip: 0,
    op: OP,
    st: 0,
  };

  const chipLayer = {
    ddd: 0,
    ind: nextInd(),
    ty: 4,
    nm: `chip-${chain}`,
    sr: 1,
    ks: {
      o: popOpacity,
      r: staticVal(0),
      p: bobPosition,
      a: staticVal([0, 0, 0]),
      s: popScale(100),
    },
    shapes: [
      {
        ty: "gr",
        nm: "chip",
        it: [circle(0, 0, CHIP_SIZE), fill(WHITE), shapeTransform()],
      },
    ],
    ip: 0,
    op: OP,
    st: 0,
  };

  return [logoLayer, chipLayer]; // logo renders above its chip
}

// Balanced hexagonal ring around the icon (radius 188, 60° apart) — the
// wallet buddy takes the sixth slot at the upper-left.
const chainTokens = [
  ...chainToken({ chain: "ethereum", x: 0, y: -188, popAt: 30, bob: -8, sway: -5 }),
  ...chainToken({ chain: "solana", x: 163, y: -94, popAt: 36, bob: 7, sway: 6 }),
  ...chainToken({ chain: "bitcoin", x: 163, y: 94, popAt: 42, bob: 9, sway: -6 }),
  ...chainToken({ chain: "octra", x: 0, y: 188, popAt: 46, bob: -7, sway: 4 }),
  ...chainToken({ chain: "sui", x: -163, y: 94, popAt: 50, bob: -6, sway: 5 }),
];

// ---------------------------------------------------------------------------
// layers (top → bottom render order)
// ---------------------------------------------------------------------------

// Sparkles sit in the six gaps between the ring slots (angles -60°, 0°, 60°,
// 120°, 180°, -120° at radius ~195).
const sparkles = [
  sparkle({ x: 98, y: -169, size: 13, color: WHITE, firstFire: 66 }),
  sparkle({ x: 195, y: 0, size: 9, color: CYAN, firstFire: 88 }),
  sparkle({ x: 98, y: 169, size: 11, color: VIOLET, firstFire: 108 }),
  sparkle({ x: -98, y: 169, size: 8, color: WHITE, firstFire: 126 }),
  sparkle({ x: -195, y: 0, size: 10, color: CYAN, firstFire: 100 }),
  sparkle({ x: -98, y: -169, size: 7, color: WHITE, firstFire: 74 }),
];

// Gradient arc: draws itself around the icon in the intro, then orbits
// slowly and seamlessly during the loop (360° between frame 60 and 240).
const arc = {
  ddd: 0,
  ind: nextInd(),
  ty: 4,
  nm: "orbit-arc",
  sr: 1,
  ks: {
    o: kf([
      { t: 10, s: [0] },
      { t: 34, s: [85] },
      { t: OP, s: [85] },
    ]),
    r: kf([
      { t: 0, s: [-95] },
      { t: INTRO_END, s: [0] },
      { t: OP, s: [360] },
    ]),
    p: staticVal([CX, CY, 0]),
    a: staticVal([0, 0, 0]),
    s: staticVal([100, 100, 100]),
  },
  shapes: [
    {
      ty: "gr",
      nm: "arc",
      it: [
        { ty: "el", nm: "circle", p: staticVal([0, 0]), s: staticVal([292, 292]) },
        {
          ty: "gs",
          nm: "gradient-stroke",
          t: 1,
          s: staticVal([-146, 0]),
          e: staticVal([146, 0]),
          g: {
            p: 3,
            k: staticVal([
              0, ...CYAN, 0.5, ...INDIGO, 1, ...VIOLET,
            ]),
          },
          o: staticVal(100),
          w: staticVal(5),
          lc: 2,
          lj: 2,
        },
        {
          ty: "tm",
          nm: "draw",
          s: staticVal(0),
          e: kf([
            { t: 10, s: [0] },
            { t: INTRO_END, s: [68] },
            { t: OP, s: [68] },
          ]),
          o: staticVal(0),
          m: 1,
        },
        shapeTransform(),
      ],
    },
  ],
  ip: 0,
  op: OP,
  st: 0,
};

// The wallet icon: springy bounce-in with squash & stretch and a rotation
// wiggle, then a gentle float + sway during the loop.
const icon = {
  ddd: 0,
  ind: nextInd(),
  ty: 2,
  nm: "qiubit-icon",
  refId: "qiubit_icon",
  sr: 1,
  ks: {
    o: kfSpring([
      { t: 0, s: [0] },
      { t: 16, s: [100] },
      { t: OP, s: [100] },
    ]),
    r: kfSpring([
      { t: 0, s: [-14] },
      { t: 30, s: [5] },
      { t: 44, s: [-2] },
      { t: INTRO_END, s: [0] },
      { t: MID, s: [2.5] },
      { t: OP, s: [0] },
    ]),
    p: kfSpring([
      { t: 0, s: [CX, CY + 46, 0] },
      { t: 30, s: [CX, CY - 10, 0] },
      { t: 44, s: [CX, CY + 4, 0] },
      { t: INTRO_END, s: [CX, CY, 0] },
      { t: MID, s: [CX, CY - 8, 0] },
      { t: OP, s: [CX, CY, 0] },
    ]),
    a: staticVal([ICON_SIZE / 2, ICON_SIZE / 2, 0]),
    s: kfSpring([
      { t: 0, s: [0, 0, 100] },
      // overshoot with stretch (taller than wide)…
      { t: 26, s: [ICON_SCALE * 1.12, ICON_SCALE * 1.2, 100] },
      // …then squash on the landing…
      { t: 40, s: [ICON_SCALE * 1.04, ICON_SCALE * 0.94, 100] },
      { t: 52, s: [ICON_SCALE * 0.99, ICON_SCALE * 1.02, 100] },
      // …and settle
      { t: INTRO_END, s: [ICON_SCALE, ICON_SCALE, 100] },
      { t: MID, s: [ICON_SCALE * 1.035, ICON_SCALE * 1.035, 100] },
      { t: OP, s: [ICON_SCALE, ICON_SCALE, 100] },
    ]),
  },
  ip: 0,
  op: OP,
  st: 0,
};

const animation = {
  v: "5.9.6",
  fr: FR,
  ip: 0,
  op: OP,
  w: W,
  h: H,
  nm: "Qiubit Onboarding",
  ddd: 0,
  assets: [
    { id: "qiubit_icon", w: ICON_SIZE, h: ICON_SIZE, u: "", p: iconDataUri, e: 1 },
    ...Object.entries(CHAIN_LOGOS).map(([chain, logo]) => ({
      id: `logo_${chain}`,
      w: logo.w,
      h: logo.h,
      u: "",
      p: logo.dataUri,
      e: 1,
    })),
  ],
  layers: [...sparkles, walletMascot(), ...chainTokens, arc, icon],
};

const json = JSON.stringify(animation);
writeFileSync(join(__dirname, "qiubit-onboarding.json"), json);
// Keep the copy the wallet actually bundles in sync
writeFileSync(
  join(ROOT, "src", "assets", "lottie", "qiubit-onboarding.json"),
  json,
);

const preview = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Qiubit Onboarding — Lottie Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #141414; /* wallet --bg-secondary */
    font-family: system-ui, -apple-system, sans-serif;
    color: #ffffff;
  }
  /* Mimics the extension popup viewport — flat, using the wallet's real
     theme (--bg-primary #0d0d0d, border-subtle #2a2a2a) */
  .popup-frame {
    width: 375px;
    height: 600px;
    border: 1px solid #2a2a2a;
    border-radius: 16px;
    background: #0d0d0d;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  #lottie { width: 300px; height: 300px; }
  .welcome {
    text-align: center;
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .welcome.show { opacity: 1; transform: translateY(0); }
  .welcome h1 {
    font-size: 23px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: #ffffff;
  }
  .welcome p { margin-top: 7px; font-size: 13px; color: #8c8c8c; }
  .hint { margin-top: 14px; font-size: 12px; color: #565d78; }
  .controls { margin-top: 10px; display: flex; gap: 8px; }
  .controls button {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: #c6cbe0;
    font-size: 12px;
    cursor: pointer;
  }
  .controls button:hover { background: rgba(255, 255, 255, 0.1); }
</style>
</head>
<body>
  <div class="popup-frame">
    <div id="lottie"></div>
    <div class="welcome" id="welcome">
      <h1>Welcome to Qiubit Wallet</h1>
      <p>Your multichain gateway to Octra &amp; beyond</p>
    </div>
  </div>
  <div class="controls">
    <button id="replay">Replay intro</button>
  </div>
  <p class="hint">Intro plays once (1s), then the loop segment repeats seamlessly.</p>

  <script src="https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js"></script>
  <script>
    const animationData = __ANIMATION_DATA__;
    const INTRO_END = ${INTRO_END};
    const OP = ${OP};
    const container = document.getElementById("lottie");
    const welcome = document.getElementById("welcome");

    let anim;
    function start() {
      if (anim) anim.destroy();
      welcome.classList.remove("show");
      anim = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: true,
        autoplay: false,
        animationData,
      });
      // Play the intro once, then loop the seamless segment forever.
      anim.playSegments([[0, INTRO_END], [INTRO_END, OP]], true);
      setTimeout(() => welcome.classList.add("show"), 650);
    }
    document.getElementById("replay").addEventListener("click", start);
    start();
  </script>
</body>
</html>
`;

writeFileSync(
  join(__dirname, "preview.html"),
  preview.replace("__ANIMATION_DATA__", json),
);

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log("Generated:");
console.log("  scripts/lottie/qiubit-onboarding.json  " + kb(json.length));
console.log("  scripts/lottie/preview.html");
