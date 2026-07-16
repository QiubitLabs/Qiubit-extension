/**
 * Shared helpers for hand-built Lottie generators (see generate-feedback.mjs).
 * Colors follow the wallet theme in src/styles/variables.css.
 */

// Wallet theme palette (0..1 RGB for Lottie)
export const CYAN = [0 / 255, 212 / 255, 255 / 255]; // --accent-primary
export const GREEN = [0 / 255, 200 / 255, 83 / 255]; // --success
export const RED = [255 / 255, 82 / 255, 82 / 255]; // --error
export const VIOLET = [167 / 255, 139 / 255, 250 / 255];
export const WHITE = [1, 1, 1];

/** Smooth ease-in-out keyframes. */
export const kf = (frames) => ({
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
export const kfSpring = (frames) => ({
  a: 1,
  k: frames.map(({ t, s }, i) => ({
    t,
    s,
    ...(i < frames.length - 1
      ? { i: { x: [0.15], y: [1] }, o: { x: [0.45], y: [0] } }
      : {}),
  })),
});

export const staticVal = (v) => ({ a: 0, k: v });

export const shapeTransform = () => ({
  ty: "tr",
  p: staticVal([0, 0]),
  a: staticVal([0, 0]),
  s: staticVal([100, 100]),
  r: staticVal(0),
  o: staticVal(100),
});

export const fill = (color, opacity = 100) => ({
  ty: "fl",
  nm: "fill",
  c: staticVal([...color, 1]),
  o: staticVal(opacity),
});

export const stroke = (color, width, opacity = 100) => ({
  ty: "st",
  nm: "stroke",
  c: staticVal([...color, 1]),
  o: staticVal(opacity),
  w: staticVal(width),
  lc: 2,
  lj: 2,
});

export const circle = (x, y, d) => ({
  ty: "el",
  nm: "c",
  p: staticVal([x, y]),
  s: staticVal([d, d]),
});

/** Open polyline path through the given points (for check marks, arrows, X). */
export const polyline = (points) => ({
  ty: "sh",
  nm: "path",
  ks: staticVal({
    c: false,
    v: points,
    i: points.map(() => [0, 0]),
    o: points.map(() => [0, 0]),
  }),
});

/** Trim that draws the path from 0% to 100% between the two frames. */
export const trimDraw = (from, to) => ({
  ty: "tm",
  nm: "draw",
  s: staticVal(0),
  e: kf([
    { t: from, s: [0] },
    { t: to, s: [100] },
  ]),
  o: staticVal(0),
  m: 1,
});

/** Minimal shape-layer scaffold. */
export const shapeLayer = ({ ind, nm, ks, shapes, op }) => ({
  ddd: 0,
  ind,
  ty: 4,
  nm,
  sr: 1,
  ks,
  shapes,
  ip: 0,
  op,
  st: 0,
});

/** Default transform block for a layer positioned at (x, y). */
export const at = (x, y, overrides = {}) => ({
  o: staticVal(100),
  r: staticVal(0),
  p: staticVal([x, y, 0]),
  a: staticVal([0, 0, 0]),
  s: staticVal([100, 100, 100]),
  ...overrides,
});

/** Animation document scaffold. */
export const doc = ({ nm, w, h, op, layers, assets = [] }) => ({
  v: "5.9.6",
  fr: 60,
  ip: 0,
  op,
  w,
  h,
  nm,
  ddd: 0,
  assets,
  layers,
});
