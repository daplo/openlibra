import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const srcDir = join(process.cwd(), "crates/scene-wasm/src");

function fnRanges(lines) {
  const markers = [];
  lines.forEach((t, i) => {
    if (/^\s*(pub(\(crate\))?\s+)?fn [a-z]/.test(t)) markers.push(i);
  });
  return markers.map((m) => {
    let depth = 0;
    let started = false;
    for (let j = m; j < lines.length; j++) {
      for (const c of lines[j]) {
        if (c === "{") {
          depth++;
          started = true;
        } else if (c === "}") {
          depth--;
          if (started && depth === 0) {
            const name = lines[m]
              .trim()
              .match(/fn [a-z_0-9]+/)[0]
              .replace("fn ", "");
            return { name, start: m, end: j };
          }
        }
      }
    }
    throw new Error("unterminated fn");
  });
}

function groupText(implNames, freeNames, lines, ranges) {
  const parts = ["impl Document {", ""];
  const used = new Set();
  const addBlock = (text) => {
    if (parts[parts.length - 1].trim() !== "") parts.push("");
    parts.push(text, "");
  };
  for (const n of implNames) {
    const r = ranges.find((x) => x.name === n);
    if (!r) throw new Error(`missing fn ${n}`);
    used.add(r.start);
    addBlock(lines.slice(r.start, r.end + 1).join("\n"));
  }
  while (parts[parts.length - 1].trim() === "") parts.pop();
  parts.push("}", "");
  for (const n of freeNames) {
    const r = ranges.find((x) => x.name === n);
    if (!r) throw new Error(`missing free fn ${n}`);
    used.add(r.start);
    if (parts[parts.length - 1].trim() !== "") parts.push("");
    parts.push(lines.slice(r.start, r.end + 1).join("\n"), "");
  }
  while (parts[parts.length - 1].trim() === "") parts.pop();
  const text = parts.join("\n") + "\n";
  return { text, used, fns: [...implNames, ...freeNames] };
}

