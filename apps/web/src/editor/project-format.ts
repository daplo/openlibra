export const OPEN_LIBRA_PROJECT_MIME = "application/vnd.openlibra.project+json";

type ProjectEnvelope = {
  format: "open-libra-project";
  format_version: 1;
  document: unknown;
};

export function serializeProject(documentJson: string) {
  const envelope: ProjectEnvelope = {
    format: "open-libra-project",
    format_version: 1,
    document: JSON.parse(documentJson) as unknown,
  };
  return JSON.stringify(envelope);
}

export function parseProject(source: string) {
  const value = JSON.parse(source) as unknown;
  if (!isRecord(value) || value.format !== "open-libra-project") return source;
  if (value.format_version !== 1)
    throw new Error(
      `Unsupported .libra format version: ${String(value.format_version)}`,
    );
  if (!("document" in value))
    throw new Error("The .libra project has no document payload.");
  return JSON.stringify(value.document);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
