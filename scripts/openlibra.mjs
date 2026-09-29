#!/usr/bin/env node
import { parseArgs } from "node:util";
import { automation } from "./automation/api.mjs";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string" },
      output: { type: "string" },
      operations: { type: "string" },
      "expected-sha256": { type: "string" },
      page: { type: "string" },
      offset: { type: "string" },
      limit: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, file, extra] = positionals;
  if (values.help || !command) {
    console.log(`Open Libra local automation
  openlibra create FILE
  openlibra template rectangle|frame|text|ellipse|polygon|star|line
  openlibra inspect FILE
  openlibra validate FILE
  openlibra nodes FILE [--page ID] [--offset N] [--limit N]
  openlibra apply FILE --operations edits.json --expected-sha256 HASH [--output NEW_FILE]
  openlibra mcp [--root DIRECTORY]

All commands emit JSON. Files are confined to --root (default: current directory).
apply accepts an array of typed engine commands and commits one atomic batch.
Output files must be new unless editing the input in place.
Build prerequisite: npm run build:collaboration`);
  } else if (command === "mcp") {
    if (file) throw Error("mcp takes no positional arguments");
    const { startMcp } = await import("./automation/mcp.mjs");
    await startMcp(values.root);
  } else {
    if (!file || extra) throw Error("Expected exactly one document filename");
    const api = automation(values.root);
    let result;
    switch (command) {
      case "template":
        result = api.template({ kind: file });
        break;
      case "create":
        result = api.create({ output: file });
        break;
      case "inspect":
        result = api.inspect({ file });
        break;
      case "validate":
        result = api.validate({ file });
        break;
      case "nodes":
        result = api.readNodes({
          file,
          page_id: values.page,
          offset: values.offset === undefined ? 0 : Number(values.offset),
          limit: values.limit === undefined ? 100 : Number(values.limit),
        });
        break;
      case "apply":
        if (!values.operations) throw Error("--operations is required");
        result = api.apply({
          file,
          output: values.output,
          expected_sha256: values["expected-sha256"],
          commands: api.readOperations({ file: values.operations }),
        });
        break;
      default:
        throw Error("Unknown command; use --help");
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
}
