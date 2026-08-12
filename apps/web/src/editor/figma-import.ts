import {
  nodeId,
  parseFig,
  resolveVectorNodePaths,
  type FigDocument,
  type FigNode,
  type FigPaint,
} from "openfig-core";

export type FigmaImportPayload = {
  name: string;
  pages: Array<{ name: string; nodes: FigmaImportNode[] }>;
  assets: FigmaImportAsset[];
};

type FigmaImportAsset = {
  source_id: string;
  name: string;
  mime_type: string;
  source: string;
};

type FigmaImportNode = {
  source_id: string;
  parent_source_id?: string;
  name: string;
  kind: "frame" | "group" | "rectangle" | "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: number[];
  stroke: number[];
  stroke_width: number;
  corner_radii: number[];
  stroke_align: "inside" | "center" | "outside";
  opacity: number;
  rotation: number;
  layout_mode: "none" | "row" | "column";
  layout_gap: number;
  layout_padding: number[];
  shadows: Array<{
    kind: "outer" | "inner";
    color: number[];
    offset_x: number;
    offset_y: number;
    blur: number;
    spread: number;
    enabled: boolean;
  }>;
  text?: {
    content: string;
    font_family: string;
    font_weight: number;
    font_size: number;
    line_height: number;
    letter_spacing: number;
    horizontal_align: "left" | "center" | "right" | "justify";
    vertical_align: "top" | "middle" | "bottom";
    font_style: "normal" | "italic";
    sizing: "auto_width" | "auto_height" | "fixed";
  };
  asset_source_id?: string;
};

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function guidString(value: unknown): string | undefined {
  const guid = (value as { guid?: { sessionID?: number; localID?: number } })
    ?.guid;
  return guid?.sessionID !== undefined && guid.localID !== undefined
    ? `${guid.sessionID}:${guid.localID}`
    : undefined;
}

function rgba(paints: FigPaint[] | undefined): number[] {
  const paint = paints?.find(
    (candidate) => candidate.visible !== false && candidate.type === "SOLID",
  );
  const color = paint?.color;
  if (!color) return [0, 0, 0, 0];
  return [
    finite(color.r),
    finite(color.g),
    finite(color.b),
    finite(color.a, 1) * finite(paint.opacity, 1),
  ];
}

function bytesToHex(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const bytes = Object.values(value as Record<string, number>);
  return bytes.length
    ? bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")
    : undefined;
}

function imageHash(node: FigNode): string | undefined {
  const paint = node.fillPaints?.find(
    (candidate) => candidate.visible !== false && candidate.type === "IMAGE",
  );
  return bytesToHex(paint?.image?.hash);
}

function mimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") return "image/webp";
  return "application/octet-stream";
}

function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function fontWeight(style = ""): number {
  const normalized = style.toLowerCase();
  if (normalized.includes("black")) return 900;
  if (normalized.includes("extra bold") || normalized.includes("extrabold"))
    return 800;
  if (normalized.includes("bold")) return 700;
  if (normalized.includes("semi")) return 600;
  if (normalized.includes("medium")) return 500;
  if (normalized.includes("light")) return 300;
  if (normalized.includes("thin")) return 100;
  return 400;
}

function nodeKind(
  node: FigNode,
  assetSourceId?: string,
): FigmaImportNode["kind"] {
  if (assetSourceId) return "image";
  if (node.type === "TEXT") return "text";
  if (node.type === "FRAME") return "frame";
  if (["SYMBOL", "INSTANCE", "GROUP"].includes(node.type)) return "group";
  return "rectangle";
}

function align(value: unknown): "left" | "center" | "right" | "justify" {
  const normalized = String(value ?? "LEFT").toLowerCase();
  return ["center", "right", "justify"].includes(normalized)
    ? (normalized as "center" | "right" | "justify")
    : "left";
}

