use crate::geometry::{point_in_rotated_node, rotate_around, transform_between};
use crate::*;
use std::collections::{HashMap, HashSet};

impl Document {
    pub(crate) fn duplicate_nodes(&mut self, root_ids: &[EntityId]) -> Vec<EntityId> {
        let selected: HashSet<_> = root_ids.iter().copied().collect();
        let roots: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| selected.contains(&node.id) && !node.locked)
            .cloned()
            .collect();
        if roots.is_empty() {
            return Vec::new();
        }
        let mut source_ids = HashSet::new();
        for root in &roots {
            source_ids.extend(self.descendant_ids_including(root.id));
        }
        let sources: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| source_ids.contains(&node.id))
            .cloned()
            .collect();
        let id_map: std::collections::HashMap<_, _> = sources
            .iter()
            .map(|node| (node.id, self.allocate_id()))
            .collect();
        let new_root_ids = roots.iter().map(|root| id_map[&root.id]).collect();
        let clones = sources.into_iter().map(|mut node| {
            let source_id = node.id;
            node.id = id_map[&source_id];
            node.name = if selected.contains(&source_id) {
                format!("{} copy", node.name)
            } else {
                node.name
            };
            node.parent_id = node
                .parent_id
                .map(|parent| id_map.get(&parent).copied().unwrap_or(parent));
            node.instance_root_id = node
                .instance_root_id
                .map(|root| id_map.get(&root).copied().unwrap_or(root));
            node.x += 16.0;
            node.y += 16.0;
            node
        });
        self.active_page_mut().nodes.extend(clones);
        new_root_ids
    }

    pub(crate) fn sync_component_instances(&mut self) {
        let source_by_slot: std::collections::HashMap<_, _> = self
            .pages
            .iter()
            .flat_map(|page| &page.nodes)
            .filter(|node| node.instance_root_id.is_none())
            .filter_map(|node| node.component_slot_id.map(|slot| (slot, node.clone())))
            .collect();
        let variant_sources: std::collections::HashMap<_, Vec<Node>> = self
            .components
            .iter()
            .flat_map(|component| &component.variants)
            .filter_map(|variant| {
                let page = self.pages.iter().find(|page| {
                    page.nodes
                        .iter()
                        .any(|node| node.id == variant.source_root_id)
                })?;
                let mut ids = HashSet::from([variant.source_root_id]);
                loop {
                    let before = ids.len();
                    for node in &page.nodes {
                        if node.parent_id.is_some_and(|parent| ids.contains(&parent)) {
                            ids.insert(node.id);
                        }
                    }
                    if ids.len() == before {
                        break;
                    }
                }
                Some((
                    variant.id,
                    page.nodes
                        .iter()
                        .filter(|node| ids.contains(&node.id))
                        .cloned()
                        .collect(),
                ))
            })
            .collect();
        for page in &mut self.pages {
            if !page
                .nodes
                .iter()
                .any(|node| node.instance_root_id.is_some())
            {
                continue;
            }
            let instance_roots: Vec<_> = page
                .nodes
                .iter()
                .filter(|node| node.instance_root_id == Some(node.id))
                .filter_map(|node| {
                    let source = source_by_slot.get(&node.component_slot_id?)?;
                    Some((
                        node.id,
                        node.component_variant_id?,
                        node.clone(),
                        source.clone(),
                    ))
                })
                .collect();
            for (root_id, variant_id, mut instance_frame, source_root) in instance_roots {
                instance_frame.width = source_root.width;
                instance_frame.height = source_root.height;
                let Some(sources) = variant_sources.get(&variant_id) else {
                    continue;
                };
                let desired_slots: HashSet<_> = sources.iter().map(|node| node.id).collect();
                page.nodes.retain(|node| {
                    node.instance_root_id != Some(root_id)
                        || node
                            .component_slot_id
                            .is_some_and(|slot| desired_slots.contains(&slot))
                });
                let mut instance_by_slot: std::collections::HashMap<_, _> = page
                    .nodes
                    .iter()
                    .filter(|node| node.instance_root_id == Some(root_id))
                    .filter_map(|node| node.component_slot_id.map(|slot| (slot, node.id)))
                    .collect();
                for source in sources {
                    if instance_by_slot.contains_key(&source.id) {
                        continue;
                    }
                    let mut clone = source.clone();
                    // The same source slot in the same instance has a stable identity on replay.
                    clone.id = uuid::Uuid::new_v5(&root_id, source.id.as_bytes());
                    clone.parent_id = source
                        .parent_id
                        .and_then(|parent| instance_by_slot.get(&parent).copied());
                    transform_between(&mut clone, &source_root, &instance_frame);
                    clone.component_id = None;
                    clone.component_variant_id = None;
                    clone.component_slot_id = Some(source.id);
                    clone.instance_root_id = Some(root_id);
                    clone.text_override = false;
                    clone.asset_override = false;
                    instance_by_slot.insert(source.id, clone.id);
                    page.nodes.push(clone);
                }
                for node in &mut page.nodes {
                    if node.instance_root_id != Some(root_id) {
                        continue;
                    }
                    let Some(source) = node
                        .component_slot_id
                        .and_then(|slot| source_by_slot.get(&slot))
                    else {
                        continue;
                    };
                    let text = node.text.clone();
                    let asset_id = node.asset_id;
                    let text_override = node.text_override;
                    let asset_override = node.asset_override;
                    node.name = source.name.clone();
                    node.width = source.width;
                    node.height = source.height;
                    let mut resolved = source.clone();
                    transform_between(&mut resolved, &source_root, &instance_frame);
                    node.x = resolved.x;
                    node.y = resolved.y;
                    node.rotation = resolved.rotation;
                    node.flip_x = resolved.flip_x;
                    node.flip_y = resolved.flip_y;
                    node.opacity = source.opacity;
                    node.shadows = source.shadows.clone();
                    node.stroke_align = source.stroke_align;
                    node.stroke_join = source.stroke_join;
                    node.fill = source.fill;
                    node.stroke = source.stroke;
                    node.stroke_width = source.stroke_width;
                    node.corner_radii = source.corner_radii;
                    node.layout_mode = source.layout_mode;
                    node.layout_align = source.layout_align;
                    node.layout_justify = source.layout_justify;
                    node.layout_gap = source.layout_gap;
                    node.layout_padding = source.layout_padding;
                    if text_override {
                        let overridden_content = text.as_ref().map(|value| value.content.clone());
                        node.text = source.text.clone();
                        if let (Some(text), Some(content)) = (&mut node.text, overridden_content) {
                            text.content = content;
                        }
                    } else {
                        node.text = source.text.clone();
                    }
                    node.asset_id = if asset_override {
                        asset_id
                    } else {
                        source.asset_id
                    };
                }
            }
        }
    }

    pub(crate) fn create_component(&mut self, root_id: EntityId, name: String) -> Option<EntityId> {
        let root = self.active_node(root_id)?;
        if root.locked || root.component_id.is_some() || root.instance_root_id.is_some() {
            return None;
        }
        let component_id = self.allocate_id();
        let variant_id = self.allocate_id();
        self.components.push(ComponentDefinition {
            id: component_id,
            name: clean_asset_name(name, "Component"),
            variants: vec![ComponentVariant {
                id: variant_id,
                name: "Default".into(),
                source_root_id: root_id,
            }],
        });
        let slots = self.descendant_ids_including(root_id);
        for node in &mut self.active_page_mut().nodes {
            if slots.contains(&node.id) {
                node.component_slot_id = Some(node.id);
                if node.id == root_id {
                    node.component_id = Some(component_id);
                    node.component_variant_id = Some(variant_id);
                }
            }
        }
        Some(component_id)
    }

    pub(crate) fn add_component_variant(
        &mut self,
        component_id: EntityId,
        root_id: EntityId,
        name: String,
    ) -> Option<EntityId> {
        let root = self.active_node(root_id)?;
        if root.locked || root.component_id.is_some() || root.instance_root_id.is_some() {
            return None;
        }
        let variant_id = self.allocate_id();
        let component = self
            .components
            .iter_mut()
            .find(|item| item.id == component_id)?;
        component.variants.push(ComponentVariant {
            id: variant_id,
            name: clean_asset_name(name, "Variant"),
            source_root_id: root_id,
        });
        let slots = self.descendant_ids_including(root_id);
        for node in &mut self.active_page_mut().nodes {
            if slots.contains(&node.id) {
                node.component_slot_id = Some(node.id);
                if node.id == root_id {
                    node.component_id = Some(component_id);
                    node.component_variant_id = Some(variant_id);
                }
            }
        }
        Some(variant_id)
    }

    pub(crate) fn duplicate_component_variant(
        &mut self,
        component_id: EntityId,
        source_variant_id: EntityId,
        name: String,
    ) -> Option<EntityId> {
        let source_root_id = self
            .components
            .iter()
            .find(|component| component.id == component_id)?
            .variants
            .iter()
            .find(|variant| variant.id == source_variant_id)?
            .source_root_id;
        let source_root = self.active_node(source_root_id)?.clone();
        let source_ids = self.descendant_ids_including(source_root_id);
        let sources: Vec<Node> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| source_ids.contains(&node.id))
            .cloned()
            .collect();
        let new_root_id = self.allocate_id();
        let variant_id = self.allocate_id();
        let mut id_map = std::collections::HashMap::from([(source_root_id, new_root_id)]);
        for source in &sources {
            if source.id != source_root_id {
                id_map.insert(source.id, self.allocate_id());
            }
        }
        let dx = source_root.width + 48.0;
        let clones = sources
            .into_iter()
            .map(|mut node| {
                let source_id = node.id;
                node.id = id_map[&source_id];
                node.parent_id = if source_id == source_root_id {
                    source_root.parent_id
                } else {
                    node.parent_id.and_then(|id| id_map.get(&id).copied())
                };
                node.x += dx;
                node.component_slot_id = Some(node.id);
                node.instance_root_id = None;
                node.text_override = false;
                node.asset_override = false;
                if source_id == source_root_id {
                    node.name = name.clone();
                    node.component_id = Some(component_id);
                    node.component_variant_id = Some(variant_id);
                } else {
                    node.component_id = None;
                    node.component_variant_id = None;
                }
                node
            })
            .collect::<Vec<_>>();
        self.active_page_mut().nodes.extend(clones);
        self.components
            .iter_mut()
            .find(|component| component.id == component_id)?
            .variants
            .push(ComponentVariant {
                id: variant_id,
                name: clean_asset_name(name, "Variant"),
                source_root_id: new_root_id,
            });
        Some(new_root_id)
    }

    pub(crate) fn create_component_instance(
        &mut self,
        component_id: EntityId,
        variant_id: EntityId,
        parent_id: Option<EntityId>,
    ) -> Option<EntityId> {
        let source_root_id = self
            .components
            .iter()
            .find(|item| item.id == component_id)?
            .variants
            .iter()
            .find(|item| item.id == variant_id)?
            .source_root_id;
        self.active_node(source_root_id)?;
        let ids = self.descendant_ids_including(source_root_id);
        let sources: Vec<Node> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| ids.contains(&node.id))
            .cloned()
            .collect();
        let instance_root_id = self.allocate_id();
        let mut id_map = std::collections::HashMap::new();
        id_map.insert(source_root_id, instance_root_id);
        for source in &sources {
            if source.id != source_root_id {
                id_map.insert(source.id, self.allocate_id());
            }
        }
        let dx = 40.0;
        let dy = 40.0;
        let clones = sources
            .into_iter()
            .map(|mut node| {
                let source_id = node.id;
                node.id = id_map[&source_id];
                node.parent_id = if source_id == source_root_id {
                    parent_id
                } else {
                    node.parent_id.and_then(|id| id_map.get(&id).copied())
                };
                node.x += dx;
                node.y += dy;
                node.component_slot_id = Some(source_id);
                node.instance_root_id = Some(instance_root_id);
                node.text_override = false;
                node.asset_override = false;
                if source_id == source_root_id {
                    node.name = format!("{} instance", node.name);
                    node.component_id = Some(component_id);
                    node.component_variant_id = Some(variant_id);
                } else {
                    node.component_id = None;
                    node.component_variant_id = None;
                }
                node
            })
            .collect::<Vec<_>>();
        self.active_page_mut().nodes.extend(clones);
        Some(instance_root_id)
    }

    pub(crate) fn set_instance_variant(
        &mut self,
        instance_id: EntityId,
        variant_id: EntityId,
    ) -> Option<EntityId> {
        let instance = self.active_node(instance_id)?.clone();
        let component_id = instance.component_id?;
        if instance.instance_root_id != Some(instance_id) || instance.locked {
            return None;
        }
        let source_root_id = self
            .components
            .iter()
            .find(|component| component.id == component_id)?
            .variants
            .iter()
            .find(|variant| variant.id == variant_id)?
            .source_root_id;
        self.active_node(source_root_id)?;
        let (x, y, parent_id) = (instance.x, instance.y, instance.parent_id);
        if !self.delete_node(instance_id) {
            return None;
        }
        let new_id = self.create_component_instance(component_id, variant_id, parent_id)?;
        let new_root = self.active_node(new_id)?.clone();
        self.move_nodes(&[new_id], x - new_root.x, y - new_root.y);
        Some(new_id)
    }

    pub(crate) fn reset_component_instance(&mut self, instance_id: EntityId) -> Option<EntityId> {
        let variant_id = self.active_node(instance_id)?.component_variant_id?;
        self.set_instance_variant(instance_id, variant_id)
    }

    pub(crate) fn swap_component_instance(
        &mut self,
        instance_id: EntityId,
        component_id: EntityId,
        variant_id: EntityId,
    ) -> Option<EntityId> {
        let instance = self.active_node(instance_id)?.clone();
        if instance.instance_root_id != Some(instance_id) || instance.locked {
            return None;
        }
        let source_root_id = self
            .components
            .iter()
            .find(|component| component.id == component_id)?
            .variants
            .iter()
            .find(|variant| variant.id == variant_id)?
            .source_root_id;
        self.active_node(source_root_id)?;
        let (x, y, parent_id) = (instance.x, instance.y, instance.parent_id);
        if !self.delete_node(instance_id) {
            return None;
        }
        let new_id = self.create_component_instance(component_id, variant_id, parent_id)?;
        let new_root = self.active_node(new_id)?.clone();
        self.move_nodes(&[new_id], x - new_root.x, y - new_root.y);
        Some(new_id)
    }

    pub(crate) fn detach_component_instance(&mut self, instance_id: EntityId) -> bool {
        if !self
            .active_node(instance_id)
            .is_some_and(|node| node.instance_root_id == Some(instance_id))
        {
            return false;
        }
        for node in &mut self.active_page_mut().nodes {
            if node.instance_root_id == Some(instance_id) {
                node.instance_root_id = None;
                node.component_id = None;
                node.component_variant_id = None;
                node.component_slot_id = None;
            }
        }
        true
    }

    pub(crate) fn descendant_ids_including(&self, root_id: EntityId) -> HashSet<EntityId> {
        let mut ids = HashSet::from([root_id]);
        loop {
            let before = ids.len();
            for node in &self.active_page().nodes {
                if node.parent_id.is_some_and(|parent| ids.contains(&parent)) {
                    ids.insert(node.id);
                }
            }
            if ids.len() == before {
                return ids;
            }
        }
    }

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
        let Some(before) = self.active_node(node_id).cloned() else {
            return false;
        };
        if before.locked {
            return false;
        }
        let mut after = before.clone();
        after.rotation = rotation.rem_euclid(360.0);
        after.flip_x = flip_x;
        after.flip_y = flip_y;
        if before == after {
            return false;
        }
        self.mark_benchmark_node_modified(node_id);
        let ids = self.descendant_ids_including(node_id);
        for node in &mut self.active_page_mut().nodes {
            if node.id == node_id {
                node.rotation = after.rotation;
                node.flip_x = after.flip_x;
                node.flip_y = after.flip_y;
            } else if ids.contains(&node.id) {
                transform_between(node, &before, &after);
            }
        }
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
        let translation = (x - node.x, y - node.y);
        node.x = x;
        node.y = y;
        node.width = width.round().max(8.0);
        node.height = height.round().max(8.0);
        let max_radius = node.width.min(node.height) / 2.0;
        node.corner_radii = node.corner_radii.map(|radius| radius.min(max_radius));
        let parent_id = node.parent_id;
        let relayout_self = node.auto_height && node.layout_mode != LayoutMode::None;
        if translation.0 != 0.0 || translation.1 != 0.0 {
            let ids = self.descendant_ids_including(node_id);
            for child in &mut self.active_page_mut().nodes {
                if child.id != node_id && ids.contains(&child.id) {
                    child.x += translation.0;
                    child.y += translation.1;
                }
            }
        }
        if relayout_self {
            self.relayout_container(node_id);
        }
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }

    pub(crate) fn add_number_variable(&mut self, name: String, value: f32) -> Option<EntityId> {
        if !value.is_finite() {
            return None;
        }
        let id = self.allocate_id();
        self.number_variables.push(NumberVariable {
            id,
            name: clean_asset_name(name, "Variable"),
            value: value.clamp(0.0, 10000.0),
        });
        Some(id)
    }

    pub(crate) fn update_number_variable(
        &mut self,
        variable_id: EntityId,
        name: String,
        value: f32,
    ) -> bool {
        if !value.is_finite() {
            return false;
        }
        let Some(variable) = self
            .number_variables
            .iter_mut()
            .find(|variable| variable.id == variable_id)
        else {
            return false;
        };
        variable.name = clean_asset_name(name, "Variable");
        variable.value = value.clamp(0.0, 10000.0);
        let value = variable.value;
        for page in &mut self.pages {
            for node in &mut page.nodes {
                if node.variable_bindings.width == Some(variable_id) {
                    node.width = value.round().max(8.0);
                }
                if node.variable_bindings.height == Some(variable_id) {
                    node.height = value.round().max(8.0);
                }
                if node.variable_bindings.gap == Some(variable_id) {
                    node.layout_gap = value.min(1000.0);
                }
                for index in 0..4 {
                    if node.variable_bindings.padding[index] == Some(variable_id) {
                        node.layout_padding[index] = value.min(1000.0);
                    }
                }
            }
        }
        self.relayout_active_token_nodes();
        true
    }

    pub(crate) fn delete_number_variable(&mut self, variable_id: EntityId) -> bool {
        let before = self.number_variables.len();
        self.number_variables
            .retain(|variable| variable.id != variable_id);
        if self.number_variables.len() == before {
            return false;
        }
        for page in &mut self.pages {
            for node in &mut page.nodes {
                if node.variable_bindings.width == Some(variable_id) {
                    node.variable_bindings.width = None;
                }
                if node.variable_bindings.height == Some(variable_id) {
                    node.variable_bindings.height = None;
                }
                if node.variable_bindings.gap == Some(variable_id) {
                    node.variable_bindings.gap = None;
                }
                for binding in &mut node.variable_bindings.padding {
                    if *binding == Some(variable_id) {
                        *binding = None;
                    }
                }
            }
        }
        true
    }

    pub(crate) fn bind_node_variable(
        &mut self,
        node_id: EntityId,
        property: &str,
        variable_id: Option<EntityId>,
    ) -> bool {
        let value = variable_id.and_then(|id| {
            self.number_variables
                .iter()
                .find(|variable| variable.id == id)
                .map(|variable| variable.value)
        });
        if variable_id.is_some() && value.is_none() {
            return false;
        }
        let parent_id = {
            let Some(node) = self.active_node_mut(node_id) else {
                return false;
            };
            if node.locked {
                return false;
            }
            match property {
                "width" => {
                    node.variable_bindings.width = variable_id;
                    if let Some(value) = value {
                        node.width = value.round().max(8.0);
                    }
                }
                "height" => {
                    node.variable_bindings.height = variable_id;
                    if let Some(value) = value {
                        node.height = value.round().max(8.0);
                    }
                }
                "gap" if matches!(node.kind, NodeKind::Frame | NodeKind::Group) => {
                    node.variable_bindings.gap = variable_id;
                    if let Some(value) = value {
                        node.layout_gap = value.min(1000.0);
                    }
                }
                "padding_top" | "padding_right" | "padding_bottom" | "padding_left"
                    if matches!(node.kind, NodeKind::Frame | NodeKind::Group) =>
                {
                    let index = match property {
                        "padding_top" => 0,
                        "padding_right" => 1,
                        "padding_bottom" => 2,
                        _ => 3,
                    };
                    node.variable_bindings.padding[index] = variable_id;
                    if let Some(value) = value {
                        node.layout_padding[index] = value.min(1000.0);
                    }
                }
                _ => return false,
            }
            node.parent_id
        };
        self.relayout_container(node_id);
        if let Some(parent_id) = parent_id {
            self.relayout_container(parent_id);
        }
        true
    }

    pub(crate) fn add_text_style(&mut self, name: String, style: TypographyStyle) -> EntityId {
        let id = self.allocate_id();
        self.text_styles.push(TextStyleAsset {
            id,
            name: clean_asset_name(name, "Text style"),
            style: normalize_typography(style),
        });
        id
    }

    pub(crate) fn update_text_style(
        &mut self,
        style_id: EntityId,
        name: String,
        style: TypographyStyle,
    ) -> bool {
        let style = normalize_typography(style);
        let Some(asset) = self
            .text_styles
            .iter_mut()
            .find(|asset| asset.id == style_id)
        else {
            return false;
        };
        asset.name = clean_asset_name(name, "Text style");
        asset.style = style.clone();
        for page in &mut self.pages {
            for node in &mut page.nodes {
                if node.text_style_id == Some(style_id)
                    && let Some(text) = &mut node.text
                {
                    style.apply_to(text);
                }
            }
        }
        true
    }

    pub(crate) fn delete_text_style(&mut self, style_id: EntityId) -> bool {
        let before = self.text_styles.len();
        self.text_styles.retain(|asset| asset.id != style_id);
        if self.text_styles.len() == before {
            return false;
        }
        for page in &mut self.pages {
            for node in &mut page.nodes {
                if node.text_style_id == Some(style_id) {
                    node.text_style_id = None;
                }
            }
        }
        true
    }

    pub(crate) fn bind_node_text_style(
        &mut self,
        node_id: EntityId,
        style_id: Option<EntityId>,
    ) -> bool {
        let style = style_id.and_then(|id| {
            self.text_styles
                .iter()
                .find(|asset| asset.id == id)
                .map(|asset| asset.style.clone())
        });
        if style_id.is_some() && style.is_none() {
            return false;
        }
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Text {
            return false;
        }
        node.text_style_id = style_id;
        if let (Some(style), Some(text)) = (style, &mut node.text) {
            style.apply_to(text);
        }
        true
    }

    fn relayout_active_token_nodes(&mut self) {
        let containers: Vec<_> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.layout_mode != LayoutMode::None)
            .map(|node| node.id)
            .collect();
        for id in containers.iter().rev().chain(containers.iter()) {
            self.relayout_container(*id);
        }
    }

    pub(crate) fn reorder_node(
        &mut self,
        dragged_id: EntityId,
        target_id: EntityId,
        before: bool,
    ) -> bool {
        if dragged_id == target_id {
            return false;
        }
        let page = self.active_page();
        let Some(dragged_index) = page.nodes.iter().position(|node| node.id == dragged_id) else {
            return false;
        };
        if page.nodes[dragged_index].locked {
            return false;
        }
        let Some(target) = page.nodes.iter().find(|node| node.id == target_id) else {
            return false;
        };
        let target_parent = target.parent_id;

        // A group cannot become its own descendant through a sibling-level drop.
        let mut ancestor = target_parent;
        while let Some(ancestor_id) = ancestor {
            if ancestor_id == dragged_id {
                return false;
            }
            ancestor = page
                .nodes
                .iter()
                .find(|node| node.id == ancestor_id)
                .and_then(|node| node.parent_id);
        }

        let page = self.active_page_mut();
        let mut dragged = page.nodes.remove(dragged_index);
        dragged.parent_id = target_parent;
        let Some(mut insertion) = page.nodes.iter().position(|node| node.id == target_id) else {
            return false;
        };
        if !before {
            insertion += 1;
        }
        page.nodes.insert(insertion, dragged);
        true
    }

    pub(crate) fn reparent_nodes_to_artboards(&mut self, node_ids: &[EntityId]) -> bool {
        let selected: HashSet<EntityId> = node_ids.iter().copied().collect();
        let artboards: Vec<Node> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| {
                node.kind == NodeKind::Frame
                    && node.parent_id.is_none()
                    && !selected.contains(&node.id)
            })
            .cloned()
            .collect();
        let changes: Vec<(EntityId, Option<EntityId>, Option<EntityId>)> = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| {
                selected.contains(&node.id) && node.kind != NodeKind::Frame && !node.locked
            })
            .filter_map(|node| {
                let center = (node.x + node.width / 2.0, node.y + node.height / 2.0);
                let target = artboards
                    .iter()
                    .rev()
                    .find(|artboard| point_in_rotated_node(artboard, center.0, center.1))
                    .map(|artboard| artboard.id);
                let mut ancestor = node.parent_id;
                let mut current_artboard = None;
                while let Some(ancestor_id) = ancestor {
                    let Some(parent) = self.active_node(ancestor_id) else {
                        break;
                    };
                    if parent.kind == NodeKind::Frame && parent.parent_id.is_none() {
                        current_artboard = Some(parent.id);
                        break;
                    }
                    ancestor = parent.parent_id;
                }
                (target != current_artboard).then_some((node.id, node.parent_id, target))
            })
            .collect();
        if changes.is_empty() {
            return false;
        }
        for (node_id, _, target) in &changes {
            if let Some(node) = self
                .active_page_mut()
                .nodes
                .iter_mut()
                .find(|node| node.id == *node_id)
            {
                node.parent_id = *target;
            }
        }
        let affected: HashSet<EntityId> = changes
            .iter()
            .flat_map(|(_, old, new)| [*old, *new])
            .flatten()
            .collect();
        for parent_id in affected {
            self.relayout_container(parent_id);
        }
        true
    }

    pub(crate) fn update_vector_parameters(
        &mut self,
        node_id: EntityId,
        count: u16,
        inner_ratio: f32,
    ) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(vector) = &mut node.vector else {
            return false;
        };
        match &mut vector.geometry {
            VectorGeometry::Polygon { sides } => *sides = count.clamp(3, 100),
            VectorGeometry::Star {
                points,
                inner_ratio: ratio,
            } => {
                *points = count.clamp(3, 100);
                *ratio = inner_ratio.clamp(0.01, 0.99);
            }
            _ => return false,
        }
        true
    }

    pub(crate) fn set_vector_fill_rule(&mut self, node_id: EntityId, rule: FillRule) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(vector) = &mut node.vector else {
            return false;
        };
        if vector.fill_rule == rule {
            return false;
        }
        vector.fill_rule = rule;
        true
    }

    pub(crate) fn convert_vector_to_path(&mut self, node_id: EntityId) -> bool {
        let Some(node) = self.active_node_mut(node_id) else {
            return false;
        };
        if node.locked || node.kind != NodeKind::Vector {
            return false;
        }
        let Some(vector) = &mut node.vector else {
            return false;
        };
        let Some(contours) = contours_for_geometry(&vector.geometry) else {
            return false;
        };
        vector.geometry = VectorGeometry::Path { contours };
        true
    }
}

