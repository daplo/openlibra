use crate::*;

#[wasm_bindgen]
impl DocumentEngine {
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

    pub fn delete_node(&mut self, node_id: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        // A geometry transaction only records geometry for nodes that still
        // exist when it ends. Finish it before a structural deletion so the
        // move and deletion receive independent, complete history entries.
        self.end_transaction();
        self.mutate(|document| document.delete_node(node_id))
    }

    pub fn rename_node(&mut self, node_id: String, name: String) -> bool {
        let node_id = parse_entity_id(&node_id);
        self.mutate(|document| document.rename_node(node_id, name))
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
        Ok(self.mutate(|document| document.move_nodes(&node_ids, dx, dy)))
    }

    pub fn reorder_node(&mut self, dragged_id: String, target_id: String, before: bool) -> bool {
        let dragged_id = parse_entity_id(&dragged_id);
        let target_id = parse_entity_id(&target_id);
        self.mutate(|document| document.reorder_node(dragged_id, target_id, before))
    }

    pub fn reparent_nodes_to_artboards(&mut self, node_ids_json: &str) -> Result<bool, JsValue> {
        let node_ids: Vec<EntityId> = serde_json::from_str(node_ids_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid node selection: {error}")))?;
        Ok(self.mutate(|document| document.reparent_nodes_to_artboards(&node_ids)))
    }
}
