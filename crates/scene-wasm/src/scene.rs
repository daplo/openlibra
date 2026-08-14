use crate::geometry::node_transform;
use crate::*;
use std::collections::HashMap;

impl Document {
    pub(crate) fn scene_data(&self) -> Vec<f32> {
        let mut scene = Vec::new();
        for node in ordered_nodes(self.active_page()) {
            append_node_scene(&mut scene, node);
        }
        scene
    }

    pub(crate) fn scene_data_for_view(
        &self,
        left: f32,
        top: f32,
        right: f32,
        bottom: f32,
    ) -> Vec<f32> {
        if self.active_page().benchmark_node_count.is_none() {
            return self.scene_data();
        }
        let mut scene = Vec::new();
        for node in &self.active_page().nodes {
            if node.x + node.width >= left
                && node.x <= right
                && node.y + node.height >= top
                && node.y <= bottom
            {
                append_node_scene(&mut scene, node);
            }
        }
        scene
    }
}

fn append_node_scene(scene: &mut Vec<f32>, node: &Node) {
    if matches!(
        node.kind,
        NodeKind::Text | NodeKind::Image | NodeKind::Icon | NodeKind::Vector
    ) {
        return;
    }
    let has_visible_shadow = node
        .shadows
        .iter()
        .any(|shadow| shadow.enabled && shadow.color[3] > 0.0);
    if node.kind == NodeKind::Group
        && node.fill[3] <= 0.0
        && (node.stroke_width <= 0.0 || node.stroke[3] <= 0.0)
        && !has_visible_shadow
    {
        return;
    }
    for shadow in node
        .shadows
        .iter()
        .filter(|shadow| shadow.enabled && shadow.kind == ShadowKind::Outer)
    {
        let feather = shadow.blur.max(0.5) * 2.0;
        scene.extend_from_slice(&[
            node.x + shadow.offset_x - shadow.spread - feather,
            node.y + shadow.offset_y - shadow.spread - feather,
            node.width + shadow.spread * 2.0 + feather * 2.0,
            node.height + shadow.spread * 2.0 + feather * 2.0,
        ]);
        scene.extend_from_slice(&shadow.color);
        scene.extend_from_slice(&[feather, shadow.blur.max(0.5), 0.0, 0.0]);
        scene.extend_from_slice(&[0.0, node.opacity, 1.0, 0.0]);
        scene.extend_from_slice(
            &node
                .corner_radii
                .map(|radius| (radius + shadow.spread).max(0.0)),
        );
        scene.extend_from_slice(&node_transform(node));
    }
    let expansion = match node.stroke_align {
        StrokeAlign::Inside => 0.0,
        StrokeAlign::Center => node.stroke_width / 2.0,
        StrokeAlign::Outside => node.stroke_width,
    };
    scene.extend_from_slice(&[
        node.x - expansion,
        node.y - expansion,
        node.width + expansion * 2.0,
        node.height + expansion * 2.0,
    ]);
    scene.extend_from_slice(&node.fill);
    scene.extend_from_slice(&node.stroke);
    scene.extend_from_slice(&[
        node.stroke_width,
        node.opacity,
        0.0,
        (node.stroke_join == StrokeJoin::Round) as u8 as f32,
    ]);
    scene.extend_from_slice(&node.corner_radii.map(|radius| {
        if node.stroke_join == StrokeJoin::Round {
            (radius + expansion).max(expansion)
        } else {
            radius
        }
    }));
    scene.extend_from_slice(&node_transform(node));
    for shadow in node
        .shadows
        .iter()
        .filter(|shadow| shadow.enabled && shadow.kind == ShadowKind::Inner)
    {
        scene.extend_from_slice(&[node.x, node.y, node.width, node.height]);
        scene.extend_from_slice(&shadow.color);
        scene.extend_from_slice(&[
            shadow.offset_x,
            shadow.offset_y,
            shadow.blur.max(0.5),
            shadow.spread,
        ]);
        scene.extend_from_slice(&[0.0, node.opacity, 2.0, 0.0]);
        scene.extend_from_slice(&node.corner_radii);
        scene.extend_from_slice(&node_transform(node));
    }
}

pub(crate) fn ordered_nodes(page: &Page) -> Vec<&Node> {
    fn append_children<'a>(
        children: &HashMap<Option<EntityId>, Vec<&'a Node>>,
        parent_id: Option<EntityId>,
        ordered: &mut Vec<&'a Node>,
    ) {
        for &node in children.get(&parent_id).into_iter().flatten() {
            ordered.push(node);
            append_children(children, Some(node.id), ordered);
        }
    }
    let mut children: HashMap<Option<EntityId>, Vec<&Node>> = HashMap::new();
    for node in &page.nodes {
        children.entry(node.parent_id).or_default().push(node);
    }
    let mut ordered = Vec::with_capacity(page.nodes.len());
    append_children(&children, None, &mut ordered);
    ordered
}