fn contours_for_geometry(geometry: &VectorGeometry) -> Option<Vec<VectorContour>> {
    let points = match geometry {
        VectorGeometry::Ellipse => {
            let kappa = 0.552_284_8;
            return Some(vec![VectorContour {
                closed: true,
                points: vec![
                    vector_point(
                        [0.5, 0.0],
                        Some([0.5 - kappa / 2.0, 0.0]),
                        Some([0.5 + kappa / 2.0, 0.0]),
                    ),
                    vector_point(
                        [1.0, 0.5],
                        Some([1.0, 0.5 - kappa / 2.0]),
                        Some([1.0, 0.5 + kappa / 2.0]),
                    ),
                    vector_point(
                        [0.5, 1.0],
                        Some([0.5 + kappa / 2.0, 1.0]),
                        Some([0.5 - kappa / 2.0, 1.0]),
                    ),
                    vector_point(
                        [0.0, 0.5],
                        Some([0.0, 0.5 + kappa / 2.0]),
                        Some([0.0, 0.5 - kappa / 2.0]),
                    ),
                ],
            }]);
        }
        VectorGeometry::Line => {
            return Some(vec![VectorContour {
                closed: false,
                points: vec![
                    vector_point([0.0, 0.5], None, None),
                    vector_point([1.0, 0.5], None, None),
                ],
            }]);
        }
        VectorGeometry::Polygon { sides } => regular_shape_points(*sides as usize, 1.0),
        VectorGeometry::Star {
            points,
            inner_ratio,
        } => regular_shape_points(*points as usize * 2, *inner_ratio),
        VectorGeometry::Path { .. } => return None,
    };
    Some(vec![VectorContour {
        points,
        closed: true,
    }])
}

