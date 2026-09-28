import type { VectorContour, VectorPoint } from "./types";
export type Point = [number, number];
export const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
export function pathData(contours: VectorContour[]) {
  return contours
    .map((c) => {
      if (!c.points.length) return "";
      let d = `M ${c.points[0].position.join(" ")}`;
      for (let i = 1; i < c.points.length + Number(c.closed); i++) {
        const a = c.points[i - 1],
          b = c.points[i % c.points.length];
        d += ` C ${(a.handle_out ?? a.position).join(" ")} ${(b.handle_in ?? b.position).join(" ")} ${b.position.join(" ")}`;
      }
      return d + (c.closed ? " Z" : "");
    })
    .join(" ");
}
/** De Casteljau subdivision preserves the curve exactly when inserting a point. */
export function splitSegment(contour: VectorContour, index: number, t = 0.5) {
  const next = structuredClone(contour);
  const a = next.points[index],
    b = next.points[(index + 1) % next.points.length];
  const p = lerp(a.position, a.handle_out ?? a.position, t);
  const q = lerp(a.handle_out ?? a.position, b.handle_in ?? b.position, t);
  const r = lerp(b.handle_in ?? b.position, b.position, t);
  const s = lerp(p, q, t),
    u = lerp(q, r, t);
  a.handle_out = p;
  b.handle_in = r;
  // Subdivision shortens one handle; collinearity remains, equal length may not.
  if (a.point_type === "symmetric") a.point_type = "smooth";
  if (b.point_type === "symmetric") b.point_type = "smooth";
  next.points.splice(index + 1, 0, {
    position: lerp(s, u, t),
    handle_in: s,
    handle_out: u,
    point_type: "smooth",
  });
  return next;
}
export function movePoint(
  point: VectorPoint,
  target: Point,
  handle?: "handle_in" | "handle_out",
  breakHandles = false,
): VectorPoint {
  const next = structuredClone(point);
  if (!handle) {
    const dx = target[0] - next.position[0],
      dy = target[1] - next.position[1];
    for (const key of ["handle_in", "handle_out"] as const) {
      const p = next[key];
      if (p) next[key] = [p[0] + dx, p[1] + dy];
    }
    next.position = target;
  } else {
    const opposite = handle === "handle_in" ? "handle_out" : "handle_in";
    if (breakHandles) next.point_type = "corner";
    if (next.point_type !== "corner") {
      const dx = target[0] - next.position[0],
        dy = target[1] - next.position[1];
      const length = Math.hypot(dx, dy);
      const old = next[opposite] ?? next.position;
      const otherLength =
        next.point_type === "symmetric"
          ? length
          : Math.hypot(old[0] - next.position[0], old[1] - next.position[1]);
      if (length)
        next[opposite] = [
          next.position[0] - (dx * otherLength) / length,
          next.position[1] - (dy * otherLength) / length,
        ];
    }
    next[handle] = target;
  }
  return next;
}
