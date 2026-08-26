mod api_document;
mod api_history;
mod api_nodes;
mod api_style;
mod assets;
mod benchmark;
mod color;
mod components;
mod document;
mod finance_demo;
mod nodes;
mod real_estate_demo;
mod transform;
mod validation;
mod vector;

mod geometry;
mod layout;
mod model;
mod scene;

use color::{normalize_hex_color, parse_hex_color};
use geometry::point_in_rotated_node;
use model::*;
use scene::ordered_nodes;
use uuid::Uuid;
use wasm_bindgen::prelude::*;

const SCHEMA_VERSION: u32 = 9;
const FLOATS_PER_RECT: usize = 24;

#[derive(serde::Deserialize)]
struct FigmaImportPayload {
    pages: Vec<FigmaImportPage>,
    #[serde(default)]
    assets: Vec<FigmaImportAsset>,
}

#[derive(serde::Deserialize)]
struct FigmaImportPage {
    name: String,
    nodes: Vec<FigmaImportNode>,
}

#[derive(serde::Deserialize)]
struct FigmaImportAsset {
    source_id: String,
    name: String,
    mime_type: String,
    source: String,
}

#[derive(serde::Deserialize)]
struct FigmaImportNode {
    source_id: String,
    #[serde(default)]
    parent_source_id: Option<String>,
    name: String,
    kind: NodeKind,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    fill: [f32; 4],
    stroke: [f32; 4],
    stroke_width: f32,
    corner_radii: [f32; 4],
    stroke_align: StrokeAlign,
    opacity: f32,
    rotation: f32,
    layout_mode: LayoutMode,
    layout_gap: f32,
    layout_padding: [f32; 4],
    #[serde(default)]
    shadows: Vec<Shadow>,
    #[serde(default)]
    text: Option<TextStyle>,
    #[serde(default)]
    asset_source_id: Option<String>,
}

fn parse_entity_id(value: &str) -> EntityId {
    Uuid::parse_str(value).unwrap_or_else(|_| Uuid::nil())
}

