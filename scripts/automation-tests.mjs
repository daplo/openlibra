import assert from "node:assert/strict";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { automation } from "./automation/api.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "openlibra-automation-"));
try {
  const api = automation(root);
  const created = api.create({ output: "test.libra" });
  assert.equal(api.validate({ file: "test.libra" }).valid, true);
  const node = api.template({ kind: "rectangle" }).node;
  const command = {
    type: "create_node",
    page_id: created.active_page_id,
    node,
    before_id: null,
  };
  const added = api.apply({
    file: "test.libra",
    expected_sha256: created.sha256,
    commands: [command],
  });
  assert.equal(added.revision, 1);
  assert.equal(api.readNodes({ file: "test.libra" }).nodes[0].id, node.id);
  assert.throws(
    () =>
      api.apply({
        file: "test.libra",
        expected_sha256: created.sha256,
        commands: [command],
      }),
    /changed/,
  );
  const move = {
    type: "move_nodes",
    page_id: created.active_page_id,
    node_ids: [node.id],
    dx: 10,
    dy: 20,
  };
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "libra-outside-"));
  try {
    const external = path.join(outside, "edits.json");
    fs.writeFileSync(external, JSON.stringify([move]));
    fs.symlinkSync(external, path.join(root, "escaped-edits.json"));
    fs.symlinkSync(outside, path.join(root, "escaped-directory"));
    assert.throws(
      () => api.readOperations({ file: "escaped-directory/edits.json" }),
      /workspace root/,
    );
    for (const operations of [
      external,
      path.relative(root, external),
      "escaped-edits.json",
    ]) {
      const rejected = spawnSync(
        process.execPath,
        [
          "scripts/openlibra.mjs",
          "apply",
          "test.libra",
          "--root",
          root,
          "--operations",
          operations,
          "--expected-sha256",
          added.sha256,
        ],
        { encoding: "utf8" },
      );
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /workspace root/);
      assert.equal(api.inspect({ file: "test.libra" }).sha256, added.sha256);
    }
    fs.writeFileSync(path.join(root, "edits.json"), JSON.stringify([move]));
    const accepted = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "scripts/openlibra.mjs",
          "apply",
          "test.libra",
          "--root",
          root,
          "--operations",
          "edits.json",
          "--expected-sha256",
          added.sha256,
          "--output",
          "cli-copy.libra",
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(accepted.revision, 2);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
  const before = fs.readFileSync(path.join(root, "test.libra"), "utf8");
  assert.throws(() =>
    api.apply({
      file: "test.libra",
      expected_sha256: added.sha256,
      commands: [
        move,
        {
          type: "set_bounds",
          page_id: created.active_page_id,
          node_id: node.id,
          x: 0,
          y: 0,
          width: -1,
          height: 20,
        },
      ],
    }),
  );
  assert.equal(fs.readFileSync(path.join(root, "test.libra"), "utf8"), before);
  assert.throws(() => api.create({ output: "test.libra" }), /exists/);
  assert.throws(() => api.inspect({ file: "../outside.libra" }));
  fs.symlinkSync(os.tmpdir(), path.join(root, "escape"));
  assert.throws(
    () => api.create({ output: "escape/escape.libra" }),
    /workspace/,
  );
  fs.writeFileSync(path.join(root, "test.libra.automation.lock"), "");
  assert.throws(
    () =>
      api.apply({
        file: "test.libra",
        expected_sha256: added.sha256,
        commands: [move],
      }),
    /locked/,
  );
  fs.unlinkSync(path.join(root, "test.libra.automation.lock"));
  fs.writeFileSync(
    path.join(root, "invalid.libra"),
    JSON.stringify({
      format: "open-libra-project",
      format_version: 999,
      document: {},
    }),
  );
  assert.throws(() => api.validate({ file: "invalid.libra" }), /Unsupported/);
  assert.throws(() =>
    api.apply({
      file: "test.libra",
      output: "missing/failure.libra",
      expected_sha256: added.sha256,
      commands: [move],
    }),
  );
  assert.equal(fs.readFileSync(path.join(root, "test.libra"), "utf8"), before);
  const copied = api.apply({
    file: "test.libra",
    output: "copy.libra",
    expected_sha256: added.sha256,
    commands: [move],
  });
  assert.equal(copied.revision, 2);
  assert.equal(fs.readFileSync(path.join(root, "test.libra"), "utf8"), before);
  const cli = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/openlibra.mjs", "inspect", "copy.libra", "--root", root],
      { encoding: "utf8" },
    ),
  );
  assert.equal(cli.sha256, copied.sha256);
  const client = new Client({ name: "automation-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("scripts/openlibra.mjs"), "mcp", "--root", root],
  });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 6);
    const result = await client.callTool({
      name: "inspect_document",
      arguments: { file: "test.libra" },
    });
    assert.equal(result.structuredContent.sha256, added.sha256);
    const applied = await client.callTool({
      name: "apply_operations",
      arguments: {
        file: "test.libra",
        expected_sha256: added.sha256,
        commands: [move],
      },
    });
    assert.equal(applied.isError, undefined);
    assert.equal(applied.structuredContent.revision, 2);
    const stale = await client.callTool({
      name: "apply_operations",
      arguments: {
        file: "test.libra",
        expected_sha256: added.sha256,
        commands: [move],
      },
    });
    assert.equal(stale.isError, true);
    const invalid = await client.callTool({
      name: "read_nodes",
      arguments: { file: "test.libra", limit: 1000 },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
  }
  console.log(
    "Automation passed: CLI, MCP handshake/discovery/edits, validation, atomic rollback, stale hashes, output protection, locks, path boundaries, reload.",
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
