use crate::*;
use std::collections::HashSet;
impl Document {
    pub(crate) fn insert_node(
        &mut self,
        name: &str,
        kind: NodeKind,
        parent_id: Option<EntityId>,
        bounds: [f32; 4],
        fill: [f32; 4],
    ) -> EntityId {
        let id = self.allocate_id();
        self.active_page_mut().nodes.push(Node {
            id,
            name: name.into(),
            kind,
            parent_id,
            x: bounds[0],
            y: bounds[1],
            width: bounds[2],
            height: bounds[3],
            fill,
            stroke: [0.12, 0.14, 0.18, 1.0],
            stroke_width: 0.0,
            corner_radii: [0.0; 4],
            stroke_align: StrokeAlign::Inside,
            stroke_join: StrokeJoin::Round,
            opacity: 1.0,
            rotation: 0.0,
            flip_x: false,
            flip_y: false,
            shadows: Vec::new(),
            layout_mode: LayoutMode::None,
            layout_align: LayoutAlign::Start,
            layout_justify: LayoutAlign::Start,
            layout_gap: 0.0,
            layout_padding: [0.0; 4],
            width_sizing: LayoutSizing::Fixed,
            auto_height: false,
            guide_mode: GuideMode::None,
            guide_count: default_guide_count(),
            guide_gap: default_guide_gap(),
            guide_color: [0.25, 0.55, 1.0, 1.0],
            guide_opacity: default_guide_opacity(),
            locked: false,
            text: (kind == NodeKind::Text).then(TextStyle::default),
            vector: None,
            variable_bindings: VariableBindings::default(),
            text_style_id: None,
            asset_id: None,
            image_fit: ImageFit::Cover,
            component_id: None,
            component_variant_id: None,
            component_slot_id: None,
            instance_root_id: None,
            text_override: false,
            asset_override: false,
        });
        id
    }

    pub(crate) fn add_node(&mut self, kind: NodeKind) -> EntityId {
        let index = self.active_page().nodes.len() as f32;
        let offset = (index % 12.0) * 18.0;
        match kind {
            NodeKind::Frame => self.insert_node(
                "Frame",
                kind,
                None,
                [120.0 + offset, 120.0 + offset, 320.0, 240.0],
                [0.96, 0.97, 0.99, 1.0],
            ),
            NodeKind::Text => self.insert_node(
                "Text",
                kind,
                None,
                [160.0 + offset, 160.0 + offset, 240.0, 80.0],
                [0.08, 0.09, 0.12, 1.0],
            ),
            NodeKind::Vector => self.add_vector_shape(VectorGeometry::Ellipse, None),
            _ => self.insert_node(
                "Rectangle",
                kind,
                None,
                [160.0 + offset, 160.0 + offset, 160.0, 100.0],
                [0.46, 0.91, 0.72, 1.0],
            ),
        }
    }

    pub(crate) fn add_vector_shape(
        &mut self,
        geometry: VectorGeometry,
        parent_id: Option<EntityId>,
    ) -> EntityId {
        let index = self.active_page().nodes.len() as f32;
        let offset = (index % 12.0) * 18.0;
        let (name, width, height) = match &geometry {
            VectorGeometry::Ellipse => ("Ellipse", 140.0, 140.0),
            VectorGeometry::Line => ("Line", 180.0, 2.0),
            VectorGeometry::Polygon { .. } => ("Polygon", 150.0, 150.0),
            VectorGeometry::Star { .. } => ("Star", 160.0, 160.0),
            VectorGeometry::Path { .. } => ("Vector", 160.0, 120.0),
        };
        let valid_parent = parent_id.filter(|id| {
            self.active_node(*id)
                .is_some_and(|node| matches!(node.kind, NodeKind::Frame | NodeKind::Group))
        });
        let id = self.insert_node(
            name,
            NodeKind::Vector,
            valid_parent,
            [160.0 + offset, 160.0 + offset, width, height],
            [0.46, 0.91, 0.72, 1.0],
        );
        let node = self.active_node_mut(id).expect("inserted vector exists");
        node.stroke_width = if matches!(geometry, VectorGeometry::Line) {
            2.0
        } else {
            0.0
        };
        node.vector = Some(VectorData {
            geometry,
            fill_rule: FillRule::Nonzero,
        });
        id
    }

