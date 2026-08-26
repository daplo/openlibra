use crate::geometry::point_in_rotated_node;
use crate::*;
use uuid::Uuid;
impl Document {
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

    pub(crate) fn add_benchmark_page(&mut self, name: &str, description: &str, node_count: usize) {
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

    pub(crate) fn benchmark_hit_test(&self, x: f32, y: f32) -> Option<EntityId> {
        let page = self.active_page();
        let node_count = page.benchmark_node_count?;
        if page.nodes.is_empty() || x < 0.0 || y < 0.0 {
            return Some(Uuid::nil());
        }
        let columns = (node_count as f32).sqrt().ceil() as usize;
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
        guide_color: [0.0; 4],
        guide_opacity: default_guide_opacity(),
        locked: false,
        text: None,
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
    }
}
