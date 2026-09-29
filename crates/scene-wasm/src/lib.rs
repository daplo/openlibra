mod boolean;
mod color;
mod document;
mod edit;
mod finance_demo;
mod geometry;
mod layout;
mod model;
mod operation_patch;
mod operations;
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
    operation_session: Option<operations::Session>,
    operation_error: Option<String>,
}

#[wasm_bindgen]
impl DocumentEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        Self {
            document: Document::demo(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            transaction_start: None,
            geometry_transaction_start: None,
            operation_session: None,
            operation_error: None,
        }
    }

    pub fn new_blank() -> Self {
        console_error_panic_hook::set_once();
        Self {
            document: Document::blank(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            transaction_start: None,
            geometry_transaction_start: None,
            operation_session: None,
            operation_error: None,
        }
    }

    pub fn scene_data(&self) -> Vec<f32> {
        self.document.scene_data()
    }

    pub fn scene_data_for_view(&self, left: f32, top: f32, right: f32, bottom: f32) -> Vec<f32> {
        self.document.scene_data_for_view(left, top, right, bottom)
    }

    pub fn rect_count(&self) -> usize {
        self.scene_data().len() / FLOATS_PER_RECT
    }

    pub fn read_model_json(&self) -> String {
        serde_json::to_string(&self.document.read_model()).expect("read model is serializable")
    }

    /// Identity of the committed snapshot exposed by document_json. Untracked
    /// engines deliberately return no key so callers cannot cache mutable state.
    pub fn document_snapshot_key(&self) -> String {
        let Some(session) = &self.operation_session else {
            return String::new();
        };
        let document = self.transaction_start.as_ref().unwrap_or(&self.document);
        format!(
            "{}:{}:{}",
            session.journal.document_id,
            session.revision(),
            document.active_page_id
        )
    }

    pub fn document_json(&self) -> String {
        #[derive(serde::Serialize)]
        struct Snapshot<'a> {
            #[serde(flatten)]
            document: &'a Document,
            #[serde(skip_serializing_if = "Option::is_none")]
            operation_history: Option<&'a operations::Journal>,
        }
        let document = if self.operation_session.is_some() {
            self.transaction_start.as_ref().unwrap_or(&self.document)
        } else {
            &self.document
        };
        serde_json::to_string(&Snapshot {
            document,
            operation_history: self
                .operation_session
                .as_ref()
                .map(|session| &session.journal),
        })
        .expect("document is serializable")
    }

    pub fn enable_operations(&mut self, actor_id: &str) -> Result<(), JsValue> {
        if self.transaction_start.is_some() || self.geometry_transaction_start.is_some() {
            return Err(JsValue::from_str(
                "Finish the active transaction before changing actor",
            ));
        }
        let actor =
            Uuid::parse_str(actor_id).map_err(|_| JsValue::from_str("Invalid actor identity"))?;
        if actor.is_nil() {
            return Err(JsValue::from_str("Actor identity must not be nil"));
        }
        if let Some(session) = &mut self.operation_session {
            session.actor = actor;
        } else {
            self.operation_session = Some(operations::Session::new(&self.document, actor));
        }
        Ok(())
    }

    pub fn operation_state_json(&self) -> String {
        match &self.operation_session {
            Some(s) => serde_json::json!({"document_id":s.journal.document_id,"actor_id":s.actor,"revision":s.revision(),"next_sequence":s.sequences.get(&s.actor).copied().unwrap_or(0)+1,"undo_operation_id":s.undo.get(&s.actor).and_then(|v|v.last()),"redo_operation_id":s.redo.get(&s.actor).and_then(|v|v.last()),"error":self.operation_error}).to_string(),
            None => "null".into()
        }
    }

    /// Build resolved entity/property intent from a committed editor transaction.
    /// Both inputs are validated; session history and active-page navigation are excluded.
    pub fn document_changes_json(&self, baseline_json: &str) -> Result<String, JsValue> {
        if self.transaction_start.is_some() || self.geometry_transaction_start.is_some() {
            return Err(JsValue::from_str("Finish the active transaction first"));
        }
        let baseline = Self::load_json(baseline_json)?;
        self.document
            .validate()
            .map_err(|e| JsValue::from_str(&e))?;
        let changes = operation_patch::diff(&baseline.document, &self.document);
        Ok(serde_json::to_string(&changes).unwrap())
    }

    pub fn apply_operation_json(&mut self, json: &str) -> Result<String, JsValue> {
        if self.transaction_start.is_some() || self.geometry_transaction_start.is_some() {
            return Err(JsValue::from_str("Finish the active transaction first"));
        }
        let envelope = operations::parse_envelope(json).map_err(|e| JsValue::from_str(&e))?;
        let session = self
            .operation_session
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Operations are not enabled"))?;
        let receipt = session
            .apply(&mut self.document, envelope, false)
            .map_err(|e| JsValue::from_str(&e))?;
        self.operation_error = None;
        Ok(serde_json::to_string(&receipt).unwrap())
    }

    pub fn node_json(&self, node_id: String) -> String {
        let node_id = parse_entity_id(&node_id);
        self.document
            .active_node(node_id)
            .and_then(|node| serde_json::to_string(node).ok())
            .unwrap_or_default()
    }

    pub fn add_rectangle(&mut self) -> String {
        self.mutate(|document| document.add_node(NodeKind::Rectangle))
            .to_string()
    }

    pub fn add_rectangle_to(&mut self, parent_id: String) -> String {
        let parent_id = parse_entity_id(&parent_id);
        self.mutate(|document| {
            document.add_rectangle_to((!parent_id.is_nil()).then_some(parent_id))
        })
        .to_string()
    }

    pub fn add_frame(&mut self) -> String {
        self.mutate(|document| document.add_node(NodeKind::Frame))
            .to_string()
    }

    pub fn add_text(&mut self) -> String {
        self.mutate(|document| document.add_node(NodeKind::Text))
            .to_string()
    }

    pub fn add_text_to(&mut self, parent_id: String) -> String {
        let parent_id = parse_entity_id(&parent_id);
        self.mutate(|document| document.add_text_to((!parent_id.is_nil()).then_some(parent_id)))
            .to_string()
    }

    pub fn add_vector_shape(&mut self, shape: String, parent_id: String) -> String {
        let parent_id = parse_entity_id(&parent_id);
        let geometry = match shape.as_str() {
            "line" => VectorGeometry::Line,
            "polygon" => VectorGeometry::Polygon { sides: 6 },
            "star" => VectorGeometry::Star {
                points: 5,
                inner_ratio: 0.45,
            },
            _ => VectorGeometry::Ellipse,
        };
        self.mutate(|document| {
            document.add_vector_shape(geometry, (!parent_id.is_nil()).then_some(parent_id))
        })
        .to_string()
    }

    /// Commit a complete path as one undoable operation. Coordinates are normalized
    /// to the supplied bounds, matching native files and SVG export.
    pub fn add_path(
        &mut self,
        contours_json: String,
        bounds_json: String,
        parent_id: String,
    ) -> String {
        let Ok(contours) = serde_json::from_str::<Vec<VectorContour>>(&contours_json) else {
            return String::new();
        };
        let Ok(bounds) = serde_json::from_str::<[f32; 4]>(&bounds_json) else {
            return String::new();
        };
        if !valid_path(&contours)
            || bounds.iter().any(|v| !v.is_finite())
            || bounds[2] < 1.0
            || bounds[3] < 1.0
        {
            return String::new();
        }
        let parent = parse_entity_id(&parent_id);
        self.mutate(|document| {
            let id = document.add_vector_shape(
                VectorGeometry::Path { contours },
                (!parent.is_nil()).then_some(parent),
            );
            let node = document.active_node_mut(id).unwrap();
            [node.x, node.y, node.width, node.height] = bounds;
            node.name = "Path".into();
            node.stroke_align = StrokeAlign::Center;
            node.rotation = 0.0;
            node.flip_x = false;
            node.flip_y = false;
            node.fill = [0.0; 4];
            node.stroke = [0.12, 0.65, 0.44, 1.0];
            node.stroke_width = 2.0;
            id
        })
        .to_string()
    }

    pub fn update_path(&mut self, node_id: String, contours_json: String) -> bool {
        let Ok(contours) = serde_json::from_str::<Vec<VectorContour>>(&contours_json) else {
            return false;
        };
        if !valid_path(&contours) {
            return false;
        }
        let id = parse_entity_id(&node_id);
        self.mutate(|document| {
            let Some(node) = document.active_node_mut(id) else {
                return false;
            };
            if node.locked || node.kind != NodeKind::Vector {
                return false;
            }
            if node.mask_shape && contours.iter().any(|c| !c.closed || c.points.len() < 3) {
                return false;
            }
            let Some(vector) = &mut node.vector else {
                return false;
            };
            if !matches!(vector.geometry, VectorGeometry::Path { .. }) {
                return false;
            }
            let next = VectorGeometry::Path { contours };
            if vector.geometry == next {
                return false;
            }
            vector.geometry = next;
            expand_path_bounds(node);
            true
        })
    }

    pub fn update_vector_parameters(
        &mut self,
        node_id: String,
        count: u16,
        inner_ratio: f32,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.update_vector_parameters(node_id, count, inner_ratio))
    }

    pub fn set_vector_fill_rule(&mut self, node_id: String, rule: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let rule = if rule == "evenodd" {
            FillRule::Evenodd
        } else {
            FillRule::Nonzero
        };
        self.mutate(|document| document.set_vector_fill_rule(node_id, rule))
    }

    pub fn convert_vector_to_path(&mut self, node_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.convert_vector_to_path(node_id))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_media_asset_node(
        &mut self,
        kind: String,
        name: String,
        mime_type: String,
        source: String,
        width: u32,
        height: u32,
        parent_id: String,
    ) -> String {
        let parent_id = parse_entity_id(&parent_id);
        let kind = if kind == "icon" {
            MediaAssetKind::Icon
        } else {
            MediaAssetKind::Image
        };
        self.mutate(|document| {
            document.add_media_asset_node(
                kind,
                name,
                mime_type,
                source,
                width,
                height,
                (!parent_id.is_nil()).then_some(parent_id),
            )
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn add_node_from_asset(&mut self, asset_id: String, parent_id: String) -> String {
        let asset_id = parse_entity_id(&asset_id);
        let parent_id = parse_entity_id(&parent_id);
        self.mutate(|document| {
            document.add_node_from_asset(asset_id, (!parent_id.is_nil()).then_some(parent_id))
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn add_artboard(
        &mut self,
        name: String,
        width: f32,
        height: f32,
    ) -> Result<String, JsValue> {
        if !width.is_finite()
            || !height.is_finite()
            || width < 1.0
            || height < 1.0
            || width > 16_384.0
            || height > 16_384.0
        {
            return Err(JsValue::from_str(
                "Artboard dimensions must be between 1 and 16,384 pixels",
            ));
        }
        Ok(self
            .mutate(|document| document.add_artboard(name, width, height))
            .to_string())
    }

    pub fn add_page(&mut self, name: String) -> String {
        self.mutate(|document| document.add_page(name)).to_string()
    }

    pub fn rename_page(&mut self, page_id: String, name: String) -> bool {
        let page_id = parse_entity_id(&page_id);
        self.mutate(|document| document.rename_page(page_id, name))
    }

    pub fn delete_page(&mut self, page_id: String) -> bool {
        let page_id = parse_entity_id(&page_id);
        self.mutate(|document| document.delete_page(page_id))
    }

    pub fn boolean_nodes(&mut self, ids_json: &str, operation: &str) -> Result<String, JsValue> {
        let ids: Vec<EntityId> =
            serde_json::from_str(ids_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let mode: BooleanOperation =
            serde_json::from_value(serde_json::Value::String(operation.into()))
                .map_err(|_| JsValue::from_str("Unknown boolean operation"))?;
        self.try_mutate(|d| d.create_boolean(&ids, mode))
            .and_then(|result| result)
            .map(|id| id.to_string())
            .map_err(|e| JsValue::from_str(&e))
    }

    pub fn set_boolean_operation(&mut self, id: String, operation: &str) -> bool {
        let Ok(mode) =
            serde_json::from_value::<BooleanOperation>(serde_json::Value::String(operation.into()))
        else {
            return false;
        };
        let id = parse_entity_id(&id);
        self.try_mutate(|d| {
            let Some(node) = d.active_node_mut(id) else {
                return false;
            };
            if node.locked || node.boolean_operation.is_none() {
                return false;
            }
            node.boolean_operation = Some(mode);
            true
        })
        .unwrap_or(false)
    }

    pub fn release_boolean(&mut self, id: String) -> bool {
        let id = parse_entity_id(&id);
        self.try_mutate(|d| {
            let Some(node) = d.active_node_mut(id) else {
                return false;
            };
            if node.locked || node.boolean_operation.is_none() {
                return false;
            }
            node.boolean_operation = None;
            node.boolean_operands.clear();
            node.vector = None;
            node.fill = [0.0; 4];
            node.stroke_width = 0.0;
            node.shadows.clear();
            node.name = "Group".into();
            true
        })
        .unwrap_or(false)
    }

    pub fn mask_nodes(&mut self, node_ids_json: &str) -> String {
        let Ok(ids) = serde_json::from_str::<Vec<EntityId>>(node_ids_json) else {
            return String::new();
        };
        self.mutate(|document| document.mask_nodes(&ids))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn release_mask(&mut self, group_id: String) -> bool {
        let id = parse_entity_id(&group_id);
        self.mutate(|document| document.release_mask(id))
    }

    pub fn ungroup_nodes(&mut self, group_id: String) -> bool {
        let group_id = parse_entity_id(&group_id);
        self.mutate(|document| document.ungroup_nodes(group_id))
    }

    pub fn import_figma_json(&mut self, json: &str) -> Result<String, JsValue> {
        let payload: FigmaImportPayload = serde_json::from_str(json)
            .map_err(|error| JsValue::from_str(&format!("Invalid Figma import: {error}")))?;
        if payload.pages.is_empty() {
            return Err(JsValue::from_str("The Figma import contains no pages"));
        }
        let imported_page_id = self.mutate(|document| {
            let mut assets = std::collections::HashMap::new();
            for asset in payload.assets {
                let id = document.allocate_id();
                assets.insert(asset.source_id, id);
                document.media_assets.push(MediaAsset {
                    id,
                    name: asset.name,
                    kind: MediaAssetKind::Image,
                    mime_type: asset.mime_type,
                    source: asset.source,
                    width: 0,
                    height: 0,
                    tags: vec!["figma".into(), "imported".into()],
                });
            }
            let mut first_page_id = None;
            for page in payload.pages {
                let page_id = document.add_page(if page.name.trim().is_empty() {
                    "Imported page".into()
                } else {
                    page.name
                });
                first_page_id.get_or_insert(page_id);
                let mut node_ids = std::collections::HashMap::new();
                for imported in page.nodes {
                    if ![
                        imported.x,
                        imported.y,
                        imported.width,
                        imported.height,
                        imported.stroke_width,
                        imported.opacity,
                        imported.rotation,
                        imported.layout_gap,
                    ]
                    .iter()
                    .all(|value| value.is_finite())
                    {
                        continue;
                    }
                    let parent_id = imported
                        .parent_source_id
                        .as_ref()
                        .and_then(|source| node_ids.get(source).copied());
                    let id = document.insert_node(
                        &imported.name,
                        imported.kind,
                        parent_id,
                        [
                            imported.x,
                            imported.y,
                            imported.width.max(1.0),
                            imported.height.max(1.0),
                        ],
                        imported.fill,
                    );
                    if let Some(node) = document.active_node_mut(id) {
                        node.stroke = imported.stroke;
                        node.stroke_width = imported.stroke_width.max(0.0);
                        node.corner_radii = imported.corner_radii.map(|value| value.max(0.0));
                        node.stroke_align = imported.stroke_align;
                        node.opacity = imported.opacity.clamp(0.0, 1.0);
                        node.rotation = imported.rotation;
                        node.layout_mode = imported.layout_mode;
                        node.layout_gap = imported.layout_gap.max(0.0);
                        node.layout_padding = imported.layout_padding.map(|value| value.max(0.0));
                        node.shadows = imported.shadows;
                        node.text = imported.text;
                        node.asset_id = imported
                            .asset_source_id
                            .as_ref()
                            .and_then(|source| assets.get(source).copied());
                    }
                    node_ids.insert(imported.source_id, id);
                }
            }
            let page_id = first_page_id.expect("pages were checked above");
            document.set_active_page(page_id);
            page_id
        });
        Ok(imported_page_id.to_string())
    }

    pub fn set_active_page(&mut self, page_id: String) -> bool {
        let page_id = parse_entity_id(&page_id);
        let Some(page) = self.document.pages.iter().find(|page| page.id == page_id) else {
            return false;
        };
        if page.benchmark_node_count.is_some() && page.nodes.is_empty() {
            // Initial lazy benchmark generation adds real nodes and must be
            // journaled. Ordinary navigation changes only local view state.
            return self.mutate(|document| document.set_active_page(page_id));
        }
        self.document.active_page_id = page_id;
        true
    }

    pub fn delete_node(&mut self, node_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        // A geometry transaction only records geometry for nodes that still
        // exist when it ends. Finish it before a structural deletion so the
        // move and deletion receive independent, complete history entries.
        self.end_transaction();
        self.edit_command(
            operations::Command::DeleteNode {
                page_id: self.document.active_page_id,
                node_id,
            },
            |document| document.delete_node(node_id),
        )
    }

    pub fn rename_node(&mut self, node_id: String, name: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.edit_command(
            operations::Command::SetProperties {
                page_id: self.document.active_page_id,
                node_id,
                properties: Box::new(operations::Properties {
                    name: Some(name.clone()),
                    ..Default::default()
                }),
            },
            |document| document.rename_node(node_id, name),
        )
    }

    pub fn group_nodes(&mut self, node_ids_json: &str) -> Result<String, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        self.mutate(|document| document.group_nodes(&node_ids))
            .map(|id| id.to_string())
            .ok_or_else(|| {
                JsValue::from_str("At least two existing nodes are required to create a group")
            })
    }

    pub fn duplicate_nodes(&mut self, node_ids_json: &str) -> Result<String, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        let ids = self.mutate(|document| document.duplicate_nodes(&node_ids));
        serde_json::to_string(&ids)
            .map_err(|error| JsValue::from_str(&format!("Could not serialize duplicates: {error}")))
    }

    pub fn create_component(&mut self, root_id: String, name: String) -> String {
        let root_id = parse_entity_id(&root_id);
        self.mutate(|document| document.create_component(root_id, name))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn add_component_variant(
        &mut self,
        component_id: String,
        root_id: String,
        name: String,
    ) -> String {
        let component_id = parse_entity_id(&component_id);
        let root_id = parse_entity_id(&root_id);
        self.mutate(|document| document.add_component_variant(component_id, root_id, name))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn duplicate_component_variant(
        &mut self,
        component_id: String,
        source_variant_id: String,
        name: String,
    ) -> String {
        let component_id = parse_entity_id(&component_id);
        let source_variant_id = parse_entity_id(&source_variant_id);
        self.mutate(|document| {
            document.duplicate_component_variant(component_id, source_variant_id, name)
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn create_component_instance(
        &mut self,
        component_id: String,
        variant_id: String,
        parent_id: String,
    ) -> String {
        let component_id = parse_entity_id(&component_id);
        let variant_id = parse_entity_id(&variant_id);
        let parent_id = parse_entity_id(&parent_id);
        self.mutate(|document| {
            document.create_component_instance(
                component_id,
                variant_id,
                (!parent_id.is_nil()).then_some(parent_id),
            )
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn set_instance_variant(&mut self, instance_id: String, variant_id: String) -> String {
        let instance_id = parse_entity_id(&instance_id);
        let variant_id = parse_entity_id(&variant_id);
        self.mutate(|document| document.set_instance_variant(instance_id, variant_id))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn reset_component_instance(&mut self, instance_id: String) -> String {
        let instance_id = parse_entity_id(&instance_id);
        self.mutate(|document| document.reset_component_instance(instance_id))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn swap_component_instance(
        &mut self,
        instance_id: String,
        component_id: String,
        variant_id: String,
    ) -> String {
        let instance_id = parse_entity_id(&instance_id);
        let component_id = parse_entity_id(&component_id);
        let variant_id = parse_entity_id(&variant_id);
        self.mutate(|document| {
            document.swap_component_instance(instance_id, component_id, variant_id)
        })
        .map_or_else(String::new, |id| id.to_string())
    }

    pub fn detach_component_instance(&mut self, instance_id: String) -> bool {
        let instance_id = parse_entity_id(&instance_id);
        self.mutate(|document| document.detach_component_instance(instance_id))
    }

    pub fn move_nodes(&mut self, node_ids_json: &str, dx: f32, dy: f32) -> Result<bool, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.edit_command(
            operations::Command::MoveNodes {
                page_id: self.document.active_page_id,
                node_ids: node_ids.clone(),
                dx,
                dy,
            },
            |document| document.move_nodes(&node_ids, dx, dy),
        ))
    }

    pub fn reorder_node(&mut self, dragged_id: String, target_id: String, before: bool) -> bool {
        let dragged_id = parse_entity_id(&dragged_id);
        let target_id = parse_entity_id(&target_id);
        self.edit_command(
            operations::Command::ReorderNode {
                page_id: self.document.active_page_id,
                node_id: dragged_id,
                target_id,
                before,
            },
            |document| document.reorder_node(dragged_id, target_id, before),
        )
    }

    pub fn reparent_nodes_to_artboards(&mut self, node_ids_json: &str) -> Result<bool, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.reparent_nodes_to_artboards(&node_ids)))
    }

    // Kept flat because wasm-bindgen exposes this method directly to JavaScript.
    #[allow(clippy::too_many_arguments)]
    pub fn set_node_style(
        &mut self,
        node_id: String,
        fill_hex: String,
        stroke_hex: String,
        stroke_width: f32,
        radius_top_left: f32,
        radius_top_right: f32,
        radius_bottom_right: f32,
        radius_bottom_left: f32,
        stroke_align: String,
        stroke_join: String,
    ) -> Result<bool, JsValue> {
        let node_id = parse_entity_id(&node_id);
        let corner_radii = [
            radius_top_left,
            radius_top_right,
            radius_bottom_right,
            radius_bottom_left,
        ];
        let stroke_align = match stroke_align.as_str() {
            "center" => StrokeAlign::Center,
            "outside" => StrokeAlign::Outside,
            _ => StrokeAlign::Inside,
        };
        let stroke_join = if stroke_join == "straight" {
            StrokeJoin::Straight
        } else {
            StrokeJoin::Round
        };
        let fill = parse_hex_color(&fill_hex)
            .ok_or_else(|| JsValue::from_str("Fill must be a six-digit hex color"))?;
        let stroke = parse_hex_color(&stroke_hex)
            .ok_or_else(|| JsValue::from_str("Border must be a six-digit hex color"))?;
        if self.operation_session.is_some() {
            return Ok(self.edit_command(
                operations::Command::SetProperties {
                    page_id: self.document.active_page_id,
                    node_id,
                    properties: Box::new(operations::Properties {
                        fill: Some(fill),
                        stroke: Some(stroke),
                        stroke_width: Some(stroke_width),
                        corner_radii: Some(corner_radii),
                        stroke_align: Some(stroke_align),
                        stroke_join: Some(stroke_join),
                        ..Default::default()
                    }),
                },
                |document| {
                    document.set_node_style(
                        node_id,
                        fill,
                        stroke,
                        stroke_width,
                        corner_radii,
                        stroke_align,
                        stroke_join,
                    )
                },
            ));
        }
        if self.transaction_start.is_some() {
            return Ok(self.document.set_node_style(
                node_id,
                fill,
                stroke,
                stroke_width,
                corner_radii,
                stroke_align,
                stroke_join,
            ));
        }
        let page_id = self.document.active_page_id;
        let before = self
            .document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == node_id)
            .map(NodeStyleState::capture);
        let changed = self.document.set_node_style(
            node_id,
            fill,
            stroke,
            stroke_width,
            corner_radii,
            stroke_align,
            stroke_join,
        );
        if changed {
            let is_component_source = self.document.active_node(node_id).is_some_and(|node| {
                node.instance_root_id.is_none() && node.component_slot_id == Some(node.id)
            });
            if is_component_source {
                self.document.sync_component_instances();
            }
            if let Some(style) = before {
                self.push_undo(HistoryEntry::NodeStyle {
                    page_id,
                    node_id,
                    style,
                });
            }
            self.redo_stack.clear();
        }
        Ok(changed)
    }

    pub fn resize_node(&mut self, node_id: String, handle: String, dx: f32, dy: f32) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.edit_command(
            operations::Command::ResizeNode {
                page_id: self.document.active_page_id,
                node_id,
                handle: handle.clone(),
                dx,
                dy,
            },
            |document| document.resize_node(node_id, &handle, dx, dy),
        )
    }

    pub fn set_node_locked(&mut self, node_id: String, locked: bool) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.edit_command(
            operations::Command::SetProperties {
                page_id: self.document.active_page_id,
                node_id,
                properties: Box::new(operations::Properties {
                    locked: Some(locked),
                    ..Default::default()
                }),
            },
            |document| document.set_node_locked(node_id, locked),
        )
    }

    pub fn set_node_text(&mut self, node_id: String, text_json: &str) -> Result<bool, JsValue> {
        let text: TextStyle = serde_json::from_str(text_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid text style: {error}")))?;
        let node_id = parse_entity_id(&node_id);
        Ok(self.edit_command(
            operations::Command::SetProperties {
                page_id: self.document.active_page_id,
                node_id,
                properties: Box::new(operations::Properties {
                    text: Some(text.clone()),
                    ..Default::default()
                }),
            },
            |document| document.set_node_text(node_id, text),
        ))
    }

    pub fn set_node_image_fit(&mut self, node_id: String, fit: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let fit = match fit.as_str() {
            "contain" => ImageFit::Contain,
            "fill" => ImageFit::Fill,
            _ => ImageFit::Cover,
        };
        self.mutate(|document| document.set_node_image_fit(node_id, fit))
    }

    pub fn set_node_asset(&mut self, node_id: String, asset_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let asset_id = parse_entity_id(&asset_id);
        self.mutate(|document| document.set_node_asset(node_id, asset_id))
    }

    pub fn set_node_opacity(&mut self, node_id: String, opacity: f32) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.edit_command(
            operations::Command::SetProperties {
                page_id: self.document.active_page_id,
                node_id,
                properties: Box::new(operations::Properties {
                    opacity: Some(opacity),
                    ..Default::default()
                }),
            },
            |document| document.set_node_opacity(node_id, opacity),
        )
    }

    pub fn set_node_shadows(
        &mut self,
        node_id: String,
        shadows_json: &str,
    ) -> Result<bool, JsValue> {
        let node_id = parse_entity_id(&node_id);
        let shadows: Vec<Shadow> = serde_json::from_str(shadows_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid shadows: {error}")))?;
        Ok(self.edit_command(
            operations::Command::SetProperties {
                page_id: self.document.active_page_id,
                node_id,
                properties: Box::new(operations::Properties {
                    shadows: Some(shadows.clone()),
                    ..Default::default()
                }),
            },
            |document| document.set_node_shadows(node_id, shadows),
        ))
    }

    pub fn set_node_transform(
        &mut self,
        node_id: String,
        rotation: f32,
        flip_x: bool,
        flip_y: bool,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.edit_command(
            operations::Command::SetTransform {
                page_id: self.document.active_page_id,
                node_id,
                rotation,
                flip_x,
                flip_y,
            },
            |document| document.set_node_transform(node_id, rotation, flip_x, flip_y),
        )
    }

    // Keep scalar arguments at the WASM boundary so JavaScript callers do not
    // need to construct or serialize a Rust-specific layout type.
    #[allow(clippy::too_many_arguments)]
    pub fn set_node_layout(
        &mut self,
        node_id: String,
        mode: String,
        align: String,
        justify: String,
        gap: f32,
        top: f32,
        right: f32,
        bottom: f32,
        left: f32,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        let mode = match mode.as_str() {
            "row" => LayoutMode::Row,
            "column" => LayoutMode::Column,
            _ => LayoutMode::None,
        };
        let align = match align.as_str() {
            "center" => LayoutAlign::Center,
            "end" => LayoutAlign::End,
            _ => LayoutAlign::Start,
        };
        let justify = match justify.as_str() {
            "center" => LayoutAlign::Center,
            "end" => LayoutAlign::End,
            _ => LayoutAlign::Start,
        };
        self.mutate(|document| {
            document.set_node_layout(
                node_id,
                mode,
                align,
                justify,
                gap,
                [top, right, bottom, left],
            )
        })
    }

    pub fn set_node_width_sizing(&mut self, node_id: String, sizing: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let sizing = if sizing == "fill" {
            LayoutSizing::Fill
        } else {
            LayoutSizing::Fixed
        };
        self.mutate(|document| document.set_node_width_sizing(node_id, sizing))
    }

    pub fn set_node_auto_height(&mut self, node_id: String, auto_height: bool) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.set_node_auto_height(node_id, auto_height))
    }

    pub fn set_artboard_guide(
        &mut self,
        node_id: String,
        mode: String,
        count: u32,
        gap: f32,
        color_hex: String,
        opacity: f32,
    ) -> Result<bool, JsValue> {
        let node_id = parse_entity_id(&node_id);
        let color = parse_hex_color(&color_hex)
            .ok_or_else(|| JsValue::from_str("Guide color must be a six-digit hex color"))?;
        let mode = match mode.as_str() {
            "grid" => GuideMode::Grid,
            "columns" => GuideMode::Columns,
            _ => GuideMode::None,
        };
        Ok(self.mutate(|document| {
            document.set_artboard_guide(node_id, mode, count, gap, color, opacity)
        }))
    }

    pub fn add_document_color(
        &mut self,
        name: String,
        color_hex: String,
    ) -> Result<String, JsValue> {
        let color = normalize_hex_color(&color_hex)
            .ok_or_else(|| JsValue::from_str("Document color must be a six-digit hex color"))?;
        Ok(self
            .mutate(|document| document.add_document_color(name, color))
            .to_string())
    }

    pub fn add_number_variable(&mut self, name: String, value: f32) -> String {
        self.mutate(|document| document.add_number_variable(name, value))
            .map_or_else(String::new, |id| id.to_string())
    }

    pub fn update_number_variable(
        &mut self,
        variable_id: String,
        name: String,
        value: f32,
    ) -> bool {
        let variable_id = parse_entity_id(&variable_id);
        self.mutate(|document| document.update_number_variable(variable_id, name, value))
    }

    pub fn delete_number_variable(&mut self, variable_id: String) -> bool {
        let variable_id = parse_entity_id(&variable_id);
        self.mutate(|document| document.delete_number_variable(variable_id))
    }

    pub fn bind_node_variable(
        &mut self,
        node_id: String,
        property: String,
        variable_id: String,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        let variable_id = parse_entity_id(&variable_id);
        self.mutate(|document| {
            document.bind_node_variable(
                node_id,
                &property,
                (!variable_id.is_nil()).then_some(variable_id),
            )
        })
    }

    pub fn add_text_style(&mut self, name: String, style_json: &str) -> Result<String, JsValue> {
        let style: TypographyStyle = serde_json::from_str(style_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid text style: {error}")))?;
        Ok(self
            .mutate(|document| document.add_text_style(name, style))
            .to_string())
    }

    pub fn update_text_style(
        &mut self,
        style_id: String,
        name: String,
        style_json: &str,
    ) -> Result<bool, JsValue> {
        let style_id = parse_entity_id(&style_id);
        let style: TypographyStyle = serde_json::from_str(style_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid text style: {error}")))?;
        Ok(self.mutate(|document| document.update_text_style(style_id, name, style)))
    }

    pub fn delete_text_style(&mut self, style_id: String) -> bool {
        let style_id = parse_entity_id(&style_id);
        self.mutate(|document| document.delete_text_style(style_id))
    }

    pub fn bind_node_text_style(&mut self, node_id: String, style_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        let style_id = parse_entity_id(&style_id);
        self.mutate(|document| {
            document.bind_node_text_style(node_id, (!style_id.is_nil()).then_some(style_id))
        })
    }

    pub fn align_nodes(&mut self, node_ids_json: &str, alignment: String) -> Result<bool, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.align_nodes(&node_ids, &alignment)))
    }

    pub fn set_node_bounds(
        &mut self,
        node_id: String,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    ) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.edit_command(
            operations::Command::SetBounds {
                page_id: self.document.active_page_id,
                node_id,
                x,
                y,
                width,
                height,
            },
            |document| document.set_node_bounds(node_id, x, y, width, height),
        )
    }

    pub fn begin_transaction(&mut self) {
        if self.transaction_start.is_none() {
            self.transaction_start = Some(self.document.clone());
        }
    }

    pub fn begin_geometry_transaction(&mut self, node_ids_json: &str) -> Result<(), JsValue> {
        if self.transaction_start.is_some() || self.geometry_transaction_start.is_some() {
            return Ok(());
        }
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        if self.operation_session.is_some()
            || self.document.active_page().benchmark_node_count.is_none()
        {
            self.begin_transaction();
            return Ok(());
        }
        let page_id = self.document.active_page_id;
        let selected: std::collections::HashSet<EntityId> = node_ids.iter().copied().collect();
        let includes_group = node_ids.iter().any(|id| {
            self.document
                .active_node(*id)
                .is_some_and(|node| node.kind == NodeKind::Group)
        });
        let nodes = if includes_group {
            self.document
                .active_page()
                .nodes
                .iter()
                .filter(|node| {
                    if selected.contains(&node.id) {
                        return true;
                    }
                    let mut parent_id = node.parent_id;
                    while let Some(parent) = parent_id {
                        if selected.contains(&parent) {
                            return true;
                        }
                        parent_id = self
                            .document
                            .active_node(parent)
                            .and_then(|ancestor| ancestor.parent_id);
                    }
                    false
                })
                .map(NodeGeometryState::capture)
                .collect()
        } else {
            node_ids
                .iter()
                .filter_map(|id| self.document.active_node(*id))
                .map(NodeGeometryState::capture)
                .collect()
        };
        self.geometry_transaction_start = Some(HistoryEntry::Geometry { page_id, nodes });
        Ok(())
    }

    pub fn end_transaction(&mut self) {
        if let Some(before) = self.transaction_start.take() {
            if component_source_changed(&before, &self.document) {
                self.document.sync_component_instances();
            }
            if let Err(error) = self.document.sync_booleans() {
                self.document = before;
                self.operation_error = Some(error);
                return;
            }
            if self.operation_session.is_some() {
                self.record_operation(&before);
                return;
            }
            if before != self.document {
                self.push_undo(HistoryEntry::Document(before));
                self.redo_stack.clear();
            }
        }
        if let Some(entry @ HistoryEntry::Geometry { .. }) = self.geometry_transaction_start.take()
        {
            let changed = match &entry {
                HistoryEntry::Geometry { page_id, nodes } => self
                    .document
                    .pages
                    .iter()
                    .find(|page| page.id == *page_id)
                    .is_some_and(|page| {
                        nodes.iter().any(|before| {
                            page.nodes
                                .iter()
                                .find(|node| node.id == before.id)
                                .is_some_and(|node| NodeGeometryState::capture(node) != *before)
                        })
                    }),
                _ => false,
            };
            if changed {
                self.push_undo(entry);
                self.redo_stack.clear();
            }
        }
    }

    pub fn can_undo(&self) -> bool {
        self.operation_session
            .as_ref()
            .map_or(!self.undo_stack.is_empty(), |s| {
                s.undo.get(&s.actor).is_some_and(|v| !v.is_empty())
            })
    }

    pub fn can_redo(&self) -> bool {
        self.operation_session
            .as_ref()
            .map_or(!self.redo_stack.is_empty(), |s| {
                s.redo.get(&s.actor).is_some_and(|v| !v.is_empty())
            })
    }

    pub fn undo(&mut self) -> bool {
        self.end_transaction();
        if self.operation_session.is_some() {
            return self.operation_history(false);
        }
        let Some(previous) = self.undo_stack.pop() else {
            return false;
        };
        let before = self.document.clone();
        self.redo_stack.push(previous.apply(&mut self.document));
        if component_source_changed(&before, &self.document) {
            self.document.sync_component_instances();
        }
        true
    }

    pub fn redo(&mut self) -> bool {
        self.end_transaction();
        if self.operation_session.is_some() {
            return self.operation_history(true);
        }
        let Some(next) = self.redo_stack.pop() else {
            return false;
        };
        let before = self.document.clone();
        let inverse = next.apply(&mut self.document);
        if component_source_changed(&before, &self.document) {
            self.document.sync_component_instances();
        }
        self.push_undo(inverse);
        true
    }

    /// Returns the topmost renderable node under a world-space point, or zero.
    pub fn hit_test(&self, x: f32, y: f32) -> String {
        if let Some(hit) = self.document.benchmark_hit_test(x, y) {
            return if hit.is_nil() {
                String::new()
            } else {
                hit.to_string()
            };
        }
        let page = self.document.active_page();
        let by_id: std::collections::HashMap<_, _> =
            page.nodes.iter().map(|node| (node.id, node)).collect();
        let masks: std::collections::HashMap<_, _> = page
            .nodes
            .iter()
            .filter(|n| n.mask_shape)
            .filter_map(|n| n.parent_id.map(|id| (id, n)))
            .collect();
        ordered_nodes(page)
            .into_iter()
            .rev()
            .find(|node| {
                if (node.kind == NodeKind::Group && node.boolean_operation.is_none())
                    || node.locked
                    || node.opacity <= 0.0
                    || (node.boolean_operation.is_none() && !point_in_rotated_node(node, x, y))
                {
                    return false;
                }
                if node.boolean_operation.is_some() && !geometry::point_in_mask(node, x, y) {
                    return false;
                }
                let mut parent = node.parent_id;
                while let Some(id) = parent {
                    if by_id
                        .get(&id)
                        .is_some_and(|n| n.boolean_operation.is_some())
                    {
                        return false;
                    }
                    parent = by_id.get(&id).and_then(|n| n.parent_id);
                }
                let mut current = Some(*node);
                while let Some(ancestor) = current {
                    if (ancestor.kind == NodeKind::Group
                        && masks
                            .get(&ancestor.id)
                            .is_some_and(|mask| !geometry::point_in_mask(mask, x, y)))
                        || ancestor.opacity <= 0.0
                        || (ancestor.kind == NodeKind::Frame
                            && !geometry::point_in_frame(ancestor, x, y))
                    {
                        return false;
                    }
                    current = ancestor.parent_id.and_then(|id| by_id.get(&id).copied());
                }
                true
            })
            .map_or_else(String::new, |node| node.id.to_string())
    }

    pub fn load_json(json: &str) -> Result<DocumentEngine, JsValue> {
        console_error_panic_hook::set_once();
        #[derive(serde::Deserialize)]
        struct Header {
            schema_version: Option<u32>,
            operation_history: Option<operations::Journal>,
        }
        // Deserialize current files directly. Building a generic Value tree for
        // the document AND its journal can exhaust the WASM address space.
        let header: Header = serde_json::from_str(json)
            .map_err(|error| JsValue::from_str(&format!("Invalid Open Libra document: {error}")))?;
        let mut document: Document = if header.schema_version == Some(SCHEMA_VERSION) {
            serde_json::from_str(json)
        } else {
            let mut value: serde_json::Value = serde_json::from_str(json).map_err(|error| {
                JsValue::from_str(&format!("Invalid Open Libra document: {error}"))
            })?;
            if let Some(object) = value.as_object_mut() {
                object.remove("operation_history");
            }
            migrate_legacy_document_ids(&mut value);
            serde_json::from_value(value)
        }
        .map_err(|error| JsValue::from_str(&format!("Invalid Open Libra document: {error}")))?;
        document
            .validate()
            .map_err(|error| JsValue::from_str(&error))?;
        let operation_session = header
            .operation_history
            .map(|journal| operations::Session::restore(journal, &document, Uuid::now_v7()))
            .transpose()
            .map_err(|e| JsValue::from_str(&e))?;
        let mut operation_session = operation_session;
        let page = document.active_page();
        if page.benchmark_node_count.is_some() && page.nodes.is_empty() {
            let before_population = document.clone();
            document.populate_active_benchmark();
            if let Some(session) = &mut operation_session {
                session.record(&before_population, &document, None);
            }
        }
        Ok(Self {
            document,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            transaction_start: None,
            geometry_transaction_start: None,
            operation_session,
            operation_error: None,
        })
    }
}

impl DocumentEngine {
    fn mutate<R>(&mut self, operation: impl FnOnce(&mut Document) -> R) -> R {
        self.mutate_checked(operation).0
    }

    /// Like `mutate`, but also returns the boolean synchronization error that
    /// caused the edit to be rolled back, so callers do not report success.
    fn try_mutate<R>(&mut self, operation: impl FnOnce(&mut Document) -> R) -> Result<R, String> {
        match self.mutate_checked(operation) {
            (result, None) => Ok(result),
            (_, Some(error)) => Err(error),
        }
    }

    fn mutate_checked<R>(
        &mut self,
        operation: impl FnOnce(&mut Document) -> R,
    ) -> (R, Option<String>) {
        if self.transaction_start.is_some() || self.geometry_transaction_start.is_some() {
            let before = self.document.has_booleans().then(|| self.document.clone());
            let result = operation(&mut self.document);
            if let Err(error) = self.document.sync_booleans() {
                if let Some(before) = before {
                    self.document = before;
                }
                self.operation_error = Some(error.clone());
                return (result, Some(error));
            }
            return (result, None);
        }
        let before = self.document.clone();
        let result = operation(&mut self.document);
        if let Err(error) = self.document.sync_booleans() {
            self.document = before;
            self.operation_error = Some(error.clone());
            return (result, Some(error));
        }
        if component_source_changed(&before, &self.document) {
            self.document.sync_component_instances();
        }
        if let Err(error) = self.document.sync_booleans() {
            self.document = before;
            self.operation_error = Some(error.clone());
            return (result, Some(error));
        }
        if self.operation_session.is_some() {
            self.record_operation(&before);
            return (result, None);
        }
        if before != self.document {
            if self.transaction_start.is_none() {
                self.push_undo(HistoryEntry::Document(before));
            }
            self.redo_stack.clear();
        }
        (result, None)
    }

    fn edit_command(
        &mut self,
        command: operations::Command,
        fallback: impl FnOnce(&mut Document) -> bool,
    ) -> bool {
        if self.operation_session.is_none()
            || self.transaction_start.is_some()
            || self.geometry_transaction_start.is_some()
        {
            return self.mutate(fallback);
        }
        let before = self.document.clone();
        let session = self.operation_session.as_mut().unwrap();
        let envelope = session.envelope(command);
        match session.apply(&mut self.document, envelope, false) {
            Ok(_) => {
                self.operation_error = None;
                before != self.document
            }
            Err(error) => {
                self.operation_error = Some(error);
                false
            }
        }
    }

    fn record_operation(&mut self, before: &Document) {
        if let Err(error) = self.document.validate() {
            self.document = before.clone();
            self.operation_error = Some(error);
            return;
        }
        self.operation_error = None;
        self.operation_session
            .as_mut()
            .unwrap()
            .record(before, &self.document, None);
    }

    fn operation_history(&mut self, redo: bool) -> bool {
        let session = self.operation_session.as_mut().unwrap();
        let stack = if redo { &session.redo } else { &session.undo };
        let Some(id) = stack.get(&session.actor).and_then(|v| v.last()).copied() else {
            return false;
        };
        let command = if redo {
            operations::Command::Redo { operation_id: id }
        } else {
            operations::Command::Undo { operation_id: id }
        };
        let envelope = session.envelope(command);
        match session.apply(&mut self.document, envelope, false) {
            Ok(_) => {
                self.operation_error = None;
                true
            }
            Err(e) => {
                self.operation_error = Some(e);
                false
            }
        }
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

#[cfg(test)]
mod operation_tests;

fn valid_path(contours: &[VectorContour]) -> bool {
    !contours.is_empty()
        && contours.len() <= 1024
        && contours.iter().all(|c| {
            c.points.len() >= 2
                && c.points.len() <= 10000
                && c.points.iter().all(|p| {
                    p.position
                        .iter()
                        .chain(p.handle_in.iter().flatten())
                        .chain(p.handle_out.iter().flatten())
                        .all(|v| v.is_finite() && v.abs() <= 1_000_000.0)
                })
        })
}

// Keep moved handles/anchors selectable outside the original box while preserving
// their world positions under rotation and reflection.
fn expand_path_bounds(node: &mut Node) {
    let Some(VectorData {
        geometry: VectorGeometry::Path { contours },
        ..
    }) = &mut node.vector
    else {
        return;
    };
    let (mut left, mut top, mut right, mut bottom) = (0.0_f32, 0.0_f32, 1.0_f32, 1.0_f32);
    for point in contours.iter().flat_map(|c| &c.points) {
        for p in std::iter::once(&point.position)
            .chain(point.handle_in.iter())
            .chain(point.handle_out.iter())
        {
            left = left.min(p[0]);
            top = top.min(p[1]);
            right = right.max(p[0]);
            bottom = bottom.max(p[1]);
        }
    }
    if left == 0.0 && top == 0.0 && right == 1.0 && bottom == 1.0 {
        return;
    }
    let width = node.width * (right - left);
    let height = node.height * (bottom - top);
    let dx =
        (left * node.width + width / 2.0 - node.width / 2.0) * if node.flip_x { -1.0 } else { 1.0 };
    let dy = (top * node.height + height / 2.0 - node.height / 2.0)
        * if node.flip_y { -1.0 } else { 1.0 };
    let angle = node.rotation.to_radians();
    node.x += node.width / 2.0 + dx * angle.cos() - dy * angle.sin() - width / 2.0;
    node.y += node.height / 2.0 + dx * angle.sin() + dy * angle.cos() - height / 2.0;
    node.width = width;
    node.height = height;
    for point in contours.iter_mut().flat_map(|c| &mut c.points) {
        for p in std::iter::once(&mut point.position)
            .chain(point.handle_in.iter_mut())
            .chain(point.handle_out.iter_mut())
        {
            p[0] = (p[0] - left) / (right - left);
            p[1] = (p[1] - top) / (bottom - top);
        }
    }
}
