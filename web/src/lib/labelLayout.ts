// Places marker labels on the photo so they don't overlap each other or other markers,
// and stay inside the photo instead of being clipped at its edges.

export type Pt = { x: number; y: number };
export type Size = { w: number; h: number };
type Rect = { x: number; y: number; w: number; h: number };

const MARGIN = 8; // keep labels this far from the photo edge (the photo has rounded corners)
const GAP = 16; // distance from the marker center to the label
const DOT = 26; // area around each marker dot that labels should avoid
const PAD = 3; // breathing room between labels

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));

/** Returns the top-left position of each label, in the same coordinates as `points`. */
export function layoutLabels(points: Pt[], sizes: Size[], W: number, H: number): Pt[] {
  const dots: Rect[] = points.map((p) => ({ x: p.x - DOT / 2, y: p.y - DOT / 2, w: DOT, h: DOT }));
  const placed: Rect[] = [];
  const out: Pt[] = new Array(points.length);
  // Top-to-bottom, then left-to-right, so the result doesn't depend on the order the model listed things.
  const order = points.map((_, i) => i).sort((a, b) => points[a].y - points[b].y || points[a].x - points[b].x);

  for (const i of order) {
    const { x: cx, y: cy } = points[i];
    const { w, h } = sizes[i];
    // Preferred spots, best first: below (as before), above, right, left, then further below/above.
    const spots: [number, number, number][] = [
      [cx - w / 2, cy + GAP, 0],
      [cx - w / 2, cy - GAP - h, 1],
      [cx + GAP, cy - h / 2, 1.5],
      [cx - GAP - w, cy - h / 2, 1.5],
      [cx - w / 2, cy + GAP + h + PAD, 3],
      [cx - w / 2, cy - GAP - 2 * h - PAD, 3],
      [cx + GAP, cy + GAP / 2, 2.5],
      [cx - GAP - w, cy + GAP / 2, 2.5],
      [cx + GAP, cy - GAP / 2 - h, 2.5],
      [cx - GAP - w, cy - GAP / 2 - h, 2.5],
    ];
    let best: Rect | null = null;
    let bestScore = Infinity;
    for (const [sx, sy, rank] of spots) {
      const r = { x: clamp(sx, MARGIN, W - MARGIN - w), y: clamp(sy, MARGIN, H - MARGIN - h), w, h };
      const grown = { x: r.x - PAD, y: r.y - PAD, w: r.w + 2 * PAD, h: r.h + 2 * PAD };
      let hit = 0;
      for (const p of placed) hit += overlap(grown, p);
      for (const d of dots) hit += overlap(r, d);
      const moved = Math.abs(r.x - sx) + Math.abs(r.y - sy);
      const score = hit * 10 + rank * 40 + moved * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    placed.push(best!);
    out[i] = { x: best!.x, y: best!.y };
  }
  return out;
}

