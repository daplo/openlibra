import * as fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function engineClass() {
  try {
    return require("../../target/collaboration-wasm/open_libra_scene_wasm.js")
      .DocumentEngine;
  } catch {
    throw Error(
      "Node WASM engine missing. Run npm run build:collaboration first.",
    );
  }
}
const hash = (data) => createHash("sha256").update(data).digest("hex");
const allowed = new Set([
  "create_node",
  "delete_node",
  "move_nodes",
  "set_bounds",
  "resize_node",
  "set_transform",
  "set_properties",
  "reparent_node",
  "reorder_node",
]);
export function automation(root = process.cwd()) {
  root = fs.realpathSync(root);
  const directoryFlags =
    fs.constants.O_RDONLY |
    (fs.constants.O_DIRECTORY ?? 0) |
    (fs.constants.O_NOFOLLOW ?? 0);
  const rootFd = fs.openSync(root, directoryFlags);
  function pathParts(file) {
    const candidate = path.resolve(root, file);
    const relative = path.relative(root, candidate);
    if (
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative) ||
      !relative
    )
      throw Error("File must be inside the configured workspace root");
    return relative.split(path.sep);
  }
  function descriptorPath(fd, name) {
    return `/proc/self/fd/${fd}/${name}`;
  }
  function openParent(file) {
    const parts = pathParts(file);
    let fd = rootFd;
    try {
      for (const part of parts.slice(0, -1)) {
        const next = fs.openSync(descriptorPath(fd, part), directoryFlags);
        if (fd !== rootFd) fs.closeSync(fd);
        fd = next;
      }
      return {
        fd,
        name: parts.at(-1),
        filename: path.join(root, ...parts),
      };
    } catch (error) {
      if (fd !== rootFd) fs.closeSync(fd);
      throw Error("File must be inside the configured workspace root", {
        cause: error,
      });
    }
  }
  function resolve(file, output = false) {
    const { fd, name, filename } = openParent(file);
    try {
      const target = descriptorPath(fd, name);
      if (!output) {
        let opened;
        try {
          opened = fs.openSync(
            target,
            fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
          );
        } catch (error) {
          if (error.code === "ELOOP")
            throw Error("File must be inside the configured workspace root", {
              cause: error,
            });
          throw error;
        }
        fs.closeSync(opened);
      } else if (
        fs.existsSync(target) &&
        fs.lstatSync(target).isSymbolicLink()
      ) {
        throw Error("Output symlinks are not supported");
      }
      return filename;
    } finally {
      if (fd !== rootFd) fs.closeSync(fd);
    }
  }
  function readBytes(file) {
    const { fd: parentFd, name, filename } = openParent(file);
    // Validate the opened descriptor rather than the path, so a symlink swapped
    // in after the workspace check cannot redirect the read outside root.
    let fd;
    try {
      try {
        fd = fs.openSync(
          descriptorPath(parentFd, name),
          fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
        );
      } catch (error) {
        if (error.code === "ELOOP")
          throw Error("File must be inside the configured workspace root", {
            cause: error,
          });
        throw error;
      }
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || opened.size > 64 * 1024 * 1024)
        throw Error("Expected a file no larger than 64 MiB");
      const bytes = fs.readFileSync(fd);
      return { filename, bytes };
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (parentFd !== rootFd) fs.closeSync(parentFd);
    }
  }
  function read(file) {
    const { filename, bytes } = readBytes(file);
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (
      parsed.format !== undefined &&
      (parsed.format !== "open-libra-project" || parsed.format_version !== 1)
    )
      throw Error("Unsupported project container");
    const engine = engineClass().load_json(
      JSON.stringify(parsed.format ? parsed.document : parsed),
    );
    return { filename, bytes, engine, sha256: hash(bytes) };
  }
  function describe(engine) {
    const doc = JSON.parse(engine.document_json());
    const state = JSON.parse(engine.operation_state_json());
    return {
      document_id: state?.document_id ?? null,
      schema_version: doc.schema_version,
      revision: state?.revision ?? 0,
      active_page_id: doc.active_page_id,
      pages: doc.pages.map((p) => ({
        id: p.id,
        name: p.name,
        node_count: p.nodes.length,
      })),
    };
  }
  function withRead(file, fn) {
    const input = read(file);
    try {
      return fn(input);
    } finally {
      input.engine.free();
    }
  }
  function save(engine, destination, input) {
    const { fd: parentFd, name, filename } = openParent(destination);
    const target = descriptorPath(parentFd, name);
    const inPlace = filename === input?.filename;
    try {
      if (
        !inPlace &&
        fs.existsSync(target) &&
        fs.lstatSync(target).isSymbolicLink()
      )
        throw Error("Output symlinks are not supported");
      if (!inPlace && fs.existsSync(target))
        throw Error("Output already exists; choose a new file");
      const temp = path.join(
        `/proc/self/fd/${parentFd}`,
        ".openlibra-" + randomUUID() + ".tmp",
      );
      const data =
        JSON.stringify(
          {
            format: "open-libra-project",
            format_version: 1,
            document: JSON.parse(engine.document_json()),
          },
          null,
          2,
        ) + "\n";
      try {
        const fd = fs.openSync(temp, "wx", 0o600);
        try {
          fs.writeFileSync(fd, data);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        if (inPlace) {
          if (hash(readBytes(filename).bytes) !== input.sha256)
            throw Error("Document changed during editing; inspect again");
          fs.renameSync(temp, target);
        } else {
          fs.linkSync(temp, target); // Exclusive publication: never overwrite a concurrent new file.
        }
        return {
          file: path.relative(root, filename),
          sha256: hash(data),
          ...describe(engine),
        };
      } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      }
    } finally {
      if (parentFd !== rootFd) fs.closeSync(parentFd);
    }
  }
  return {
    readOperations({ file }) {
      return JSON.parse(readBytes(file).bytes.toString("utf8"));
    },
    template({ kind }) {
      if (
        ![
          "rectangle",
          "frame",
          "text",
          "ellipse",
          "polygon",
          "star",
          "line",
        ].includes(kind)
      )
        throw Error("Unsupported node template");
      const engine = engineClass().new_blank();
      try {
        const id =
          kind === "rectangle"
            ? engine.add_rectangle()
            : kind === "frame"
              ? engine.add_frame()
              : kind === "text"
                ? engine.add_text()
                : engine.add_vector_shape(kind, "");
        return { node: JSON.parse(engine.node_json(id)) };
      } finally {
        engine.free();
      }
    },
    inspect({ file }) {
      return withRead(file, ({ engine, sha256 }) => ({
        sha256,
        ...describe(engine),
      }));
    },
    validate({ file }) {
      return withRead(file, ({ engine, sha256 }) => ({
        valid: true,
        sha256,
        ...describe(engine),
      }));
    },
    readNodes({ file, page_id, node_ids, offset = 0, limit = 100 }) {
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 200
      )
        throw Error("offset must be nonnegative; limit must be 1–200");
      return withRead(file, ({ engine, sha256 }) => {
        const doc = JSON.parse(engine.document_json());
        const page = doc.pages.find(
          (p) => p.id === (page_id ?? doc.active_page_id),
        );
        if (!page) throw Error("Page not found");
        const nodes = page.nodes.filter(
          (n) => !node_ids || node_ids.includes(n.id),
        );
        return {
          sha256,
          page_id: page.id,
          total: nodes.length,
          nodes: nodes.slice(offset, offset + limit),
        };
      });
    },
    create({ output }) {
      const engine = engineClass().new_blank();
      try {
        return save(engine, output);
      } finally {
        engine.free();
      }
    },
    apply({ file, output, expected_sha256, commands }) {
      if (!/^[a-f0-9]{64}$/.test(expected_sha256 ?? ""))
        throw Error("expected_sha256 from inspect is required");
      if (
        !Array.isArray(commands) ||
        commands.length < 1 ||
        commands.length > 100 ||
        commands.some((c) => !c || !allowed.has(c.type))
      )
        throw Error(
          "Provide 1–100 supported edit commands; nested batches and raw history edits are not accepted",
        );
      const filename = resolve(file);
      const lock = filename + ".automation.lock";
      let fd;
      try {
        fd = fs.openSync(lock, "wx", 0o600);
      } catch {
        throw Error("Document is locked by another automation writer");
      }
      try {
        return withRead(file, (input) => {
          if (input.sha256 !== expected_sha256)
            throw Error("Document changed; inspect again before editing");
          const actor = randomUUID();
          input.engine.enable_operations(actor);
          const state = JSON.parse(input.engine.operation_state_json());
          const receipt = JSON.parse(
            input.engine.apply_operation_json(
              JSON.stringify({
                version: 1,
                document_id: state.document_id,
                operation_id: randomUUID(),
                actor_id: actor,
                sequence: state.next_sequence,
                base_revision: state.revision,
                transaction_id: randomUUID(),
                command: { type: "batch", commands },
              }),
            ),
          );
          return { ...save(input.engine, output ?? file, input), receipt };
        });
      } finally {
        fs.closeSync(fd);
        fs.unlinkSync(lock);
      }
    },
  };
}
