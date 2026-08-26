import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const lines = readFileSync(file, "utf8").split("\n");
const markers = [];
lines.forEach((t, i) => {
  if (/^\s*(pub(\(crate\))?\s+)?fn [a-z]/.test(t)) markers.push(i);
});
const ranges = markers.map((m) => {
  let depth = 0;
  let started = false;
  for (let j = m; j < lines.length; j++) {
    for (const c of lines[j]) {
      if (c === "{") {
        depth++;
        started = true;
      } else if (c === "}") {
        depth--;
        if (started && depth === 0)
          return {
            start: m,
            end: j,
            name: lines[m].trim().match(/fn [a-z_0-9]+/)[0],
          };
      }
    }
  }
  return { start: m, end: lines.length - 1, name: "?" };
});
const implStart = lines.findIndex((t) => t.trim() === "impl Document {");
const docEnd = lines.findIndex((t) => t.trim() === "}" && t.startsWith("}"));
let freeFns = [];
for (let i = 0; i < lines.length; i++) {
  const t = lines[i];
  if (t.trim().startsWith("impl Document")) continue;
  if (/^\s*(pub(\(crate\))?\s+)?fn [a-z]/.test(t) && !t.startsWith("    "))
    freeFns.push(i);
}
console.log("implStart", implStart + 1);
console.log(
  "implEnd",
  (() => {
    let depth = 0;
    let started = false;
    for (let j = implStart; j < lines.length; j++) {
      for (const c of lines[j]) {
        if (c === "{") {
          depth++;
          started = true;
        } else if (c === "}") {
          depth--;
          if (started && depth === 0) return j + 1;
        }
      }
    }
    return -1;
  })(),
);
for (const r of ranges) console.log(r.name, r.start + 1, "-", r.end + 1);
console.log("total", lines.length);
console.log(
  "freeFns",
  freeFns
    .map((i) => i + 1 + ":" + lines[i].trim().match(/fn [a-z_0-9]+/)?.[0])
    .join(", "),
);
