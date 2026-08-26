use super::assets::clean_asset_name;
use crate::*;
use std::collections::HashSet;
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
                        node.x - source.x,
                        node.y - source.y,
                    ))
                })
                .collect();
            for (root_id, variant_id, dx, dy) in instance_roots {
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
                    clone.id = uuid::Uuid::now_v7();
                    clone.parent_id = source
                        .parent_id
                        .and_then(|parent| instance_by_slot.get(&parent).copied());
                    clone.x = source.x + dx;
                    clone.y = source.y + dy;
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
                    node.x = source.x + dx;
                    node.y = source.y + dy;
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

    fn descendant_ids_including(&self, root_id: EntityId) -> HashSet<EntityId> {
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
}
