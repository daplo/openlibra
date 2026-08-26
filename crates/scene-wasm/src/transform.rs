use crate::geometry::rotate_around;
use crate::*;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;
impl Document {
    pub(crate) fn group_nodes(&mut self, node_ids: &[EntityId]) -> Option<EntityId> {
        let unique: HashSet<EntityId> = node_ids.iter().copied().collect();
        if unique.len() < 2 {
            return None;
        }

        let selected: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| unique.contains(&node.id))
            .cloned()
            .collect();
        if selected.len() < 2 || selected.iter().any(|node| node.locked) {
            return None;
        }
        // Reject a selection where one selected node is an ancestor of
        // another: grouping them would silently flatten the ancestor's
        // subtree instead of preserving it, since their differing parents
        // fail the common-parent check below.
        let nodes_by_id: HashMap<EntityId, &Node> = self
            .active_page()
            .nodes
            .iter()
            .map(|node| (node.id, node))
            .collect();
        for node in &selected {
            let mut ancestor_id = node.parent_id;
            while let Some(id) = ancestor_id {
                if unique.contains(&id) {
                    return None;
                }
                ancestor_id = nodes_by_id.get(&id).and_then(|ancestor| ancestor.parent_id);
            }
        }
        let min_x = selected
            .iter()
            .map(|node| node.x)
            .fold(f32::INFINITY, f32::min);
        let min_y = selected
            .iter()
            .map(|node| node.y)
            .fold(f32::INFINITY, f32::min);
        let max_x = selected
            .iter()
            .map(|node| node.x + node.width)
            .fold(f32::NEG_INFINITY, f32::max);
        let max_y = selected
            .iter()
            .map(|node| node.y + node.height)
            .fold(f32::NEG_INFINITY, f32::max);
        let parent_id = selected.first().and_then(|first| {
            selected
                .iter()
                .all(|node| node.parent_id == first.parent_id)
                .then_some(first.parent_id)
                .flatten()
        });
        let group_id = self.insert_node(
            "Group",
            NodeKind::Group,
            parent_id,
            [min_x, min_y, max_x - min_x, max_y - min_y],
            [0.0; 4],
        );
        for node in &mut self.active_page_mut().nodes {
            if unique.contains(&node.id) {
                node.parent_id = Some(group_id);
            }
        }
        Some(group_id)
    }

    pub(crate) fn ungroup_nodes(&mut self, group_id: EntityId) -> bool {
        let Some(group) = self.active_node(group_id) else {
            return false;
        };
        if group.kind != NodeKind::Group
            || group.locked
            || group.component_id.is_some()
            || group.component_slot_id.is_some()
            || group.instance_root_id.is_some()
        {
            return false;
        }
        let parent_id = group.parent_id;
        let page = self.active_page_mut();
        for node in &mut page.nodes {
            if node.parent_id == Some(group_id) {
                node.parent_id = parent_id;
            }
        }
        page.nodes.retain(|node| node.id != group_id);
        true
    }

    pub(crate) fn move_nodes(&mut self, node_ids: &[EntityId], dx: f32, dy: f32) -> bool {
        let can_use_benchmark_fast_path = self.active_page().benchmark_node_count.is_some()
            && node_ids.iter().all(|id| {
                self.active_node(*id)
                    .is_some_and(|node| node.kind != NodeKind::Group)
            });
        if can_use_benchmark_fast_path {
            let page = self.active_page_mut();
            let indices: Vec<_> = node_ids
                .iter()
                .filter_map(|id| page.nodes.iter().position(|node| node.id == *id))
                .collect();
            if indices.len() != node_ids.len()
                || indices
                    .iter()
                    .any(|&index| page.nodes.get(index).is_none_or(|node| node.locked))
            {
                return false;
            }
            for index in indices {
                page.nodes[index].x += dx;
                page.nodes[index].y += dy;
            }
            for &node_id in node_ids {
                if !page.benchmark_modified_node_ids.contains(&node_id) {
                    page.benchmark_modified_node_ids.push(node_id);
                }
            }
            return !node_ids.is_empty();
        }
        let roots: HashSet<EntityId> = node_ids.iter().copied().collect();
        if roots.is_empty() {
            return false;
        }
        let nodes = &self.active_page().nodes;
        if nodes
            .iter()
            .any(|node| roots.contains(&node.id) && node.locked)
        {
            return false;
        }
        let mut moving = roots.clone();
        loop {
            let before = moving.len();
            for node in nodes {
                if node
                    .parent_id
                    .is_some_and(|parent| moving.contains(&parent))
                {
                    moving.insert(node.id);
                }
            }
            if moving.len() == before {
                break;
            }
        }
        let mut changed = false;
        for node in &mut self.active_page_mut().nodes {
            if moving.contains(&node.id) {
                node.x += dx;
                node.y += dy;
                changed = true;
            }
        }
        if self.active_page().benchmark_node_count.is_some() {
            for node_id in moving {
                self.mark_benchmark_node_modified(node_id);
            }
        }
        changed
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn set_node_style(
        &mut self,
        node_id: EntityId,
        fill: [f32; 4],
        stroke: [f32; 4],
        stroke_width: f32,
        corner_radii: [f32; 4],
        stroke_align: StrokeAlign,
        stroke_join: StrokeJoin,
    ) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked {
            return false;
        }
        node.fill = fill;
        node.stroke = stroke;
        node.stroke_width = stroke_width.clamp(0.0, 100.0);
        let max_radius = node.width.min(node.height) / 2.0;
        node.corner_radii = corner_radii.map(|radius| radius.clamp(0.0, max_radius));
        node.stroke_align = stroke_align;
        node.stroke_join = stroke_join;
        true
    }

    pub(crate) fn set_node_text(&mut self, node_id: EntityId, mut text: TextStyle) -> bool {
        let linked_style = self
            .active_node(node_id)
            .and_then(|node| node.text_style_id)
            .and_then(|style_id| self.text_styles.iter().find(|style| style.id == style_id))
            .map(|asset| asset.style.clone());
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Text {
            return false;
        }
        text.font_family = text.font_family.trim().chars().take(120).collect();
        if text.font_family.is_empty() {
            text.font_family = "Inter".into();
        }
        text.font_weight = text.font_weight.clamp(100, 900);
        text.font_size = text.font_size.clamp(1.0, 512.0);
        text.line_height = text.line_height.clamp(0.5, 5.0);
        text.letter_spacing = text.letter_spacing.clamp(-20.0, 100.0);
        if let Some(style) = linked_style {
            style.apply_to(&mut text);
        }
        if node.text.as_ref() == Some(&text) {
            return false;
        }
        node.text = Some(text);
        if node.instance_root_id.is_some() {
            node.text_override = true;
        }
        true
    }

    pub(crate) fn set_node_image_fit(&mut self, node_id: EntityId, fit: ImageFit) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Image || node.image_fit == fit {
            return false;
        }
        node.image_fit = fit;
        true
    }

    pub(crate) fn set_node_asset(&mut self, node_id: EntityId, asset_id: EntityId) -> bool {
        let Some(asset) = self
            .media_assets
            .iter()
            .find(|asset| asset.id == asset_id)
            .cloned()
        else {
            return false;
        };
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        let compatible = matches!(
            (node.kind, asset.kind),
            (NodeKind::Image, MediaAssetKind::Image) | (NodeKind::Icon, MediaAssetKind::Icon)
        );
        if node.locked || !compatible || node.asset_id == Some(asset_id) {
            return false;
        }
        node.asset_id = Some(asset_id);
        if node.instance_root_id.is_some() {
            node.asset_override = true;
        }
        true
    }

    pub(crate) fn resize_node(
        &mut self,
        node_id: EntityId,
        handle: &str,
        dx: f32,
        dy: f32,
    ) -> bool {
        self.mark_benchmark_node_modified(node_id);
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked {
            return false;
        }
        let min_size = 8.0;
        let old_center = (node.x + node.width / 2.0, node.y + node.height / 2.0);
        let old_right = node.x + node.width;
        let old_bottom = node.y + node.height;
        let fixed_before_local = (
            if handle.contains('w') {
                old_right
            } else if handle.contains('e') {
                node.x
            } else {
                old_center.0
            },
            if handle.contains('n') {
                old_bottom
            } else if handle.contains('s') {
                node.y
            } else {
                old_center.1
            },
        );
        let fixed_before =
            rotate_around(fixed_before_local, old_center, node.rotation.to_radians());
        if handle.contains('w') {
            node.x = (node.x + dx).min(old_right - min_size);
            node.width = old_right - node.x;
        }
        if handle.contains('e') {
            node.width = (node.width + dx).max(min_size);
        }
        if handle.contains('n') {
            node.y = (node.y + dy).min(old_bottom - min_size);
            node.height = old_bottom - node.y;
        }
        if handle.contains('s') {
            node.height = (node.height + dy).max(min_size);
        }
        if handle.contains('w') || handle.contains('e') {
            node.width = node.width.round().max(min_size);
            if handle.contains('w') {
                node.x = old_right - node.width;
            }
        }
        if handle.contains('n') || handle.contains('s') {
            node.height = node.height.round().max(min_size);
            if handle.contains('n') {
                node.y = old_bottom - node.height;
            }
        }
        let new_center = (node.x + node.width / 2.0, node.y + node.height / 2.0);
        let fixed_after_local = (
            if handle.contains('w') {
                node.x + node.width
            } else if handle.contains('e') {
                node.x
            } else {
                new_center.0
            },
            if handle.contains('n') {
                node.y + node.height
            } else if handle.contains('s') {
                node.y
            } else {
                new_center.1
            },
        );
        let fixed_after = rotate_around(fixed_after_local, new_center, node.rotation.to_radians());
        node.x += fixed_before.0 - fixed_after.0;
        node.y += fixed_before.1 - fixed_after.1;
        let max_radius = node.width.min(node.height) / 2.0;
        node.corner_radii = node.corner_radii.map(|radius| radius.min(max_radius));
        let parent_id = node.parent_id;
        let relayout_self = node.auto_height && node.layout_mode != LayoutMode::None;
        if relayout_self {
            self.relayout_container(node_id);
        }
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }

    pub(crate) fn set_node_locked(&mut self, node_id: EntityId, locked: bool) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        node.locked = locked;
        true
    }

    pub(crate) fn set_node_opacity(&mut self, node_id: EntityId, opacity: f32) -> bool {
        if !opacity.is_finite() {
            return false;
        }
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked {
            return false;
        }
        node.opacity = opacity.clamp(0.0, 1.0);
        true
    }

    pub(crate) fn set_node_shadows(&mut self, node_id: EntityId, mut shadows: Vec<Shadow>) -> bool {
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked || shadows.len() > 16 {
            return false;
        }
        let mut shadow_ids = HashSet::new();
        for shadow in &mut shadows {
            if !shadow.offset_x.is_finite()
                || !shadow.offset_y.is_finite()
                || !shadow.blur.is_finite()
                || !shadow.spread.is_finite()
                || shadow.color.iter().any(|value| !value.is_finite())
            {
                return false;
            }
            shadow.offset_x = shadow.offset_x.clamp(-1000.0, 1000.0);
            shadow.offset_y = shadow.offset_y.clamp(-1000.0, 1000.0);
            shadow.blur = shadow.blur.clamp(0.0, 500.0);
            shadow.spread = shadow.spread.clamp(-500.0, 500.0);
            for channel in &mut shadow.color {
                *channel = channel.clamp(0.0, 1.0);
            }
            if shadow.id.is_nil() || !shadow_ids.insert(shadow.id) {
                shadow.id = Uuid::now_v7();
                shadow_ids.insert(shadow.id);
            }
        }
        node.shadows = shadows;
        true
    }

    pub(crate) fn set_node_transform(
        &mut self,
        node_id: EntityId,
        rotation: f32,
        flip_x: bool,
        flip_y: bool,
    ) -> bool {
        if !rotation.is_finite() {
            return false;
        }
        self.mark_benchmark_node_modified(node_id);
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked {
            return false;
        }
        node.rotation = rotation.rem_euclid(360.0);
        node.flip_x = flip_x;
        node.flip_y = flip_y;
        true
    }

    pub(crate) fn set_node_layout(
        &mut self,
        node_id: EntityId,
        mode: LayoutMode,
        align: LayoutAlign,
        justify: LayoutAlign,
        gap: f32,
        padding: [f32; 4],
    ) -> bool {
        if !gap.is_finite() || padding.iter().any(|value| !value.is_finite()) {
            return false;
        }
        let Some(container) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if container.locked || !matches!(container.kind, NodeKind::Frame | NodeKind::Group) {
            return false;
        }
        if (container.layout_gap - gap).abs() > f32::EPSILON {
            container.variable_bindings.gap = None;
        }
        for (index, value) in padding.iter().enumerate() {
            if (container.layout_padding[index] - value).abs() > f32::EPSILON {
                container.variable_bindings.padding[index] = None;
            }
        }
        container.layout_mode = mode;
        container.layout_align = align;
        container.layout_justify = justify;
        container.layout_gap = gap.clamp(0.0, 1000.0);
        container.layout_padding = padding.map(|value| value.clamp(0.0, 1000.0));
        self.relayout_container(node_id);
        true
    }

    pub(crate) fn set_node_width_sizing(
        &mut self,
        node_id: EntityId,
        sizing: LayoutSizing,
    ) -> bool {
        let parent_id = {
            let Some(node) = self
                .active_page_mut()
                .nodes
                .iter_mut()
                .find(|node| node.id == node_id)
            else {
                return false;
            };
            if node.locked {
                return false;
            }
            node.width_sizing = sizing;
            node.parent_id
        };
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }

    pub(crate) fn set_node_auto_height(&mut self, node_id: EntityId, auto_height: bool) -> bool {
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked
            || !matches!(node.kind, NodeKind::Frame | NodeKind::Group)
            || node.layout_mode == LayoutMode::None
        {
            return false;
        }
        node.auto_height = auto_height;
        self.relayout_container(node_id);
        true
    }

    pub(crate) fn set_artboard_guide(
        &mut self,
        node_id: EntityId,
        mode: GuideMode,
        count: u32,
        gap: f32,
        color: [f32; 4],
        opacity: f32,
    ) -> bool {
        if !gap.is_finite() || !opacity.is_finite() {
            return false;
        }
        let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Frame {
            return false;
        }
        node.guide_mode = mode;
        node.guide_count = count.clamp(1, 64);
        node.guide_gap = gap.clamp(1.0, 1000.0);
        node.guide_color = color;
        node.guide_opacity = opacity.clamp(0.0, 1.0);
        true
    }

    pub(crate) fn align_nodes(&mut self, node_ids: &[EntityId], alignment: &str) -> bool {
        let ids: HashSet<EntityId> = node_ids.iter().copied().collect();
        let selected: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| ids.contains(&node.id) && !node.locked)
            .cloned()
            .collect();
        if selected.len() < 2 {
            return false;
        }
        let min_x = selected
            .iter()
            .map(|node| node.x)
            .fold(f32::INFINITY, f32::min);
        let min_y = selected
            .iter()
            .map(|node| node.y)
            .fold(f32::INFINITY, f32::min);
        let max_x = selected
            .iter()
            .map(|node| node.x + node.width)
            .fold(f32::NEG_INFINITY, f32::max);
        let max_y = selected
            .iter()
            .map(|node| node.y + node.height)
            .fold(f32::NEG_INFINITY, f32::max);
        for node in &mut self.active_page_mut().nodes {
            if !ids.contains(&node.id) || node.locked {
                continue;
            }
            match alignment {
                "left" => node.x = min_x,
                "center-x" => node.x = (min_x + max_x - node.width) / 2.0,
                "right" => node.x = max_x - node.width,
                "top" => node.y = min_y,
                "center-y" => node.y = (min_y + max_y - node.height) / 2.0,
                "bottom" => node.y = max_y - node.height,
                _ => return false,
            }
        }
        true
    }

    pub(crate) fn set_node_bounds(
        &mut self,
        node_id: EntityId,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    ) -> bool {
        if ![x, y, width, height].iter().all(|value| value.is_finite()) {
            return false;
        }
        self.mark_benchmark_node_modified(node_id);
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked {
            return false;
        }
        if (node.width - width.round().max(8.0)).abs() > f32::EPSILON {
            node.variable_bindings.width = None;
        }
        if (node.height - height.round().max(8.0)).abs() > f32::EPSILON {
            node.variable_bindings.height = None;
        }
        node.x = x;
        node.y = y;
        node.width = width.round().max(8.0);
        node.height = height.round().max(8.0);
        let max_radius = node.width.min(node.height) / 2.0;
        node.corner_radii = node.corner_radii.map(|radius| radius.min(max_radius));
        let parent_id = node.parent_id;
        let relayout_self = node.auto_height && node.layout_mode != LayoutMode::None;
        if relayout_self {
            self.relayout_container(node_id);
        }
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }
}
