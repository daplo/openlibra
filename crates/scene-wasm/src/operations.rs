use crate::operation_patch::{self, Change};
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub(crate) const OPERATION_VERSION: u32 = 1;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Envelope {
    pub version: u32,
    pub document_id: EntityId,
    pub operation_id: EntityId,
    pub actor_id: EntityId,
    pub sequence: u64,
    pub base_revision: u64,
    pub transaction_id: EntityId,
    pub command: Command,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct Properties {
    pub name: Option<String>,
    pub locked: Option<bool>,
    pub opacity: Option<f32>,
    pub fill: Option<[f32; 4]>,
    pub stroke: Option<[f32; 4]>,
    pub stroke_width: Option<f32>,
    pub corner_radii: Option<[f32; 4]>,
    pub stroke_align: Option<StrokeAlign>,
    pub stroke_join: Option<StrokeJoin>,
    pub text: Option<TextStyle>,
    pub shadows: Option<Vec<Shadow>>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum Command {
    CreateNode {
        page_id: EntityId,
        node: Box<Node>,
        before_id: Option<EntityId>,
    },
    DeleteNode {
        page_id: EntityId,
        node_id: EntityId,
    },
    MoveNodes {
        page_id: EntityId,
        node_ids: Vec<EntityId>,
        dx: f32,
        dy: f32,
    },
    SetBounds {
        page_id: EntityId,
        node_id: EntityId,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    },
    ResizeNode {
        page_id: EntityId,
        node_id: EntityId,
        handle: String,
        dx: f32,
        dy: f32,
    },
    SetTransform {
        page_id: EntityId,
        node_id: EntityId,
        rotation: f32,
        flip_x: bool,
        flip_y: bool,
    },
    SetProperties {
        page_id: EntityId,
        node_id: EntityId,
        properties: Box<Properties>,
    },
    ReparentNode {
        page_id: EntityId,
        node_id: EntityId,
        parent_id: Option<EntityId>,
        before_id: Option<EntityId>,
    },
    ReorderNode {
        page_id: EntityId,
        node_id: EntityId,
        target_id: EntityId,
        before: bool,
    },
    Batch {
        commands: Vec<Command>,
    },
    Undo {
        operation_id: EntityId,
    },
    Redo {
        operation_id: EntityId,
    },
    /// Identity-addressed, compare-and-set edits covering the complete document.
    DocumentChanges {
        changes: Vec<Change>,
    },
    // Exact resolved effects for editor commands not yet ported to typed intent.
    // Accepted only from the local adapter or during validated journal replay.
    RecordedEdit {
        changes: Vec<Change>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Entry {
    pub envelope: Envelope,
    pub revision: u64,
    pub changes: Vec<Change>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Journal {
    pub version: u32,
    pub document_id: EntityId,
    pub baseline: Document,
    pub entries: Vec<Entry>,
}
#[derive(Clone)]
pub(crate) struct Session {
    pub journal: Journal,
    pub actor: EntityId,
    pub sequences: BTreeMap<EntityId, u64>,
    pub undo: BTreeMap<EntityId, Vec<EntityId>>,
    pub redo: BTreeMap<EntityId, Vec<EntityId>>,
}
#[derive(Serialize, Debug)]
pub(crate) struct Receipt {
    pub status: &'static str,
    pub revision: u64,
    pub operation_id: EntityId,
}
impl Session {
    pub fn new(document: &Document, actor: EntityId) -> Self {
        Self {
            journal: Journal {
                version: OPERATION_VERSION,
                document_id: Uuid::now_v7(),
                baseline: document.clone(),
                entries: Vec::new(),
            },
            actor,
            sequences: BTreeMap::new(),
            undo: BTreeMap::new(),
            redo: BTreeMap::new(),
        }
    }
    pub fn revision(&self) -> u64 {
        self.journal.entries.len() as u64
    }
    pub fn envelope(&self, command: Command) -> Envelope {
        Envelope {
            version: OPERATION_VERSION,
            document_id: self.journal.document_id,
            operation_id: Uuid::now_v7(),
            actor_id: self.actor,
            sequence: self.sequences.get(&self.actor).copied().unwrap_or(0) + 1,
            base_revision: self.revision(),
            transaction_id: Uuid::now_v7(),
            command,
        }
    }
    pub fn record(&mut self, before: &Document, after: &Document, command: Option<Command>) {
        let changes = operation_patch::diff(before, after);
        if changes.is_empty() {
            return;
        }
        let command = command.unwrap_or_else(|| {
            infer_create(before, after).unwrap_or(Command::RecordedEdit {
                changes: changes.clone(),
            })
        });
        let envelope = self.envelope(command);
        self.commit(envelope, changes);
    }
    fn commit(&mut self, envelope: Envelope, changes: Vec<Change>) -> Receipt {
        match &envelope.command {
            Command::Undo { .. } => {
                self.undo.entry(envelope.actor_id).or_default().pop();
                self.redo
                    .entry(envelope.actor_id)
                    .or_default()
                    .push(envelope.operation_id);
            }
            Command::Redo { .. } => {
                self.redo.entry(envelope.actor_id).or_default().pop();
                self.undo
                    .entry(envelope.actor_id)
                    .or_default()
                    .push(envelope.operation_id);
            }
            _ if !changes.is_empty() => {
                self.undo
                    .entry(envelope.actor_id)
                    .or_default()
                    .push(envelope.operation_id);
                self.redo.entry(envelope.actor_id).or_default().clear();
            }
            _ => {}
        }
        self.sequences.insert(envelope.actor_id, envelope.sequence);
        let receipt = Receipt {
            status: "applied",
            revision: self.revision() + 1,
            operation_id: envelope.operation_id,
        };
        self.journal.entries.push(Entry {
            envelope,
            revision: receipt.revision,
            changes,
        });
        receipt
    }
    pub fn apply(
        &mut self,
        document: &mut Document,
        envelope: Envelope,
        allow_recorded: bool,
    ) -> Result<Receipt, String> {
        if let Some(previous) = self
            .journal
            .entries
            .iter()
            .find(|entry| entry.envelope.operation_id == envelope.operation_id)
        {
            return if previous.envelope == envelope {
                Ok(Receipt {
                    status: "duplicate",
                    revision: previous.revision,
                    operation_id: envelope.operation_id,
                })
            } else {
                Err("Operation ID was reused with different content".into())
            };
        }
        if envelope.version != OPERATION_VERSION || envelope.document_id != self.journal.document_id
        {
            return Err("Unsupported operation version or wrong document identity".into());
        }
        if envelope.operation_id.is_nil()
            || envelope.actor_id.is_nil()
            || envelope.transaction_id.is_nil()
        {
            return Err("Operation identities must not be nil".into());
        }
        if envelope.base_revision != self.revision() {
            return Err(format!(
                "Revision conflict: expected {}, received {}",
                self.revision(),
                envelope.base_revision
            ));
        }
        if envelope.sequence != self.sequences.get(&envelope.actor_id).copied().unwrap_or(0) + 1 {
            return Err("Actor sequence must be the next sequence".into());
        }
        let before = document.clone();
        let mut candidate = before.clone();
        match &envelope.command {
            Command::Undo { operation_id } | Command::Redo { operation_id } => {
                let stack = if matches!(envelope.command, Command::Undo { .. }) {
                    &self.undo
                } else {
                    &self.redo
                };
                if stack.get(&envelope.actor_id).and_then(|items| items.last())
                    != Some(operation_id)
                {
                    return Err(
                        "Only this actor's latest eligible edit can be undone/redone".into(),
                    );
                }
                let entry = self
                    .journal
                    .entries
                    .iter()
                    .find(|entry| entry.envelope.operation_id == *operation_id)
                    .ok_or("Undo target is missing")?;
                let inverse: Vec<_> = entry.changes.iter().rev().map(Change::inverse).collect();
                candidate = operation_patch::apply(&candidate, &inverse)?;
            }
            Command::DocumentChanges { changes } => {
                if changes.is_empty() || changes.len() > 10000 {
                    return Err("A document edit needs 1 to 10000 changes".into());
                }
                operation_patch::validate_external(changes)?;
                candidate = operation_patch::apply(&candidate, changes)?;
            }
            Command::RecordedEdit { changes } if allow_recorded => {
                candidate = operation_patch::apply(&candidate, changes)?;
            }
            Command::RecordedEdit { .. } => {
                return Err(
                    "Recorded editor changes are local/replay-only; submit a typed command".into(),
                );
            }
            command => {
                run_command(&mut candidate, command, 0)?;
                if component_source_changed(&before, &candidate) {
                    candidate.sync_component_instances();
                }
            }
        }
        candidate.sync_booleans()?;
        candidate.validate()?;
        let changes = operation_patch::diff(&before, &candidate);
        *document = candidate;
        Ok(self.commit(envelope, changes))
    }
    pub fn restore(journal: Journal, head: &Document, actor: EntityId) -> Result<Self, String> {
        if journal.version != OPERATION_VERSION || journal.document_id.is_nil() {
            return Err("Unsupported operation journal".into());
        }
        journal.baseline.validate()?;
        let mut current = journal.baseline.clone();
        let mut session = Self::new(&current, actor);
        session.journal.document_id = journal.document_id;
        for entry in journal.entries {
            let result = session.apply(&mut current, entry.envelope.clone(), true)?;
            if result.status != "applied"
                || result.revision != entry.revision
                || session.journal.entries.last() != Some(&entry)
            {
                return Err("Journal effects do not match deterministic replay".into());
            }
        }
        if !operation_patch::diff(&current, head).is_empty() {
            return Err("Document does not match its operation journal".into());
        }
        Ok(session)
    }
}

pub(crate) fn parse_envelope(json: &str) -> Result<Envelope, String> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("Invalid operation: {e}"))?;
    fn identities(command: &serde_json::Value, depth: usize) -> Result<(), String> {
        if depth > 8 {
            return Err("Transaction nesting exceeds eight levels".into());
        }
        if let Some(commands) = command.get("commands").and_then(|v| v.as_array()) {
            for child in commands {
                identities(child, depth + 1)?;
            }
        }
        for owner in [command.get("node"), command.get("properties")]
            .into_iter()
            .flatten()
        {
            if let Some(shadows) = owner.get("shadows").and_then(|v| v.as_array()) {
                for shadow in shadows {
                    if shadow.get("id").and_then(|v| v.as_str()).is_none() {
                        return Err("Operation shadows require explicit IDs".into());
                    }
                }
            }
        }
        Ok(())
    }
    identities(&value["command"], 0)?;
    serde_json::from_value(value).map_err(|e| format!("Invalid operation: {e}"))
}

fn unlocked(document: &Document, id: EntityId) -> Result<(), String> {
    let node = document
        .active_node(id)
        .ok_or("Node does not exist on the target page")?;
    if node.locked {
        Err("Node is locked".into())
    } else {
        Ok(())
    }
}
fn finite(values: &[f32]) -> Result<(), String> {
    if values.iter().all(|value| value.is_finite()) {
        Ok(())
    } else {
        Err("Geometry must be finite".into())
    }
}
fn run_command(document: &mut Document, command: &Command, depth: usize) -> Result<(), String> {
    if depth > 8 {
        return Err("Transaction nesting exceeds eight levels".into());
    }
    if let Command::Batch { commands } = command {
        if commands.is_empty() || commands.len() > 1000 {
            return Err("A transaction needs 1 to 1000 commands".into());
        }
        for command in commands {
            run_command(document, command, depth + 1)?;
        }
        return Ok(());
    }
    let page_id = match command {
        Command::CreateNode { page_id, .. }
        | Command::DeleteNode { page_id, .. }
        | Command::MoveNodes { page_id, .. }
        | Command::SetBounds { page_id, .. }
        | Command::ResizeNode { page_id, .. }
        | Command::SetTransform { page_id, .. }
        | Command::SetProperties { page_id, .. }
        | Command::ReparentNode { page_id, .. }
        | Command::ReorderNode { page_id, .. } => *page_id,
        _ => return Err("History and recorded changes cannot be nested in transactions".into()),
    };
    if !document.pages.iter().any(|page| page.id == page_id) {
        return Err("Target page does not exist".into());
    }
    let active = document.active_page_id;
    document.active_page_id = page_id;
    match command {
        Command::CreateNode {
            node, before_id, ..
        } => {
            if node.id.is_nil()
                || document
                    .pages
                    .iter()
                    .any(|page| page.nodes.iter().any(|item| item.id == node.id))
            {
                return Err("Node identity is missing or already exists".into());
            }
            if let Some(parent) = node.parent_id {
                unlocked(document, parent)?;
            }
            let index = if let Some(id) = before_id {
                document
                    .active_page()
                    .nodes
                    .iter()
                    .position(|node| node.id == *id)
                    .ok_or("Insertion anchor is missing")?
            } else {
                document.active_page().nodes.len()
            };
            document
                .active_page_mut()
                .nodes
                .insert(index, *node.clone());
            if let Some(parent) = node.parent_id {
                document.relayout_container(parent);
            }
        }
        Command::DeleteNode { node_id, .. } => {
            unlocked(document, *node_id)?;
            if !document.delete_node(*node_id) {
                return Err("Node deletion is not permitted".into());
            }
        }
        Command::MoveNodes {
            node_ids, dx, dy, ..
        } => {
            finite(&[*dx, *dy])?;
            if node_ids.is_empty()
                || node_ids
                    .iter()
                    .collect::<std::collections::HashSet<_>>()
                    .len()
                    != node_ids.len()
            {
                return Err("Selection must contain distinct node IDs".into());
            }
            for id in node_ids {
                unlocked(document, *id)?;
            }
            document.move_nodes(node_ids, *dx, *dy);
        }
        Command::SetBounds {
            node_id,
            x,
            y,
            width,
            height,
            ..
        } => {
            unlocked(document, *node_id)?;
            finite(&[*x, *y, *width, *height])?;
            if *width <= 0.0 || *height <= 0.0 {
                return Err("Dimensions must be positive".into());
            }
            document.set_node_bounds(*node_id, *x, *y, *width, *height);
        }
        Command::ResizeNode {
            node_id,
            handle,
            dx,
            dy,
            ..
        } => {
            unlocked(document, *node_id)?;
            finite(&[*dx, *dy])?;
            if !["n", "ne", "e", "se", "s", "sw", "w", "nw"].contains(&handle.as_str()) {
                return Err("Unknown resize handle".into());
            }
            document.resize_node(*node_id, handle, *dx, *dy);
        }
        Command::SetTransform {
            node_id,
            rotation,
            flip_x,
            flip_y,
            ..
        } => {
            unlocked(document, *node_id)?;
            finite(&[*rotation])?;
            document.set_node_transform(*node_id, *rotation, *flip_x, *flip_y);
        }
        Command::SetProperties {
            node_id,
            properties,
            ..
        } => {
            let old = document
                .active_node(*node_id)
                .cloned()
                .ok_or("Node does not exist")?;
            let mut non_lock = *properties.clone();
            non_lock.locked = None;
            if old.locked && non_lock != Properties::default() {
                return Err("Unlock the node before editing it".into());
            }
            if let Some(locked) = properties.locked {
                document.set_node_locked(*node_id, locked);
            }
            if non_lock != Properties::default() && document.active_node(*node_id).unwrap().locked {
                return Err("Cannot edit a locked node".into());
            }
            if let Some(name) = &properties.name {
                document.rename_node(*node_id, name.clone());
            }
            if let Some(opacity) = properties.opacity {
                finite(&[opacity])?;
                if !(0.0..=1.0).contains(&opacity) {
                    return Err("Opacity must be between zero and one".into());
                }
                document.set_node_opacity(*node_id, opacity);
            }
            if let Some(text) = &properties.text {
                finite(&[text.font_size, text.line_height, text.letter_spacing])?;
                if text.font_size <= 0.0 || text.line_height <= 0.0 {
                    return Err("Invalid typography".into());
                }
                if old.kind != NodeKind::Text {
                    return Err("Typography requires a text node".into());
                }
                document.set_node_text(*node_id, text.clone());
            }
            if let Some(shadows) = &properties.shadows {
                let mut ids = std::collections::HashSet::new();
                if shadows.iter().any(|s| s.id.is_nil() || !ids.insert(s.id)) {
                    return Err("Shadow IDs must be non-nil and distinct".into());
                }
                if !document.set_node_shadows(*node_id, shadows.clone()) {
                    return Err("Invalid shadow values".into());
                }
            }
            if properties.fill.is_some()
                || properties.stroke.is_some()
                || properties.stroke_width.is_some()
                || properties.corner_radii.is_some()
                || properties.stroke_align.is_some()
                || properties.stroke_join.is_some()
            {
                let fill = properties.fill.unwrap_or(old.fill);
                let stroke = properties.stroke.unwrap_or(old.stroke);
                let width = properties.stroke_width.unwrap_or(old.stroke_width);
                let radii = properties.corner_radii.unwrap_or(old.corner_radii);
                finite(&fill)?;
                finite(&stroke)?;
                finite(&radii)?;
                finite(&[width])?;
                if fill.iter().chain(&stroke).any(|v| !(0.0..=1.0).contains(v))
                    || width < 0.0
                    || radii.iter().any(|v| *v < 0.0)
                {
                    return Err("Invalid paint values".into());
                }
                document.set_node_style(
                    *node_id,
                    fill,
                    stroke,
                    width,
                    radii,
                    properties.stroke_align.unwrap_or(old.stroke_align),
                    properties.stroke_join.unwrap_or(old.stroke_join),
                );
            }
        }
        Command::ReparentNode {
            node_id,
            parent_id,
            before_id,
            ..
        } => {
            unlocked(document, *node_id)?;
            if let Some(parent) = parent_id {
                unlocked(document, *parent)?;
                if !matches!(
                    document.active_node(*parent).unwrap().kind,
                    NodeKind::Frame | NodeKind::Group
                ) {
                    return Err("Parent must be a frame or group".into());
                }
            }
            if before_id == &Some(*node_id) {
                return Err("Cannot insert a node before itself".into());
            }
            if let Some(id) = before_id
                && document
                    .active_node(*id)
                    .is_none_or(|node| node.parent_id != *parent_id)
            {
                return Err("Insertion anchor must be a sibling".into());
            }
            let index = document
                .active_page()
                .nodes
                .iter()
                .position(|node| node.id == *node_id)
                .unwrap();
            let mut node = document.active_page_mut().nodes.remove(index);
            node.parent_id = *parent_id;
            let index = before_id
                .and_then(|id| {
                    document
                        .active_page()
                        .nodes
                        .iter()
                        .position(|node| node.id == id)
                })
                .unwrap_or(document.active_page().nodes.len());
            document.active_page_mut().nodes.insert(index, node);
            // World-space coordinates preserve the visual placement. Validation
            // below rejects a cycle atomically, before any live state is changed.
        }
        Command::ReorderNode {
            node_id,
            target_id,
            before,
            ..
        } => {
            unlocked(document, *node_id)?;
            if document.active_node(*target_id).is_none() {
                return Err("Reorder target is missing".into());
            }
            if node_id != target_id && !document.reorder_node(*node_id, *target_id, *before) {
                return Err("Invalid layer order".into());
            }
        }
        _ => unreachable!(),
    }
    document.active_page_id = active;
    document.validate()
}

fn infer_create(before: &Document, after: &Document) -> Option<Command> {
    let existing: std::collections::HashSet<_> = before
        .pages
        .iter()
        .flat_map(|page| page.nodes.iter().map(|node| node.id))
        .collect();
    let added: Vec<_> = after
        .pages
        .iter()
        .flat_map(|page| {
            page.nodes
                .iter()
                .enumerate()
                .filter(|(_, node)| !existing.contains(&node.id))
                .map(move |(index, node)| (page, index, node))
        })
        .collect();
    if let [(page, index, node)] = added.as_slice() {
        let command = Command::CreateNode {
            page_id: page.id,
            node: Box::new((*node).clone()),
            before_id: page.nodes.get(index + 1).map(|node| node.id),
        };
        let mut candidate = before.clone();
        if run_command(&mut candidate, &command, 0).is_ok()
            && operation_patch::diff(&candidate, after).is_empty()
        {
            return Some(command);
        }
    }
    None
}