    pub(crate) fn add_rectangle_to(&mut self, parent_id: Option<EntityId>) -> EntityId {
        let parent = parent_id.and_then(|id| {
            self.active_page()
                .nodes
                .iter()
                .find(|node| {
                    node.id == id && matches!(node.kind, NodeKind::Frame | NodeKind::Group)
                })
                .cloned()
        });
        let index = self.active_page().nodes.len() as f32;
        let bounds = parent
            .as_ref()
            .map(|parent| {
                [
                    parent.x + parent.layout_padding[3] + 24.0,
                    parent.y + parent.layout_padding[0] + 24.0,
                    160.0,
                    100.0,
                ]
            })
            .unwrap_or([
                160.0 + (index % 12.0) * 18.0,
                160.0 + (index % 12.0) * 18.0,
                160.0,
                100.0,
            ]);
        let actual_parent = parent.as_ref().map(|parent| parent.id);
        let id = self.insert_node(
            "Rectangle",
            NodeKind::Rectangle,
            actual_parent,
            bounds,
            [0.46, 0.91, 0.72, 1.0],
        );
        if let Some(parent_id) = actual_parent {
            self.relayout_container(parent_id);
        }
        id
    }

    pub(crate) fn add_text_to(&mut self, parent_id: Option<EntityId>) -> EntityId {
        let parent = parent_id.and_then(|id| {
            self.active_page()
                .nodes
                .iter()
                .find(|node| {
                    node.id == id && matches!(node.kind, NodeKind::Frame | NodeKind::Group)
                })
                .cloned()
        });
        let index = self.active_page().nodes.len() as f32;
        let bounds = parent
            .as_ref()
            .map(|parent| {
                [
                    parent.x + parent.layout_padding[3] + 24.0,
                    parent.y + parent.layout_padding[0] + 24.0,
                    240.0,
                    80.0,
                ]
            })
            .unwrap_or([
                160.0 + (index % 12.0) * 18.0,
                160.0 + (index % 12.0) * 18.0,
                240.0,
                80.0,
            ]);
        let actual_parent = parent.as_ref().map(|parent| parent.id);
        let id = self.insert_node(
            "Text",
            NodeKind::Text,
            actual_parent,
            bounds,
            [0.08, 0.09, 0.12, 1.0],
        );
        if let Some(parent_id) = actual_parent {
            self.relayout_container(parent_id);
        }
        id
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn add_media_asset_node(
        &mut self,
        kind: MediaAssetKind,
        name: String,
        mime_type: String,
        source: String,
        width: u32,
        height: u32,
        parent_id: Option<EntityId>,
    ) -> Option<EntityId> {
        if source.is_empty() || source.len() > 20_000_000 || width == 0 || height == 0 {
            return None;
        }
        let asset_id = self.allocate_id();
        let name: String = if name.trim().is_empty() {
            match kind {
                MediaAssetKind::Image => "Image".into(),
                MediaAssetKind::Icon => "Icon".into(),
            }
        } else {
            name.trim().chars().take(120).collect()
        };
        self.media_assets.push(MediaAsset {
            id: asset_id,
            name: name.clone(),
            kind,
            mime_type: mime_type.chars().take(100).collect(),
            source,
            width,
            height,
            tags: Vec::new(),
        });
        self.add_node_from_asset(asset_id, parent_id)
    }

    pub(crate) fn add_node_from_asset(
        &mut self,
        asset_id: EntityId,
        parent_id: Option<EntityId>,
    ) -> Option<EntityId> {
        let asset = self
            .media_assets
            .iter()
            .find(|asset| asset.id == asset_id)?
            .clone();
        let parent = parent_id.and_then(|id| {
            self.active_page()
                .nodes
                .iter()
                .find(|node| {
                    node.id == id && matches!(node.kind, NodeKind::Frame | NodeKind::Group)
                })
                .cloned()
        });
        let max_width: f32 = if asset.kind == MediaAssetKind::Icon {
            48.0
        } else {
            320.0
        };
        let ratio = asset.height as f32 / asset.width.max(1) as f32;
        let width = max_width.min(asset.width as f32).max(24.0);
        let height = if asset.kind == MediaAssetKind::Icon {
            width
        } else {
            (width * ratio).clamp(24.0, 320.0)
        };
        let index = self.active_page().nodes.len() as f32;
        let (x, y, actual_parent) = parent
            .as_ref()
            .map(|parent| {
                (
                    parent.x + parent.layout_padding[3] + 24.0,
                    parent.y + parent.layout_padding[0] + 24.0,
                    Some(parent.id),
                )
            })
            .unwrap_or((
                160.0 + (index % 12.0) * 18.0,
                160.0 + (index % 12.0) * 18.0,
                None,
            ));
        let node_kind = match asset.kind {
            MediaAssetKind::Image => NodeKind::Image,
            MediaAssetKind::Icon => NodeKind::Icon,
        };
        let id = self.insert_node(
            &asset.name,
            node_kind,
            actual_parent,
            [x, y, width, height],
            if node_kind == NodeKind::Icon {
                [0.08, 0.10, 0.12, 1.0]
            } else {
                [1.0; 4]
            },
        );
        let component_source_parent = actual_parent.is_some_and(|parent_id| {
            let mut current = self.active_node(parent_id);
            while let Some(node) = current {
                if node.component_id.is_some() && node.instance_root_id.is_none() {
                    return true;
                }
                current = node.parent_id.and_then(|id| self.active_node(id));
            }
            false
        });
        let node = self.active_node_mut(id).unwrap();
        node.asset_id = Some(asset_id);
        node.corner_radii = if node_kind == NodeKind::Image {
            [12.0; 4]
        } else {
            [0.0; 4]
        };
        if component_source_parent {
            node.component_slot_id = Some(id);
        }
        if let Some(parent_id) = actual_parent {
            self.relayout_container(parent_id);
        }
        Some(id)
    }

    pub(crate) fn add_artboard(&mut self, name: String, width: f32, height: f32) -> EntityId {
        let right_edge = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.kind == NodeKind::Frame && node.parent_id.is_none())
            .map(|node| node.x + node.width)
            .fold(0.0_f32, f32::max);
        let x = if right_edge == 0.0 {
            80.0
        } else {
            right_edge + 80.0
        };
        self.insert_node(
            &name,
            NodeKind::Frame,
            None,
            [x, 80.0, width, height],
            [0.96, 0.97, 0.99, 1.0],
        )
    }

    pub(crate) fn delete_node(&mut self, node_id: EntityId) -> bool {
        let page = self.active_page();
        if page
            .nodes
            .iter()
            .any(|node| node.id == node_id && node.locked)
        {
            return false;
        }
        let mut removed = HashSet::from([node_id]);
        loop {
            let descendants: Vec<_> = page
                .nodes
                .iter()
                .filter(|node| {
                    node.parent_id
                        .is_some_and(|parent| removed.contains(&parent))
                })
                .map(|node| node.id)
                .collect();
            let previous_len = removed.len();
            removed.extend(descendants);
            if removed.len() == previous_len {
                break;
            }
        }
        if self
            .components
            .iter()
            .flat_map(|component| &component.variants)
            .any(|variant| removed.contains(&variant.source_root_id))
        {
            return false;
        }
        let page = self.active_page_mut();
        let before = page.nodes.len();
        page.nodes.retain(|node| !removed.contains(&node.id));
        page.nodes.len() != before
    }

    pub(crate) fn rename_node(&mut self, node_id: EntityId, name: String) -> bool {
        if let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        {
            if node.locked {
                return false;
            }
            node.name = name;
            true
        } else {
            false
        }
    }
}