function convertNode(
  node: FigNode,
  worldTransform: NonNullable<FigNode["transform"]>,
  assetSourceId?: string,
): FigmaImportNode {
  const sourceId = nodeId(node)!;
  const parentSourceId = guidString(node.parentIndex);
  const width = Math.max(1, finite(node.size?.x, 1));
  const height = Math.max(1, finite(node.size?.y, 1));
  const radius =
    node.type === "ELLIPSE"
      ? Math.min(width, height) / 2
      : finite(node.cornerRadius);
  const individual = (node as FigNode & { rectangleCornerRadii?: number[] })
    .rectangleCornerRadii;
  const stackPadding = (node as FigNode & { stackPadding?: number[] })
    .stackPadding;
  const stackMode = String(node.stackMode ?? "NONE").toUpperCase();
  const lineHeightPx = finite(
    (node as FigNode & { lineHeightPx?: number }).lineHeightPx,
    finite(node.fontSize, 16) * 1.2,
  );
  const hash = assetSourceId ?? imageHash(node);
  return {
    source_id: sourceId,
    ...(parentSourceId ? { parent_source_id: parentSourceId } : {}),
    name: node.name?.trim() || node.type.toLowerCase(),
    kind: nodeKind(node, hash),
    x: finite(worldTransform.m02),
    y: finite(worldTransform.m12),
    width,
    height,
    fill: hash ? [0, 0, 0, 0] : rgba(node.fillPaints),
    stroke: rgba(node.strokePaints),
    stroke_width: finite(node.strokeWeight),
    corner_radii:
      individual?.length === 4
        ? individual.map((value) => finite(value))
        : [radius, radius, radius, radius],
    stroke_align: String(
      node.strokeAlign ?? "INSIDE",
    ).toLowerCase() as FigmaImportNode["stroke_align"],
    opacity: finite(node.opacity, 1),
    rotation:
      (Math.atan2(finite(worldTransform.m10), finite(worldTransform.m00, 1)) *
        180) /
      Math.PI,
    layout_mode:
      stackMode === "HORIZONTAL"
        ? "row"
        : stackMode === "VERTICAL"
          ? "column"
          : "none",
    layout_gap: finite(node.itemSpacing),
    layout_padding:
      stackPadding?.length === 4
        ? stackPadding.map((value) => finite(value))
        : [0, 0, 0, 0],
    shadows: (node.effects ?? [])
      .filter(
        (effect) =>
          effect.visible !== false &&
          (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW"),
      )
      .map((effect) => ({
        kind: effect.type === "INNER_SHADOW" ? "inner" : "outer",
        color: [
          finite(effect.color?.r),
          finite(effect.color?.g),
          finite(effect.color?.b),
          finite(effect.color?.a, 1) * finite(effect.opacity, 1),
        ],
        offset_x: finite(effect.offset?.x),
        offset_y: finite(effect.offset?.y),
        blur: finite(effect.radius),
        spread: finite(effect.spread),
        enabled: true,
      })),
    ...(node.type === "TEXT"
      ? {
          text: {
            content: node.textData?.characters ?? "",
            font_family: node.fontName?.family || "Arial",
            font_weight: fontWeight(node.fontName?.style),
            font_size: finite(node.fontSize, 16),
            line_height: Math.max(
              0.1,
              lineHeightPx / Math.max(1, finite(node.fontSize, 16)),
            ),
            letter_spacing: finite(
              (node as FigNode & { letterSpacing?: number }).letterSpacing,
            ),
            horizontal_align: align(
              (node as FigNode & { textAlignHorizontal?: string })
                .textAlignHorizontal,
            ),
            vertical_align: "top" as const,
            font_style: node.fontName?.style?.toLowerCase().includes("italic")
              ? ("italic" as const)
              : ("normal" as const),
            sizing: "fixed" as const,
          },
        }
      : {}),
    ...(hash ? { asset_source_id: hash } : {}),
  };
}

function colorCss(
  paints: FigPaint[] | undefined,
  fallback = "#000000",
): string {
  const paint = paints?.find(
    (candidate) => candidate.visible !== false && candidate.type === "SOLID",
  );
  if (!paint?.color) return fallback;
  const channel = (value: number | undefined) =>
    Math.round(Math.min(1, Math.max(0, finite(value))) * 255)
      .toString(16)
      .padStart(2, "0");
  const alpha = finite(paint.color.a, 1) * finite(paint.opacity, 1);
  return `#${channel(paint.color.r)}${channel(paint.color.g)}${channel(paint.color.b)}${channel(alpha)}`;
}

function vectorAsset(
  document: FigDocument,
  node: FigNode,
): FigmaImportAsset | undefined {
  if (node.type !== "VECTOR" && node.type !== "BOOLEAN_OPERATION") return;
  try {
    const geometry = resolveVectorNodePaths(document, node);
    const paths = [
      ...geometry.fill.map((path) => ({
        ...path,
        color: colorCss(path.paints, colorCss(node.fillPaints)),
      })),
      ...geometry.stroke.map((path) => ({
        ...path,
        color: colorCss(path.paints, colorCss(node.strokePaints)),
      })),
    ];
    if (!paths.length) return;
    const width = Math.max(1, finite(node.size?.x, 1));
    const height = Math.max(1, finite(node.size?.y, 1));
    const body = paths
      .map(
        (path) =>
          `<path d="${path.svgPath.replaceAll('"', "&quot;")}" fill="${path.color}" fill-rule="${path.windingRule === "ODD" ? "evenodd" : "nonzero"}"/>`,
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
    const bytes = new TextEncoder().encode(svg);
    return {
      source_id: `figma-vector:${nodeId(node)}`,
      name: node.name || "Figma vector",
      mime_type: "image/svg+xml",
      source: dataUrl(bytes, "image/svg+xml"),
    };
  } catch {
    return;
  }
}

function instanceAsset(
  document: FigDocument,
  node: FigNode,
): FigmaImportAsset | undefined {
  if (node.type !== "INSTANCE") return;
  const symbolGuid = (node.symbolData as { symbolID?: unknown } | undefined)
    ?.symbolID;
  const symbolId = guidString({ guid: symbolGuid });
  const symbol = symbolId ? document.nodeMap.get(symbolId) : undefined;
  if (!symbol) return;
  const parts: string[] = [];
  const visit = (parentId: string, transform: Transform) => {
    for (const child of document.childrenMap.get(parentId) ?? []) {
      if (child.visible === false) continue;
      const childTransform = multiplyTransforms(
        transform,
        child.transform ?? identityTransform(),
      );
      if (child.type === "VECTOR" || child.type === "BOOLEAN_OPERATION") {
        try {
          const geometry = resolveVectorNodePaths(document, child);
          for (const path of [...geometry.fill, ...geometry.stroke]) {
            const color = colorCss(
              path.paints,
              colorCss(child.fillPaints, colorCss(node.fillPaints)),
            );
            parts.push(
              `<path transform="matrix(${childTransform.m00} ${childTransform.m10} ${childTransform.m01} ${childTransform.m11} ${childTransform.m02} ${childTransform.m12})" d="${path.svgPath.replaceAll('"', "&quot;")}" fill="${color}" fill-rule="${path.windingRule === "ODD" ? "evenodd" : "nonzero"}"/>`,
            );
          }
        } catch {
          // Keep expanding any nested geometry that can be resolved.
        }
      }
      visit(nodeId(child)!, childTransform);
    }
  };
  visit(symbolId!, identityTransform());
  if (!parts.length) return;
  const width = Math.max(1, finite(symbol.size?.x, finite(node.size?.x, 1)));
  const height = Math.max(1, finite(symbol.size?.y, finite(node.size?.y, 1)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join("")}</svg>`;
  return {
    source_id: `figma-instance:${nodeId(node)}`,
    name: node.name || "Figma instance",
    mime_type: "image/svg+xml",
    source: dataUrl(new TextEncoder().encode(svg), "image/svg+xml"),
  };
}

type Transform = NonNullable<FigNode["transform"]>;

function multiplyTransforms(parent: Transform, child: Transform): Transform {
  return {
    m00: parent.m00 * child.m00 + parent.m01 * child.m10,
    m01: parent.m00 * child.m01 + parent.m01 * child.m11,
    m02: parent.m00 * child.m02 + parent.m01 * child.m12 + parent.m02,
    m10: parent.m10 * child.m00 + parent.m11 * child.m10,
    m11: parent.m10 * child.m01 + parent.m11 * child.m11,
    m12: parent.m10 * child.m02 + parent.m11 * child.m12 + parent.m12,
  };
}

const identityTransform = (): Transform => ({
  m00: 1,
  m01: 0,
  m02: 0,
  m10: 0,
  m11: 1,
  m12: 0,
});

export async function figmaFileToImport(
  file: File,
): Promise<FigmaImportPayload> {
  if (!file.name.toLowerCase().endsWith(".fig"))
    throw new Error("Choose a Figma .fig file.");
  const document = parseFig(new Uint8Array(await file.arrayBuffer()));
  const generatedAssets = new Map<string, FigmaImportAsset>();
  const byParent = new Map<string, FigNode[]>();
  for (const node of document.nodes) {
    const parent = guidString(node.parentIndex);
    if (parent) byParent.set(parent, [...(byParent.get(parent) ?? []), node]);
  }
  const pages = document.nodes
    .filter((node) => node.type === "CANVAS" && node.visible !== false)
    .map((page) => {
      const pageId = nodeId(page)!;
      const included: FigNode[] = [];
      const visit = (parentId: string, ancestorsVisible: boolean) => {
        for (const child of byParent.get(parentId) ?? []) {
          const visible = ancestorsVisible && child.visible !== false;
          if (!visible) continue;
          included.push(child);
          visit(nodeId(child)!, visible);
        }
      };
      visit(pageId, true);
      const roots = included.filter(
        (node) => guidString(node.parentIndex) === pageId,
      );
      const minX = Math.min(
        ...roots.map((node) => finite(node.transform?.m02)),
        0,
      );
      const minY = Math.min(
        ...roots.map((node) => finite(node.transform?.m12)),
        0,
      );
      const pageOffset: Transform = {
        ...identityTransform(),
        m02: 80 - minX,
        m12: 80 - minY,
      };
      const worldTransforms = new Map<string, Transform>();
      for (const node of included) {
        const parentId = guidString(node.parentIndex);
        const parentTransform =
          parentId === pageId
            ? pageOffset
            : (parentId && worldTransforms.get(parentId)) || pageOffset;
        worldTransforms.set(
          nodeId(node)!,
          multiplyTransforms(
            parentTransform,
            node.transform ?? identityTransform(),
          ),
        );
      }
      const assetIds = new Map<string, string>();
      for (const node of included) {
        const asset =
          vectorAsset(document, node) ?? instanceAsset(document, node);
        if (!asset) continue;
        generatedAssets.set(asset.source_id, asset);
        assetIds.set(nodeId(node)!, asset.source_id);
      }
      return {
        name: page.name || "Imported page",
        nodes: included.map((node) =>
          convertNode(
            node,
            worldTransforms.get(nodeId(node)!)!,
            assetIds.get(nodeId(node)!),
          ),
        ),
      };
    });

  const usedHashes = new Set(
    pages.flatMap((page) =>
      page.nodes.map((node) => node.asset_source_id).filter(Boolean),
    ),
  );
  const assets: FigmaImportAsset[] = [];
  for (const [hash, bytes] of document.images) {
    if (!usedHashes.has(hash)) continue;
    const mime = mimeType(bytes);
    assets.push({
      source_id: hash,
      name: `Figma image ${assets.length + 1}`,
      mime_type: mime,
      source: dataUrl(bytes, mime),
    });
  }
  assets.push(...generatedAssets.values());
  if (!pages.length)
    throw new Error("This Figma file has no visible pages to import.");
  return {
    name: document.meta?.file_name || file.name.replace(/\.fig$/i, ""),
    pages,
    assets,
  };
}
