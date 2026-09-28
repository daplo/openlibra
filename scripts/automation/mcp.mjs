import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { automation } from "./api.mjs";

export async function startMcp(root) {
  const api = automation(root);
  const server = new McpServer(
    { name: "openlibra", version: "0.1.0" },
    {
      instructions:
        "Local file automation only. Inspect a document to obtain its SHA-256 before applying edits. Read node IDs and page IDs before constructing commands. Browser autosaves and live shared rooms are not connected.",
    },
  );
  const file = z.string().min(1);
  const command = z
    .object({
      type: z.enum([
        "create_node",
        "delete_node",
        "move_nodes",
        "set_bounds",
        "resize_node",
        "set_transform",
        "set_properties",
        "reparent_node",
        "reorder_node",
      ]),
    })
    .passthrough();
  const register = (name, description, inputSchema, method, readOnly) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: !readOnly,
          openWorldHint: false,
        },
      },
      async (args) => {
        try {
          const result = api[method](args);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
      },
    );
  register(
    "node_template",
    "Return a complete native node with a fresh UUID for create_node. Adjust name, bounds and paint before applying.",
    {
      kind: z.enum([
        "rectangle",
        "frame",
        "text",
        "ellipse",
        "polygon",
        "star",
        "line",
      ]),
    },
    "template",
    true,
  );
  register(
    "inspect_document",
    "List document pages, revision, and content hash.",
    { file },
    "inspect",
    true,
  );
  register(
    "validate_document",
    "Validate a .libra file with the Rust engine without writing.",
    { file },
    "validate",
    true,
  );
  register(
    "read_nodes",
    "Read paginated node geometry and properties on a page.",
    {
      file,
      page_id: z.string().uuid().optional(),
      node_ids: z.array(z.string().uuid()).max(200).optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(200).default(100),
    },
    "readNodes",
    true,
  );
  register(
    "create_document",
    "Create a blank .libra document at a new output path.",
    { output: file },
    "create",
    false,
  );
  register(
    "apply_operations",
    "Apply 1–100 engine commands as one atomic transaction. Required command fields: move_nodes(page_id,node_ids,dx,dy); set_bounds(page_id,node_id,x,y,width,height); set_properties(page_id,node_id,properties); set_transform(page_id,node_id,rotation,flip_x,flip_y); delete_node(page_id,node_id); create_node(page_id,node,before_id); resize_node(page_id,node_id,handle,dx,dy); reparent_node(page_id,node_id,parent_id,before_id); reorder_node(page_id,node_id,target_id,before). UUID identities and all commands are validated by Rust. create_node requires a complete native node, which can be based on read_nodes output with a fresh UUID.",
    {
      file,
      output: file.optional(),
      expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
      commands: z.array(command).min(1).max(100),
    },
    "apply",
    false,
  );
  await server.connect(new StdioServerTransport());
}