fn migrate_legacy_document_ids(value: &mut serde_json::Value) {
    let schema = value
        .get("schema_version")
        .and_then(|version| version.as_u64())
        .unwrap_or(1);
    let migrate_id = |id: &mut serde_json::Value| {
        if let Some(number) = id.as_u64() {
            *id = serde_json::Value::String(
                Uuid::new_v5(
                    &Uuid::NAMESPACE_OID,
                    format!("open-libra-v1:{number}").as_bytes(),
                )
                .to_string(),
            );
        }
    };
    if schema == 1
        && let Some(id) = value.get_mut("active_page_id")
    {
        migrate_id(id);
    }
    if let Some(pages) = value
        .get_mut("pages")
        .and_then(|pages| pages.as_array_mut())
    {
        for page in pages {
            if schema == 1
                && let Some(id) = page.get_mut("id")
            {
                migrate_id(id);
            }
            if let Some(nodes) = page.get_mut("nodes").and_then(|nodes| nodes.as_array_mut()) {
                for node in nodes {
                    if schema == 1
                        && let Some(id) = node.get_mut("id")
                    {
                        migrate_id(id);
                    }
                    if schema == 1
                        && let Some(parent) = node.get_mut("parent_id")
                    {
                        migrate_id(parent);
                    }
                    if node.get("corner_radii").is_none() {
                        let radius = node
                            .get("corner_radius")
                            .and_then(|value| value.as_f64())
                            .unwrap_or(0.0);
                        node["corner_radii"] = serde_json::json!([radius, radius, radius, radius]);
                    }
                    if node.get("stroke_align").is_none() {
                        node["stroke_align"] = serde_json::Value::String("inside".into());
                    }
                    if node.get("stroke_join").is_none() {
                        node["stroke_join"] = serde_json::Value::String("round".into());
                    }
                    if node.get("kind").and_then(|kind| kind.as_str()) == Some("text")
                        && node.get("text").is_none()
                    {
                        node["text"] = serde_json::to_value(TextStyle::default()).unwrap();
                    }
                    if schema < 8 {
                        let node_id = node
                            .get("id")
                            .and_then(|id| id.as_str())
                            .unwrap_or("missing-node");
                        let shadow_ids: Vec<_> = node
                            .get("shadows")
                            .and_then(|shadows| shadows.as_array())
                            .map(|shadows| {
                                shadows
                                    .iter()
                                    .enumerate()
                                    .map(|(index, _)| {
                                        Uuid::new_v5(
                                            &Uuid::NAMESPACE_OID,
                                            format!("open-libra-shadow:{node_id}:{index}")
                                                .as_bytes(),
                                        )
                                        .to_string()
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                        if let Some(shadows) = node
                            .get_mut("shadows")
                            .and_then(|shadows| shadows.as_array_mut())
                        {
                            for (shadow, id) in shadows.iter_mut().zip(shadow_ids) {
                                if shadow.get("id").is_none() {
                                    shadow["id"] = serde_json::Value::String(id);
                                }
                            }
                        }
                    }
                }
            }
            if let Some(ids) = page
                .get_mut("benchmark_modified_node_ids")
                .and_then(|ids| ids.as_array_mut())
                && schema == 1
            {
                for id in ids {
                    migrate_id(id);
                }
            }
        }
    }
    if let Some(colors) = value
        .get_mut("color_library")
        .and_then(|colors| colors.as_array_mut())
    {
        for color in colors {
            if schema == 1
                && let Some(id) = color.get_mut("id")
            {
                migrate_id(id);
            }
        }
    }
    value["schema_version"] = serde_json::Value::from(SCHEMA_VERSION);
}

#[derive(Clone, PartialEq)]
struct NodeStyleState {
    fill: [f32; 4],
    stroke: [f32; 4],
    stroke_width: f32,
    corner_radii: [f32; 4],
    stroke_align: StrokeAlign,
    stroke_join: StrokeJoin,
}

impl NodeStyleState {
    fn capture(node: &Node) -> Self {
        Self {
            fill: node.fill,
            stroke: node.stroke,
            stroke_width: node.stroke_width,
            corner_radii: node.corner_radii,
            stroke_align: node.stroke_align,
            stroke_join: node.stroke_join,
        }
    }

    fn apply(self, node: &mut Node) {
        node.fill = self.fill;
        node.stroke = self.stroke;
        node.stroke_width = self.stroke_width;
        node.corner_radii = self.corner_radii;
        node.stroke_align = self.stroke_align;
        node.stroke_join = self.stroke_join;
    }
}

#[derive(Clone, PartialEq)]
struct NodeGeometryState {
    id: EntityId,
    parent_id: Option<EntityId>,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    corner_radii: [f32; 4],
    rotation: f32,
    flip_x: bool,
    flip_y: bool,
}

impl NodeGeometryState {
    fn capture(node: &Node) -> Self {
        Self {
            id: node.id,
            parent_id: node.parent_id,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            corner_radii: node.corner_radii,
            rotation: node.rotation,
            flip_x: node.flip_x,
            flip_y: node.flip_y,
        }
    }

    fn apply(self, node: &mut Node) {
        node.parent_id = self.parent_id;
        node.x = self.x;
        node.y = self.y;
        node.width = self.width;
        node.height = self.height;
        node.corner_radii = self.corner_radii;
        node.rotation = self.rotation;
        node.flip_x = self.flip_x;
        node.flip_y = self.flip_y;
    }
}

enum HistoryEntry {
    Document(Document),
    NodeStyle {
        page_id: EntityId,
        node_id: EntityId,
        style: NodeStyleState,
    },
    Geometry {
        page_id: EntityId,
        nodes: Vec<NodeGeometryState>,
    },
}

impl HistoryEntry {
    fn apply(self, document: &mut Document) -> Self {
        match self {
            Self::Document(previous) => Self::Document(std::mem::replace(document, previous)),
            Self::NodeStyle {
                page_id,
                node_id,
                style,
            } => {
                let node = document
                    .pages
                    .iter_mut()
                    .find(|page| page.id == page_id)
                    .and_then(|page| page.nodes.iter_mut().find(|node| node.id == node_id));
                // The node may have been deleted by a later command while this
                // entry sat on the undo/redo stack; treat that as a no-op
                // instead of panicking.
                if let Some(node) = node {
                    let inverse = NodeStyleState::capture(node);
                    style.apply(node);
                    Self::NodeStyle {
                        page_id,
                        node_id,
                        style: inverse,
                    }
                } else {
                    Self::NodeStyle {
                        page_id,
                        node_id,
                        style,
                    }
                }
            }
            Self::Geometry { page_id, nodes } => {
                let Some(page) = document.pages.iter_mut().find(|page| page.id == page_id) else {
                    return Self::Geometry { page_id, nodes };
                };
                let mut inverse = Vec::with_capacity(nodes.len());
                for state in nodes {
                    // Nodes captured by an in-flight geometry transaction can
                    // be deleted before the transaction ends; skip them
                    // instead of panicking, and keep their captured state so
                    // a later redo/undo of this entry stays a no-op for them.
                    let Some(node) = page.nodes.iter_mut().find(|node| node.id == state.id) else {
                        inverse.push(state);
                        continue;
                    };
                    inverse.push(NodeGeometryState::capture(node));
                    state.apply(node);
                }
                Self::Geometry {
                    page_id,
                    nodes: inverse,
                }
            }
        }
    }
}

#[wasm_bindgen]
pub struct DocumentEngine {
    document: Document,
    undo_stack: Vec<HistoryEntry>,
    redo_stack: Vec<HistoryEntry>,
    transaction_start: Option<Document>,
    geometry_transaction_start: Option<HistoryEntry>,
}

impl DocumentEngine {
    fn mutate<R>(&mut self, operation: impl FnOnce(&mut Document) -> R) -> R {
        if self.transaction_start.is_some() || self.geometry_transaction_start.is_some() {
            return operation(&mut self.document);
        }
        let before = self.document.clone();
        let result = operation(&mut self.document);
        if component_source_changed(&before, &self.document) {
            self.document.sync_component_instances();
        }
        if before != self.document {
            if self.transaction_start.is_none() {
                self.push_undo(HistoryEntry::Document(before));
            }
            self.redo_stack.clear();
        }
        result
    }

    fn push_undo(&mut self, entry: HistoryEntry) {
        const HISTORY_LIMIT: usize = 100;
        if self.undo_stack.len() == HISTORY_LIMIT {
            self.undo_stack.remove(0);
        }
        self.undo_stack.push(entry);
    }
}

fn component_source_changed(before: &Document, after: &Document) -> bool {
    let sources = |document: &Document| {
        document
            .pages
            .iter()
            .flat_map(|page| &page.nodes)
            .filter(|node| {
                node.instance_root_id.is_none() && node.component_slot_id == Some(node.id)
            })
            .map(|node| (node.id, node.clone()))
            .collect::<std::collections::HashMap<_, _>>()
    };
    sources(before) != sources(after)
}

impl Default for DocumentEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests;