fn regular_shape_points(count: usize, inner_ratio: f32) -> Vec<VectorPoint> {
    (0..count)
        .map(|index| {
            let radius = if index % 2 == 1 { inner_ratio } else { 1.0 } * 0.5;
            let angle =
                -std::f32::consts::FRAC_PI_2 + index as f32 * std::f32::consts::TAU / count as f32;
            vector_point(
                [0.5 + angle.cos() * radius, 0.5 + angle.sin() * radius],
                None,
                None,
            )
        })
        .collect()
}

fn vector_point(
    position: [f32; 2],
    handle_in: Option<[f32; 2]>,
    handle_out: Option<[f32; 2]>,
) -> VectorPoint {
    VectorPoint {
        position,
        handle_in,
        handle_out,
        point_type: if handle_in.is_some() || handle_out.is_some() {
            VectorPointType::Smooth
        } else {
            VectorPointType::Corner
        },
    }
}

fn clean_asset_name(name: String, fallback: &str) -> String {
    let name: String = name.trim().chars().take(80).collect();
    if name.is_empty() {
        fallback.into()
    } else {
        name
    }
}

fn normalize_typography(mut style: TypographyStyle) -> TypographyStyle {
    style.font_family = style.font_family.trim().chars().take(120).collect();
    if style.font_family.is_empty() {
        style.font_family = "Arial".into();
    }
    style.font_weight = style.font_weight.clamp(100, 900);
    style.font_size = style.font_size.clamp(1.0, 512.0);
    style.line_height = style.line_height.clamp(0.5, 5.0);
    style.letter_spacing = style.letter_spacing.clamp(-20.0, 100.0);
    style
}
