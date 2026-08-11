use crate::geometry::point_in_rotated_node;
use crate::*;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

impl Document {
    pub(crate) fn demo() -> Self {
        let home_id = Uuid::now_v7();
        let mut document = Self {
            schema_version: SCHEMA_VERSION,
            active_page_id: home_id,
            pages: vec![Page {
                id: home_id,
                name: "Home".into(),
                description: "Sample mobile and desktop interface composition.".into(),
                nodes: Vec::new(),
                benchmark_node_count: None,
                benchmark_modified_node_ids: Vec::new(),
            }],
            color_library: Vec::new(),
        };

        let mobile = document.insert_node(
            "Mobile app",
            NodeKind::Frame,
            None,
            [80.0, 80.0, 390.0, 760.0],
            [0.96, 0.97, 0.99, 1.0],
        );
        document.insert_node(
            "Navigation",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 108.0, 342.0, 64.0],
            [0.10, 0.12, 0.16, 1.0],
        );
        document.insert_node(
            "Hero",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 196.0, 342.0, 180.0],
            [0.23, 0.36, 0.78, 1.0],
        );
        document.insert_node(
            "Primary action",
            NodeKind::Rectangle,
            Some(mobile),
            [124.0, 286.0, 110.0, 42.0],
            [0.46, 0.91, 0.72, 1.0],
        );
        document.insert_node(
            "Card A",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 400.0, 160.0, 170.0],
            [0.88, 0.90, 0.94, 1.0],
        );
        document.insert_node(
            "Card B",
            NodeKind::Rectangle,
            Some(mobile),
            [286.0, 400.0, 160.0, 170.0],
            [0.88, 0.90, 0.94, 1.0],
        );

        let desktop = document.insert_node(
            "Dashboard",
            NodeKind::Frame,
            None,
            [530.0, 80.0, 820.0, 620.0],
            [0.96, 0.97, 0.99, 1.0],
        );
        document.insert_node(
            "Top bar",
            NodeKind::Rectangle,
            Some(desktop),
            [554.0, 104.0, 772.0, 58.0],
            [0.10, 0.12, 0.16, 1.0],
        );
        document.insert_node(
            "Sidebar",
            NodeKind::Rectangle,
            Some(desktop),
            [554.0, 162.0, 170.0, 514.0],
            [0.90, 0.92, 0.95, 1.0],
        );
        document.insert_node(
            "Metric A",
            NodeKind::Rectangle,
            Some(desktop),
            [748.0, 194.0, 260.0, 110.0],
            [0.23, 0.36, 0.78, 1.0],
        );
        document.insert_node(
            "Metric B",
            NodeKind::Rectangle,
            Some(desktop),
            [1030.0, 194.0, 272.0, 110.0],
            [0.46, 0.91, 0.72, 1.0],
        );
        document.insert_node(
            "Chart",
            NodeKind::Rectangle,
            Some(desktop),
            [748.0, 328.0, 554.0, 220.0],
            [0.88, 0.90, 0.94, 1.0],
        );
        for (name, description, count) in [
            (
                "1K Nodes · Baseline",
                "A lightweight grid for validating normal editor responsiveness.",
                1_000,
            ),
            (
                "10K Nodes · Large",
                "A large scene for measuring interaction and rendering headroom.",
                10_000,
            ),
            (
                "50K Nodes · Stress",
                "A stress scene for observing frame rate and memory pressure.",
                50_000,
            ),
            (
                "100K Nodes · Extreme",
                "An extreme scene for testing engine and GPU scaling limits.",
                100_000,
            ),
        ] {
            document.add_benchmark_page(name, description, count);
        }
        document
    }

    fn add_benchmark_page(&mut self, name: &str, description: &str, node_count: usize) {
        let id = self.allocate_id();
        self.pages.push(Page {
            id,
            name: name.into(),
            description: description.into(),
            nodes: Vec::new(),
            benchmark_node_count: Some(node_count),
            benchmark_modified_node_ids: Vec::new(),
        });
    }

    pub(crate) fn populate_active_benchmark(&mut self) {
        let node_count = self
            .active_page()
            .benchmark_node_count
            .filter(|_| self.active_page().nodes.is_empty());
        let Some(node_count) = node_count else {
            return;
        };
        let columns = (node_count as f32).sqrt().ceil() as usize;
        let nodes = (0..node_count)
            .map(|index| benchmark_node(Uuid::now_v7(), index, columns))
            .collect();
        self.active_page_mut().nodes = nodes;
    }

    pub(crate) fn active_page(&self) -> &Page {
        self.pages
            .iter()
            .find(|page| page.id == self.active_page_id)
            .expect("active page exists")
    }

    pub(crate) fn active_page_mut(&mut self) -> &mut Page {
        let active = self.active_page_id;
        self.pages
            .iter_mut()
            .find(|page| page.id == active)
            .expect("active page exists")
    }

    pub(crate) fn benchmark_hit_test(&self, x: f32, y: f32) -> Option<EntityId> {
        let page = self.active_page();
        let node_count = page.benchmark_node_count?;
        if page.nodes.is_empty() || x < 0.0 || y < 0.0 {
            return Some(Uuid::nil());
        }
        let columns = (node_count as f32).sqrt().ceil() as usize;
        let first_id = page.nodes[0].id;
        if let Some(node) = page
            .benchmark_modified_node_ids
            .iter()
            .rev()
            .filter_map(|id| page.nodes.iter().find(|node| node.id == *id))
            .find(|node| !node.locked && point_in_rotated_node(node, x, y))
        {
            return Some(node.id);
        }
        let column = (x / 16.0).floor() as usize;
        let row = (y / 16.0).floor() as usize;
        let index = row.saturating_mul(columns).saturating_add(column);
        let Some(node) = page.nodes.get(index) else {
            return Some(Uuid::nil());
        };
        Some(if !node.locked && point_in_rotated_node(node, x, y) {
            node.id
        } else {
            Uuid::nil()
        })
    }

    pub(crate) fn mark_benchmark_node_modified(&mut self, node_id: EntityId) {
        let page = self.active_page_mut();
        if page.benchmark_node_count.is_some()
            && !page.benchmark_modified_node_ids.contains(&node_id)
        {
            page.benchmark_modified_node_ids.push(node_id);
        }
    }

    pub(crate) fn active_node(&self, node_id: EntityId) -> Option<&Node> {
        let page = self.active_page();
        page.nodes.iter().find(|node| node.id == node_id)
    }

    pub(crate) fn active_node_mut(&mut self, node_id: EntityId) -> Option<&mut Node> {
        let page = self.active_page_mut();
        page.nodes.iter_mut().find(|node| node.id == node_id)
    }

    pub(crate) fn allocate_id(&mut self) -> EntityId {
        Uuid::now_v7()
    }

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
            corner_radius: 0.0,
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
            _ => self.insert_node(
                "Rectangle",
                kind,
                None,
                [160.0 + offset, 160.0 + offset, 160.0, 100.0],
                [0.46, 0.91, 0.72, 1.0],
            ),
        }
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

    pub(crate) fn add_page(&mut self, name: String) -> EntityId {
        let id = self.allocate_id();
        self.pages.push(Page {
            id,
            name,
            description: String::new(),
            nodes: Vec::new(),
            benchmark_node_count: None,
            benchmark_modified_node_ids: Vec::new(),
        });
        self.active_page_id = id;
        id
    }

    pub(crate) fn add_document_color(&mut self, name: String, value: String) -> EntityId {
        if let Some(existing) = self.color_library.iter().find(|color| color.value == value) {
            return existing.id;
        }
        let id = self.allocate_id();
        self.color_library.push(ColorAsset {
            id,
            name: if name.trim().is_empty() {
                value.clone()
            } else {
                name.trim().to_owned()
            },
            value,
        });
        id
    }

    pub(crate) fn set_active_page(&mut self, page_id: EntityId) -> bool {
        if self.pages.iter().any(|page| page.id == page_id) {
            self.active_page_id = page_id;
            self.populate_active_benchmark();
            true
        } else {
            false
        }
    }

    pub(crate) fn delete_node(&mut self, node_id: EntityId) -> bool {
        let page = self.active_page_mut();
        if page
            .nodes
            .iter()
            .any(|node| node.id == node_id && node.locked)
        {
            return false;
        }
        let before = page.nodes.len();
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

    pub(crate) fn read_model(&self) -> DocumentReadModel<'_> {
        DocumentReadModel {
            schema_version: self.schema_version,
            active_page_id: self.active_page_id,
            pages: self
                .pages
                .iter()
                .map(|page| PageSummary {
                    id: page.id,
                    name: &page.name,
                    description: &page.description,
                })
                .collect(),
            nodes: &self.active_page().nodes,
            document_colors: &self.color_library,
        }
    }

    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(format!(
                "Unsupported schema version {}",
                self.schema_version
            ));
        }
        if self.pages.is_empty() {
            return Err("Document must contain at least one page".into());
        }
        if !self.pages.iter().any(|page| page.id == self.active_page_id) {
            return Err("Active page does not exist".into());
        }
        let mut owned_ids = HashSet::new();
        for page in &self.pages {
            if !owned_ids.insert(page.id) {
                return Err(format!("Duplicate page or object ID {}", page.id));
            }
            let nodes_by_id: HashMap<_, _> =
                page.nodes.iter().map(|node| (node.id, node)).collect();
            if nodes_by_id.len() != page.nodes.len() {
                return Err(format!("Page {} contains duplicate node IDs", page.id));
            }
            for node in &page.nodes {
                if !owned_ids.insert(node.id) {
                    return Err(format!("Node {} belongs to more than one page", node.id));
                }
                if let Some(parent_id) = node.parent_id {
                    let Some(parent) = nodes_by_id.get(&parent_id) else {
                        return Err(format!(
                            "Node {} has a parent outside page {}",
                            node.id, page.id
                        ));
                    };
                    if !matches!(parent.kind, NodeKind::Frame | NodeKind::Group) {
                        return Err(format!(
                            "Node {} has non-container parent {}",
                            node.id, parent_id
                        ));
                    }
                }

                let mut ancestors = HashSet::new();
                let mut ancestor_id = node.parent_id;
                while let Some(id) = ancestor_id {
                    if id == node.id || !ancestors.insert(id) {
                        return Err(format!("Node {} is part of a parent cycle", node.id));
                    }
                    ancestor_id = nodes_by_id.get(&id).and_then(|ancestor| ancestor.parent_id);
                }
            }
        }
        for color in &self.color_library {
            if !owned_ids.insert(color.id) {
                return Err(format!("Duplicate page or object ID {}", color.id));
            }
        }
        Ok(())
    }
}

fn benchmark_node(id: EntityId, index: usize, columns: usize) -> Node {
    let column = index % columns;
    let row = index / columns;
    Node {
        id,
        name: format!("Node {}", index + 1),
        kind: NodeKind::Rectangle,
        parent_id: None,
        x: column as f32 * 16.0,
        y: row as f32 * 16.0,
        width: 12.0,
        height: 12.0,
        fill: [0.23, 0.36, 0.78, 1.0],
        stroke: [0.0; 4],
        stroke_width: 0.0,
        corner_radius: 0.0,
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
        guide_color: [0.0; 4],
        guide_opacity: default_guide_opacity(),
        locked: false,
    }
}
