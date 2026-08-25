import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const cssPath = join(root, "apps/web/src/styles.css");
const dir = join(root, "apps/web/src/styles");

const css = readFileSync(cssPath, "utf8");

function parseTopLevelBlocks(text) {
  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const brace = text.indexOf("{", i);
    if (brace === -1) {
      const rest = text.slice(i).trim();
      if (rest) out.push({ selector: rest, raw: rest });
      break;
    }
    let depth = 0;
    let inString = null;
    let end = -1;
    for (let j = brace; j < n; j++) {
      const c = text[j];
      if (inString) {
        if (c === inString && text[j - 1] !== "\\") inString = null;
        continue;
      }
      if (c === '"' || c === "'") {
        inString = c;
        continue;
      }
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end === -1) {
      out.push({ selector: text.slice(i, brace).trim(), raw: text.slice(i) });
      break;
    }
    out.push({ selector: text.slice(i, brace).trim(), raw: text.slice(i, end).trim() });
    i = end;
  }
  return out;
}

const groups = {
  tokens: [/^:root\b/, /^@font-face/],
  base: [
    /^html\b/,
    /^body\b/,
    /^#root/,
    /^(button|input|select|h[1-6]|kbd|summary|strong|small)(,|\s|$)/,
    /^:is\(/,
    /^canvas$/,
    /\.empty-state/,
    /\.eyebrow/,
  ],
  layout: [
    /\.app-shell/,
    /\.workspace/,
    /\.left-panel/,
    /\.right-panel/,
    /\.vault-panel/,
    /\.panel-resize-handle/,
  ],
  topbar: [
    /\.topbar/,
    /\.brand/,
    /\.mark\b/,
    /\.file-name/,
    /\.autosave-indicator/,
    /\.mode-switcher/,
    /\.topbar-actions/,
    /\.theme-toggle/,
    /\.share-button/,
    /\.library-trigger/,
  ],
  sidebar: [
    /\.page-list/,
    /\.layer-search/,
    /\.layer-list/,
    /\.layer-row/,
    /\.layer-main/,
    /\.layer-branch/,
    /\.layer-name-input/,
    /\.layer-chevron/,
    /\.layer-kind-icon/,
    /\.layer-context-menu/,
    /\.rename-layer/,
    /\.lock-layer/,
    /\.page-row/,
    /\.page-main/,
    /\.page-action/,
    /\.page-copy/,
    /\.add-page/,
    /\.component-tree/,
    /\.component-master-readonly/,
  ],
  canvas: [
    /\.stage/,
    /\bcanvas/,
    /\.snap-guide/,
    /\.spacing-overlay/,
    /\.isolation-overlay/,
    /\.component-isolation-bar/,
    /\.horizontal-ruler/,
    /\.vertical-ruler/,
    /\.tool-rail/,
    /\.zoom-controls/,
    /\.artboard/,
  ],
  panels: [
    /\.panel-tabs/,
    /\.panel-header/,
    /\.property/,
    /\.number-control/,
    /\.export/,
    /\.text-style/,
    /\.segmented-control/,
    /\.color-swatch-button/,
    /\.color-library/,
    /\.color-palette/,
    /\.custom-color-row/,
    /\.empty-palette/,
    /\.geometry-grid/,
    /\.geometry-input/,
    /\.transform-controls/,
    /\.auto-layout-controls/,
    /\.layout-direction/,
    /\.layout-select/,
    /\.layout-number-input/,
    /\.layout-subheading/,
    /\.four-value-heading/,
    /\.padding-grid/,
    /\.alignment-grid/,
    /\.child-sizing/,
    /\.guide-controls/,
    /\.shadow/,
    /\.add-shadow/,
    /\.alignment-controls/,
    /\.select-control/,
    /\.variable-binding-list/,
    /\.token-assignment-row/,
    /\.token-add-button/,
    /\.variable-select/,
    /\.primary-button/,
    /\.secondary-button/,
    /\.danger-button/,
    /\.inspect/,
    /\.diagnostics-title/,
    /\.metrics/,
    /\.code-block/,
  ],
  vault: [
    /\.vault/,
    /\.asset-upload-button/,
    /\.icon-search/,
    /\.figma-import/,
    /\.media-asset/,
    /\.icon-library/,
    /\.media-controls/,
    /\.component-asset-card/,
  ],
  overlays: [
    /\.menu-anchor/,
    /\.menu-trigger/,
    /\.edit-menu/,
    /\.view-menu/,
    /\.file-menu/,
    /\.menu-check/,
    /\.menu-section-label/,
    /\.context/,
    /\.tooltip/,
    /\.hidden-file-input/,
    /\.text-editor-overlay/,
    /\.text-overlay/,
    /\.text-content-input/,
    /\.media-overlay/,
    /\.document-switcher/,
    /\.shape-menu/,
    /\.artboard-menu/,
  ],
  library: [
    /\.library/,
    /\.component-card/,
    /\.component-variant/,
    /\.component-preview/,
    /\.component-library/,
    /\.component-edit-main/,
    /\.component-add-variant/,
    /\.component-instance-actions/,
    /\.project-library/,
    /\.project-card/,
    /\.project-new-card/,
    /\.project-preview/,
    /\.project-archive-empty/,
  ],
  theme: [/\[data-theme/],
};

const order = Object.keys(groups);

function classify(selector) {
  for (const name of order) {
    if (groups[name].some((re) => re.test(selector))) return name;
  }
  return "misc";
}

const blocks = parseTopLevelBlocks(readFileSync(cssPath, "utf8"));

const partials = order;
const buckets = new Map(partials.map((p) => [p, []]));
buckets.set("misc", []);
const responsive = [];

for (const block of blocks) {
  if (block.selector.startsWith("@media") || block.selector.startsWith("@supports")) {
    responsive.push(block.raw + "\n");
    continue;
  }
  buckets.get(classify(block.selector)).push(block.raw + "\n");
}

mkdirSync(dir, { recursive: true });
const header = "// Open Libra styles — split from the original styles.css by selector group.\n";
const used = partials.filter((p) => buckets.get(p).length > 0);
for (const p of used) {
  writeFileSync(join(dir, `_${p}.scss`), header + buckets.get(p).join("\n"));
}
if (buckets.get("misc").length) {
  writeFileSync(join(dir, "_misc.scss"), header + buckets.get("misc").join("\n"));
  used.push("misc");
}
if (responsive.length) {
  writeFileSync(join(dir, "_responsive.scss"), header + responsive.join("\n"));
  used.push("responsive");
}

writeFileSync(
  join(root, "apps/web/src/styles.scss"),
  header + used.map((p) => `@use "styles/${p}";`).join("\n") + "\n",
);
rmSync(cssPath);

const before = blocks.reduce((sum, b) => sum + b.raw.match(/\{/g).length, 0);
const after =
  used.reduce((sum, p) => sum + readFileSync(join(dir, `_${p}.scss`), "utf8").match(/\{/g).length, 0);
console.log(`blocks=${blocks.length} before-braces=${before} after-braces=${after}`);
if (before !== after) {
  console.error("BRACE MISMATCH — aborting");
  process.exit(1);
}
console.log(
  [...partials, "misc", "responsive"]
    .filter((p) => (buckets.get(p)?.length ?? responsive.length))
    .map((p) => `${p}:${buckets.get(p)?.length ?? responsive.length}`)
    .join(" "),
);
