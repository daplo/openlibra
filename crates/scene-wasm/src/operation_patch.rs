//! Identity-addressed changes: never use a node's array index as its identity.
use crate::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

type State = BTreeMap<Target, Value>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum Target {
    Document,
    Page { id: EntityId },
    Node { id: EntityId },
    Color { id: EntityId },
    NumberVariable { id: EntityId },
    TextStyle { id: EntityId },
    MediaAsset { id: EntityId },
    Component { id: EntityId },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Change {
    pub target: Target,
    pub path: Vec<String>,
    #[serde(with = "optional_value")]
    pub before: Option<Value>,
    #[serde(with = "optional_value")]
    pub after: Option<Value>,
    pub ordered_ids: bool,
}

impl Change {
    pub fn inverse(&self) -> Self {
        Self {
            target: self.target.clone(),
            path: self.path.clone(),
            before: self.after.clone(),
            after: self.before.clone(),
            ordered_ids: self.ordered_ids,
        }
    }
}

fn collection_target(name: &str, id: EntityId) -> Target {
    match name {
        "pages" => Target::Page { id },
        "nodes" => Target::Node { id },
        "color_library" => Target::Color { id },
        "number_variables" => Target::NumberVariable { id },
        "text_styles" => Target::TextStyle { id },
        "media_assets" => Target::MediaAsset { id },
        "components" => Target::Component { id },
        _ => unreachable!(),
    }
}
const COLLECTIONS: [&str; 6] = [
    "pages",
    "color_library",
    "number_variables",
    "text_styles",
    "media_assets",
    "components",
];

// JavaScript JSON.stringify writes 1.0 as 1. Normalize numeric representation
// before creating CAS values, so a .libra envelope round-trip is lossless.
fn canonical_numbers(value: &mut Value) {
    match value {
        Value::Number(number) => {
            if let Some(n) = number.as_f64()
                && n.fract() == 0.0
                && n.abs() < 9_007_199_254_740_992.0
            {
                *value = Value::from(n as i64);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(canonical_numbers),
        Value::Object(items) => items.values_mut().for_each(canonical_numbers),
        _ => {}
    }
}

fn flatten(document: &Document) -> State {
    let mut root = serde_json::to_value(document).expect("validated document");
    canonical_numbers(&mut root);
    root.as_object_mut().unwrap().remove("active_page_id");
    let mut state = State::new();
    for name in COLLECTIONS {
        let items = match root[name].take() {
            Value::Array(items) => items,
            _ => Vec::new(),
        };
        let mut ids = Vec::new();
        for mut item in items {
            let id: EntityId = serde_json::from_value(item["id"].clone()).unwrap();
            ids.push(Value::String(id.to_string()));
            if name == "pages" {
                let nodes = match item["nodes"].take() {
                    Value::Array(nodes) => nodes,
                    _ => Vec::new(),
                };
                let mut node_ids = Vec::new();
                for node in nodes {
                    let node_id: EntityId = serde_json::from_value(node["id"].clone()).unwrap();
                    node_ids.push(Value::String(node_id.to_string()));
                    state.insert(Target::Node { id: node_id }, node);
                }
                item["nodes"] = Value::Array(node_ids);
            }
            state.insert(collection_target(name, id), item);
        }
        root[name] = Value::Array(ids);
    }
    state.insert(Target::Document, root);
    state
}

fn expand(state: &State, active_page: EntityId) -> Result<Document, String> {
    let mut root = state
        .get(&Target::Document)
        .cloned()
        .ok_or("Missing document")?;
    for name in COLLECTIONS {
        let ids = root[name]
            .as_array()
            .ok_or("Invalid collection order")?
            .clone();
        let mut items = Vec::new();
        for id in ids {
            let id: EntityId =
                serde_json::from_value(id).map_err(|_| "Invalid collection identity")?;
            let mut item = state
                .get(&collection_target(name, id))
                .cloned()
                .ok_or("Missing collection entity")?;
            if name == "pages" {
                let nodes = item["nodes"]
                    .as_array()
                    .ok_or("Invalid node order")?
                    .iter()
                    .map(|id| {
                        let id: EntityId = serde_json::from_value(id.clone())
                            .map_err(|_| "Invalid node identity")?;
                        state
                            .get(&Target::Node { id })
                            .cloned()
                            .ok_or("Missing node")
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                item["nodes"] = Value::Array(nodes);
            }
            items.push(item);
        }
        root[name] = Value::Array(items);
    }
    let active = root["pages"]
        .as_array()
        .and_then(|pages| {
            pages
                .iter()
                .find(|page| page["id"] == active_page.to_string())
                .or_else(|| pages.first())
        })
        .map(|page| page["id"].clone())
        .ok_or("Document needs a page")?;
    root["active_page_id"] = active;
    let document: Document = serde_json::from_value(root).map_err(|error| error.to_string())?;
    document.validate()?;
    if flatten(&document) != *state {
        return Err("Unrecognized fields, orphaned entities or noncanonical changes".into());
    }
    Ok(document)
}

pub(crate) fn diff(before: &Document, after: &Document) -> Vec<Change> {
    if before == after {
        return Vec::new();
    }
    // Geometry/style edits usually change a handful of nodes. Serializing every
    // untouched node twice can exhaust WASM memory in a large document.
    if before.schema_version == after.schema_version
        && before.color_library == after.color_library
        && before.number_variables == after.number_variables
        && before.text_styles == after.text_styles
        && before.media_assets == after.media_assets
        && before.components == after.components
        && before.pages.len() == after.pages.len()
        && before.pages.iter().zip(&after.pages).all(|(a, b)| {
            a.id == b.id
                && a.name == b.name
                && a.description == b.description
                && a.benchmark_node_count == b.benchmark_node_count
                && a.benchmark_modified_node_ids == b.benchmark_modified_node_ids
                && a.nodes.len() == b.nodes.len()
                && a.nodes.iter().zip(&b.nodes).all(|(a, b)| a.id == b.id)
        })
    {
        let mut changed = BTreeMap::new();
        for (a, b) in before.pages.iter().zip(&after.pages) {
            for (a, b) in a.nodes.iter().zip(&b.nodes) {
                if a != b {
                    changed.insert(a.id, (a, b));
                }
            }
        }
        let mut changes = Vec::new();
        for (id, (a, b)) in changed {
            let mut a = serde_json::to_value(a).expect("validated node");
            let mut b = serde_json::to_value(b).expect("validated node");
            canonical_numbers(&mut a);
            canonical_numbers(&mut b);
            diff_value(
                &Target::Node { id },
                &mut Vec::new(),
                Some(&a),
                Some(&b),
                &mut changes,
            );
        }
        return changes;
    }
    diff_full(before, after)
}

fn diff_full(before: &Document, after: &Document) -> Vec<Change> {
    let before = flatten(before);
    let after = flatten(after);
    let keys: BTreeSet<_> = before.keys().chain(after.keys()).cloned().collect();
    let mut changes = Vec::new();
    for target in keys {
        diff_value(
            &target,
            &mut Vec::new(),
            before.get(&target),
            after.get(&target),
            &mut changes,
        );
    }
    changes
}
fn diff_value(
    target: &Target,
    path: &mut Vec<String>,
    before: Option<&Value>,
    after: Option<&Value>,
    changes: &mut Vec<Change>,
) {
    if before == after {
        return;
    }
    if let (Some(Value::Object(a)), Some(Value::Object(b))) = (before, after) {
        let keys: BTreeSet<_> = a.keys().chain(b.keys()).collect();
        for key in keys {
            path.push(key.clone());
            diff_value(target, path, a.get(key), b.get(key), changes);
            path.pop();
        }
    } else {
        let ordered_ids = path.len() == 1
            && match target {
                Target::Document => COLLECTIONS.contains(&path[0].as_str()),
                Target::Page { .. } => path[0] == "nodes",
                _ => false,
            };
        changes.push(Change {
            target: target.clone(),
            path: path.clone(),
            before: before.cloned(),
            after: after.cloned(),
            ordered_ids,
        });
    }
}

// New unrelated members survive inverse edits. Reordering old members conflicts
// rather than guessing, and a deleted insertion anchor falls back to the nearest
// surviving predecessor in the current list.
fn merge_order(current: &Value, expected: &Value, desired: &Value) -> Result<Value, String> {
    let current = current.as_array().ok_or("Invalid current order")?;
    let expected = expected.as_array().ok_or("Invalid expected order")?;
    let desired = desired.as_array().ok_or("Invalid desired order")?;
    let identities = |values: &[Value]| -> Result<BTreeSet<String>, String> {
        values
            .iter()
            .map(|id| {
                id.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| "Order IDs must be strings".into())
            })
            .collect()
    };
    let expected_ids = identities(expected)?;
    let desired_ids = identities(desired)?;
    let current_ids = identities(current)?;
    if expected_ids.len() != expected.len()
        || desired_ids.len() != desired.len()
        || current_ids.len() != current.len()
    {
        return Err("Order IDs must be unique".into());
    }
    if current
        .iter()
        .filter(|id| expected_ids.contains(id.as_str().unwrap()))
        .cloned()
        .collect::<Vec<_>>()
        != *expected
    {
        return Err("Order changed since this edit".into());
    }
    if desired_ids
        .difference(&expected_ids)
        .any(|id| current_ids.contains(id))
    {
        return Err("Order identity already exists".into());
    }
    let mut extras: BTreeMap<Option<String>, Vec<Value>> = BTreeMap::new();
    let mut anchor = None;
    for id in current {
        if expected_ids.contains(id.as_str().unwrap()) {
            if desired_ids.contains(id.as_str().unwrap()) {
                anchor = id.as_str().map(str::to_owned);
            }
        } else {
            extras.entry(anchor.clone()).or_default().push(id.clone());
        }
    }
    let mut result = extras.remove(&None).unwrap_or_default();
    for id in desired {
        result.push(id.clone());
        result.extend(
            extras
                .remove(&id.as_str().map(str::to_owned))
                .unwrap_or_default(),
        );
    }
    Ok(Value::Array(result))
}

pub(crate) fn apply(document: &Document, changes: &[Change]) -> Result<Document, String> {
    let node_properties_only = changes
        .iter()
        .all(|change| matches!(change.target, Target::Node { .. }) && !change.path.is_empty());
    let mut state = if node_properties_only {
        let targets: BTreeSet<_> = changes.iter().map(|change| change.target.clone()).collect();
        document
            .pages
            .iter()
            .flat_map(|page| &page.nodes)
            .filter_map(|node| {
                let target = Target::Node { id: node.id };
                targets.contains(&target).then(|| {
                    let mut value = serde_json::to_value(node).expect("validated node");
                    canonical_numbers(&mut value);
                    (target, value)
                })
            })
            .collect()
    } else {
        flatten(document)
    };
    for change in changes {
        if change.path.is_empty() {
            if state.get(&change.target) != change.before.as_ref() {
                return Err("Entity changed since this edit".into());
            }
            if let Some(after) = &change.after {
                state.insert(change.target.clone(), after.clone());
            } else {
                state.remove(&change.target);
            }
            continue;
        }
        let mut value = state
            .get_mut(&change.target)
            .ok_or("Edited entity was deleted")?;
        for part in &change.path[..change.path.len() - 1] {
            value = value.get_mut(part).ok_or("Edited property was removed")?;
        }
        let object = value
            .as_object_mut()
            .ok_or("Property parent is not an object")?;
        let field = change.path.last().unwrap();
        let next = if change.ordered_ids {
            Some(merge_order(
                object.get(field).ok_or("Missing order")?,
                change.before.as_ref().ok_or("Missing expected order")?,
                change.after.as_ref().ok_or("Missing desired order")?,
            )?)
        } else {
            if object.get(field) != change.before.as_ref() {
                return Err(format!(
                    "Property {} changed since this edit",
                    change.path.join(".")
                ));
            }
            change.after.clone()
        };
        if let Some(next) = next {
            object.insert(field.clone(), next);
        } else {
            object.remove(field);
        }
    }
    if node_properties_only {
        let mut candidate = document.clone();
        for node in candidate.pages.iter_mut().flat_map(|page| &mut page.nodes) {
            if let Some(value) = state.remove(&Target::Node { id: node.id }) {
                let updated: Node =
                    serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
                let mut canonical = serde_json::to_value(&updated).expect("validated node");
                canonical_numbers(&mut canonical);
                if updated.id != node.id || canonical != value {
                    return Err(
                        "Unrecognized fields, orphaned entities or noncanonical changes".into(),
                    );
                }
                *node = updated;
            }
        }
        candidate.validate()?;
        return Ok(candidate);
    }
    expand(&state, document.active_page_id)
}

// An absent property and an explicit JSON null are different CAS values.
mod optional_value {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use serde_json::Value;
    #[derive(Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Present {
        value: Value,
    }
    pub fn serialize<S: Serializer>(
        value: &Option<Value>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        value
            .as_ref()
            .map(|v| Present { value: v.clone() })
            .serialize(serializer)
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<Value>, D::Error> {
        Ok(Option::<Present>::deserialize(deserializer)?.map(|v| v.value))
    }
}

// Network edits use the same entity/property CAS as undo, with an explicit
// allowlist for collection ordering. Schema/session/view state is never editable.
pub(crate) fn validate_external(changes: &[Change]) -> Result<(), String> {
    for change in changes {
        let order = change.path.len() == 1
            && match change.target {
                Target::Document => COLLECTIONS.contains(&change.path[0].as_str()),
                Target::Page { .. } => change.path[0] == "nodes",
                _ => false,
            };
        if change.ordered_ids != order || change.path.len() > 16 {
            return Err("Invalid document change path or ordering".into());
        }
        if matches!(change.target, Target::Document) && !order {
            return Err("Only document collections can be edited".into());
        }
        if change.path.first().is_some_and(|p| p == "id") {
            return Err("Entity identities cannot be edited".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod fast_diff_tests {
    use super::*;
    #[test]
    fn node_edit_diff_matches_full_document_diff() {
        let mut engine = DocumentEngine::new_blank();
        let node = engine.add_rectangle();
        engine.add_rectangle();
        let before = engine.document.clone();
        engine.set_node_bounds(node, 12.0, 25.0, 99.0, 101.0);
        assert_eq!(
            diff(&before, &engine.document),
            diff_full(&before, &engine.document)
        );
        let changes = diff(&before, &engine.document);
        assert_eq!(apply(&before, &changes).unwrap(), engine.document);
        let mut stale = changes.clone();
        stale[0].before = Some(serde_json::json!("wrong expected value"));
        assert!(apply(&before, &stale).is_err());
        let mut unknown = changes[0].clone();
        unknown.path = vec!["unknown_node_field".into()];
        unknown.before = None;
        unknown.after = Some(serde_json::json!(true));
        assert!(apply(&before, &[unknown]).is_err());
        let inverse: Vec<_> = changes.iter().rev().map(Change::inverse).collect();
        assert_eq!(apply(&engine.document, &inverse).unwrap(), before);
        assert_eq!(
            diff(&engine.document, &before),
            diff_full(&engine.document, &before)
        );
    }
}
