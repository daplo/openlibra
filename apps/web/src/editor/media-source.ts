import type { MediaAsset } from "./types";

export function mediaImageSource(asset: MediaAsset, color?: string) {
  if (asset.kind !== "icon") return asset.source;
  const fallbackColor = color ?? "#111111";
  const source = decodeSvgSource(asset.source);
  if (source === undefined) return asset.source;
  const colored = source.replaceAll("currentColor", fallbackColor);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
}

function decodeSvgSource(source: string) {
  if (source.trimStart().startsWith("<svg")) return source;
  if (!source.startsWith("data:image/svg+xml")) return;
  const comma = source.indexOf(",");
  if (comma < 0) return;
  try {
    const metadata = source.slice(0, comma);
    const payload = source.slice(comma + 1);
    return metadata.includes(";base64")
      ? atob(payload)
      : decodeURIComponent(payload);
  } catch {
    return;
  }
}