function autoImports(text, extra = []) {
  const imports = ["use crate::*;"];
  const geo = [
    /point_in_rotated_node\(/.test(text) ? "point_in_rotated_node" : null,
    /rotate_around\(/.test(text) ? "rotate_around" : null,
  ].filter(Boolean);
  if (geo.length) imports.push(`use crate::geometry::{${geo.join(", ")}};`);
  const col = [
    /HashMap/.test(text) ? "HashMap" : null,
    /HashSet/.test(text) ? "HashSet" : null,
  ].filter(Boolean);
  if (col.length) imports.push(`use std::collections::{${col.join(", ")}};`);
  if (/Uuid::/.test(text)) imports.push("use uuid::Uuid;");
  return [...imports, ...extra];
}

// Promote fns to pub(crate) when other groups call them.
function promote(group, allGroups) {
  let text = group.text;
  for (const name of group.fns) {
    const calledElsewhere = allGroups.some(
      (g) =>
        g !== group &&
        g.text.split("\n").some((line) => {
          if (/fn [a-z_0-9]+\(/.test(line) && line.includes(`fn ${name}(`))
            return false;
          return new RegExp(`(^|[^a-zA-Z0-9_])${name}\\(`).test(line);
        }),
    );
    if (calledElsewhere) {
      text = text.replace(
        new RegExp(`(^|\\s)((pub\\(crate\\) )?)fn ${name}\\(`),
        (_m, pre, _a, _b) => `${pre}pub(crate) fn ${name}(`,
      );
    }
  }
  group.text = text;
}

function splitSource(file, spec) {
  const lines = readFileSync(join(srcDir, file), "utf8").split("\n");
  const ranges = fnRanges(lines);
  const groups = spec.groups.map((g) => {
    const built = groupText(g.impl ?? [], g.free ?? [], lines, ranges);
    return { out: g.out, extraImports: g.extraImports ?? [], ...built };
  });
  const used = new Set();
  for (const g of groups) for (const s of g.used) used.add(s);
  // verify every source line (except impl header) is covered
  const implHeader = lines.findIndex((t) => t.trim() === "impl Document {");
  lines.forEach((t, i) => {
    if (i === implHeader) return;
    if (t.trim() === "") return;
    const insideFn = ranges.some((r) => r.start <= i && i <= r.end);
    if (
      insideFn &&
      !used.has(ranges.find((r) => r.start <= i && i <= r.end).start)
    ) {
      throw new Error(`uncovered line ${i + 1}: ${t}`);
    }
  });
  promotePass(groups);
  for (const g of groups) {
    const header = autoImports(g.text, g.extraImports);
    writeFileSync(join(srcDir, g.out), header.join("\n") + "\n" + g.text);
    console.log(`wrote ${g.out}: ${g.text.trim().split("\n").length} lines`);
  }
  if (spec.removeSource) {
    rmSync(join(srcDir, file));
    console.log(`removed ${file}`);
  } else {
    writeFileSync(
      join(srcDir, file),
      lines
        .filter(
          (_, i) => !(i !== implHeader && ranges.some((r) => r.start === i)),
        )
        .join("\n") + "\n",
    );
    console.log(`kept ${file}`);
  }
}

function promotePass(groups) {
  for (const g of groups) promote(g, groups);
}

function splitWasmApi(file, groups) {
  const path = join(srcDir, file);
  const lines = readFileSync(path, "utf8").split("\n");
  const ranges = fnRanges(lines);
  const removed = new Set();
  for (const group of groups) {
    const parts = [
      "use crate::*;",
      "",
      "#[wasm_bindgen]",
      "impl DocumentEngine {",
    ];
    for (const name of group.methods) {
      const range = ranges.find((candidate) => candidate.name === name);
      if (!range) throw new Error(`missing WASM method ${name}`);
      for (let index = range.start; index <= range.end; index++)
        removed.add(index);
      parts.push("", lines.slice(range.start, range.end + 1).join("\n"));
    }
    parts.push("}", "");
    writeFileSync(join(srcDir, group.out), parts.join("\n"));
    console.log(`wrote ${group.out}`);
  }
  writeFileSync(
    path,
    lines.filter((_, index) => !removed.has(index)).join("\n"),
  );
}

const coreSpec = {
  file: "core.rs",
  removeSource: true,
  groups: [
    {
      out: "document.rs",
      impl: [
        "blank",
        "demo",
        "active_page",
        "active_page_mut",
        "active_node",
        "active_node_mut",
        "allocate_id",
        "add_page",
        "add_document_color",
        "set_active_page",
        "rename_page",
        "delete_page",
        "read_model",
      ],
    },
    {
      out: "nodes.rs",
      impl: [
        "insert_node",
        "add_node",
        "add_vector_shape",
        "add_rectangle_to",
        "add_text_to",
        "add_media_asset_node",
        "add_node_from_asset",
        "add_artboard",
        "delete_node",
        "rename_node",
      ],
    },
    {
      out: "validation.rs",
      impl: ["validate"],
      free: ["validate_vector"],
    },
  ],
};

const demosSpec = {
  file: "demos.rs",
  removeSource: true,
  groups: [
    {
      out: "finance_demo.rs",
      impl: [
        "build_finance_mobile_demo",
        "finance_frame",
        "finance_text_style",
        "finance_text",
        "finance_group",
        "finance_status_bar",
        "finance_icon_asset",
        "finance_bottom_nav",
      ],
    },
    {
      out: "real_estate_demo.rs",
      impl: [
        "style_demo_shape",
        "insert_demo_text",
        "insert_demo_group",
        "build_real_estate_mobile",
        "build_demo_auto_layouts",
      ],
    },
  ],
};

const editSpec = {
  file: "edit.rs",
  removeSource: true,
  groups: [
    {
      out: "components.rs",
      impl: [
        "duplicate_nodes",
        "sync_component_instances",
        "create_component",
        "add_component_variant",
        "duplicate_component_variant",
        "create_component_instance",
        "set_instance_variant",
        "reset_component_instance",
        "swap_component_instance",
        "detach_component_instance",
        "descendant_ids_including",
      ],
      extraImports: ["use super::assets::clean_asset_name;"],
    },
    {
      out: "transform.rs",
      impl: [
        "group_nodes",
        "ungroup_nodes",
        "move_nodes",
        "set_node_style",
        "set_node_text",
        "set_node_image_fit",
        "set_node_asset",
        "resize_node",
        "set_node_locked",
        "set_node_opacity",
        "set_node_shadows",
        "set_node_transform",
        "set_node_layout",
        "set_node_width_sizing",
        "set_node_auto_height",
        "set_artboard_guide",
        "align_nodes",
        "set_node_bounds",
      ],
    },
    {
      out: "assets.rs",
      impl: [
        "add_number_variable",
        "update_number_variable",
        "delete_number_variable",
        "bind_node_variable",
        "add_text_style",
        "update_text_style",
        "delete_text_style",
        "bind_node_text_style",
        "relayout_active_token_nodes",
      ],
      free: ["clean_asset_name", "normalize_typography"],
    },
    {
      out: "vector.rs",
      impl: [
        "add_vector_path",
        "reorder_node",
        "reparent_nodes_to_artboards",
        "update_vector_parameters",
        "set_vector_fill_rule",
        "convert_vector_to_path",
        "move_vector_point",
        "delete_vector_point",
        "cut_vector_path",
        "join_vector_path",
        "vector_point_indices",
        "move_vector_point_by_id",
        "delete_vector_point_by_id",
        "cut_vector_path_by_id",
        "move_vector_handle_by_id",
        "set_vector_point_type_by_id",
        "insert_vector_point_by_id",
        "cut_vector_segment_by_id",
        "knife_vector_path",
        "reframe_vector_path",
      ],
      free: [
        "reverse_contour",
        "lerp_point",
        "cubic_value",
        "line_segment_intersection",
        "path_curve_bounds",
        "cubic_extrema",
        "endpoint_distance",
        "contours_for_geometry",
        "regular_shape_points",
        "vector_point",
      ],
    },
  ],
};

splitWasmApi("lib.rs", [
  {
    out: "api_document.rs",
    methods: [
      "new",
      "new_blank",
      "scene_data",
      "scene_data_for_view",
      "rect_count",
      "read_model_json",
      "document_json",
      "node_json",
      "add_page",
      "rename_page",
      "delete_page",
      "set_active_page",
      "hit_test",
      "load_json",
    ],
  },
  {
    out: "api_nodes.rs",
    methods: [
      "add_rectangle",
      "add_rectangle_to",
      "add_frame",
      "add_text",
      "add_text_to",
      "add_vector_shape",
      "add_vector_path",
      "add_media_asset_node",
      "add_node_from_asset",
      "add_artboard",
      "ungroup_nodes",
      "import_figma_json",
      "delete_node",
      "rename_node",
      "group_nodes",
      "duplicate_nodes",
      "create_component",
      "add_component_variant",
      "duplicate_component_variant",
      "create_component_instance",
      "set_instance_variant",
      "reset_component_instance",
      "swap_component_instance",
      "detach_component_instance",
      "move_nodes",
      "reorder_node",
      "reparent_nodes_to_artboards",
    ],
  },
  {
    out: "api_style.rs",
    methods: [
      "update_vector_parameters",
      "set_vector_fill_rule",
      "convert_vector_to_path",
      "move_vector_point",
      "delete_vector_point",
      "cut_vector_path",
      "join_vector_path",
      "move_vector_point_by_id",
      "move_vector_handle_by_id",
      "set_vector_point_type_by_id",
      "delete_vector_point_by_id",
      "cut_vector_path_by_id",
      "insert_vector_point_by_id",
      "cut_vector_segment_by_id",
      "reframe_vector_path",
      "knife_vector_path",
      "set_node_style",
      "resize_node",
      "set_node_locked",
      "set_node_text",
      "set_node_image_fit",
      "set_node_asset",
      "set_node_opacity",
      "set_node_shadows",
      "set_node_transform",
      "set_node_layout",
      "set_node_width_sizing",
      "set_node_auto_height",
      "set_artboard_guide",
      "add_document_color",
      "add_number_variable",
      "update_number_variable",
      "delete_number_variable",
      "bind_node_variable",
      "add_text_style",
      "update_text_style",
      "delete_text_style",
      "bind_node_text_style",
      "align_nodes",
      "set_node_bounds",
    ],
  },
  {
    out: "api_history.rs",
    methods: [
      "begin_transaction",
      "begin_geometry_transaction",
      "end_transaction",
      "can_undo",
      "can_redo",
      "undo",
      "redo",
    ],
  },
]);
console.log("done");
