use crate::operations::{Command, Properties, Session};
use crate::*;

fn setup() -> (Document, Session, EntityId) {
    let mut doc = Document::blank();
    let id = doc.add_rectangle_to(None);
    let session = Session::new(&doc, Uuid::now_v7());
    (doc, session, id)
}
fn apply(doc: &mut Document, session: &mut Session, command: Command) -> Result<(), String> {
    let envelope = session.envelope(command);
    session.apply(doc, envelope, false).map(|_| ())
}
fn properties(doc: &Document, id: EntityId, p: Properties) -> Command {
    Command::SetProperties {
        page_id: doc.active_page_id,
        node_id: id,
        properties: Box::new(p),
    }
}
fn restored(session: &Session, doc: &Document) -> Session {
    let json = serde_json::to_string(&session.journal).unwrap();
    Session::restore(serde_json::from_str(&json).unwrap(), doc, session.actor).unwrap()
}
#[test]
fn operations_replay_and_deduplicate_without_consuming_revision() {
    let (mut doc, mut session, id) = setup();
    let cmd = Command::MoveNodes {
        page_id: doc.active_page_id,
        node_ids: vec![id],
        dx: 12.0,
        dy: -9.0,
    };
    let envelope = session.envelope(cmd);
    session.apply(&mut doc, envelope.clone(), false).unwrap();
    let head = doc.clone();
    assert_eq!(
        session
            .apply(&mut doc, envelope.clone(), false)
            .unwrap()
            .status,
        "duplicate"
    );
    let mut changed = envelope;
    changed.transaction_id = Uuid::now_v7();
    assert!(session.apply(&mut doc, changed, false).is_err());
    assert_eq!(session.revision(), 1);
    assert_eq!(doc, head);
    assert_eq!(restored(&session, &doc).journal, session.journal);
}
#[test]
fn operations_reject_wrong_identity_version_revision_sequence_atomically() {
    let (mut doc, mut session, id) = setup();
    let head = doc.clone();
    let envelope = session.envelope(Command::DeleteNode {
        page_id: doc.active_page_id,
        node_id: id,
    });
    for i in 0..6 {
        let mut invalid = envelope.clone();
        match i {
            0 => invalid.version = 99,
            1 => invalid.document_id = Uuid::now_v7(),
            2 => invalid.base_revision = 4,
            3 => invalid.sequence = 0,
            4 => invalid.actor_id = Uuid::nil(),
            _ => invalid.operation_id = Uuid::nil(),
        }
        assert!(session.apply(&mut doc, invalid, false).is_err());
        assert_eq!(doc, head);
        assert_eq!(session.revision(), 0);
    }
}
#[test]
fn failed_transaction_rolls_back_all_commands_and_history() {
    let (mut doc, mut session, id) = setup();
    let head = doc.clone();
    let commands = vec![
        properties(
            &doc,
            id,
            Properties {
                name: Some("Changed".into()),
                ..Default::default()
            },
        ),
        Command::DeleteNode {
            page_id: doc.active_page_id,
            node_id: Uuid::now_v7(),
        },
    ];
    assert!(apply(&mut doc, &mut session, Command::Batch { commands }).is_err());
    assert_eq!(doc, head);
    assert_eq!(session.revision(), 0);
    assert!(session.undo.is_empty());
}
#[test]
fn actor_undo_preserves_foreign_properties_and_redo() {
    let (mut doc, mut session, id) = setup();
    let actor_a = session.actor;
    let original = doc.active_node(id).unwrap().name.clone();
    let cmd = properties(
        &doc,
        id,
        Properties {
            name: Some("A".into()),
            ..Default::default()
        },
    );
    apply(&mut doc, &mut session, cmd).unwrap();
    let op_a = session
        .journal
        .entries
        .last()
        .unwrap()
        .envelope
        .operation_id;
    session.actor = Uuid::now_v7();
    let cmd = properties(
        &doc,
        id,
        Properties {
            opacity: Some(0.25),
            ..Default::default()
        },
    );
    apply(&mut doc, &mut session, cmd).unwrap();
    session.actor = actor_a;
    apply(&mut doc, &mut session, Command::Undo { operation_id: op_a }).unwrap();
    assert_eq!(doc.active_node(id).unwrap().name, original);
    assert_eq!(doc.active_node(id).unwrap().opacity, 0.25);
    let undo = session
        .journal
        .entries
        .last()
        .unwrap()
        .envelope
        .operation_id;
    apply(&mut doc, &mut session, Command::Redo { operation_id: undo }).unwrap();
    assert_eq!(doc.active_node(id).unwrap().name, "A");
    assert_eq!(doc.active_node(id).unwrap().opacity, 0.25);
    restored(&session, &doc);
}
#[test]
fn conflicting_undo_is_rejected_without_popping_actor_history() {
    let (mut doc, mut session, id) = setup();
    let actor = session.actor;
    let cmd = properties(
        &doc,
        id,
        Properties {
            name: Some("A".into()),
            ..Default::default()
        },
    );
    apply(&mut doc, &mut session, cmd).unwrap();
    let target = session.journal.entries[0].envelope.operation_id;
    session.actor = Uuid::now_v7();
    let cmd = properties(
        &doc,
        id,
        Properties {
            name: Some("B".into()),
            ..Default::default()
        },
    );
    apply(&mut doc, &mut session, cmd).unwrap();
    session.actor = actor;
    let journal = session.journal.clone();
    assert!(
        apply(
            &mut doc,
            &mut session,
            Command::Undo {
                operation_id: target
            }
        )
        .is_err()
    );
    assert_eq!(session.journal, journal);
    assert_eq!(session.undo[&actor], vec![target]);
    assert_eq!(doc.active_node(id).unwrap().name, "B");
}
#[test]
fn undo_create_preserves_foreign_insertions_and_replays() {
    let (mut doc, mut session, id) = setup();
    let actor = session.actor;
    let mut node = doc.active_node(id).unwrap().clone();
    node.id = Uuid::now_v7();
    let a = node.id;
    let command = Command::CreateNode {
        page_id: doc.active_page_id,
        node: Box::new(node.clone()),
        before_id: None,
    };
    apply(&mut doc, &mut session, command).unwrap();
    let target = session.journal.entries[0].envelope.operation_id;
    session.actor = Uuid::now_v7();
    node.id = Uuid::now_v7();
    let b = node.id;
    let command = Command::CreateNode {
        page_id: doc.active_page_id,
        node: Box::new(node),
        before_id: None,
    };
    apply(&mut doc, &mut session, command).unwrap();
    session.actor = actor;
    apply(
        &mut doc,
        &mut session,
        Command::Undo {
            operation_id: target,
        },
    )
    .unwrap();
    assert!(doc.active_node(a).is_none());
    assert!(doc.active_node(b).is_some());
    restored(&session, &doc);
}
#[test]
fn operations_validate_geometry_locks_cycles_and_unknown_commands() {
    let (mut doc, mut session, id) = setup();
    let page_id = doc.active_page_id;
    assert!(
        apply(
            &mut doc,
            &mut session,
            Command::SetBounds {
                page_id,
                node_id: id,
                x: 0.,
                y: 0.,
                width: f32::NAN,
                height: 20.
            }
        )
        .is_err()
    );
    assert!(
        apply(
            &mut doc,
            &mut session,
            Command::ReparentNode {
                page_id,
                node_id: id,
                parent_id: Some(id),
                before_id: None
            }
        )
        .is_err()
    );
    let cmd = properties(
        &doc,
        id,
        Properties {
            locked: Some(true),
            ..Default::default()
        },
    );
    apply(&mut doc, &mut session, cmd).unwrap();
    assert!(
        apply(
            &mut doc,
            &mut session,
            Command::DeleteNode {
                page_id,
                node_id: id
            }
        )
        .is_err()
    );
    assert!(serde_json::from_str::<Command>(r#"{"type":"mystery"}"#).is_err());
    assert!(
        apply(
            &mut doc,
            &mut session,
            Command::RecordedEdit { changes: vec![] }
        )
        .is_err()
    );
    restored(&session, &doc);
}
#[test]
fn native_transactions_persist_and_restore_undo_and_nullable_fields() {
    let mut engine = DocumentEngine::new_blank();
    let actor = Uuid::now_v7();
    engine.enable_operations(&actor.to_string()).unwrap();
    let id = engine.add_rectangle();
    let before = engine.document.clone();
    engine.begin_transaction();
    engine.rename_node(id.clone(), "Renamed".into());
    engine.set_node_bounds(id.clone(), 10., 20., 40., 50.);
    engine.end_transaction();
    assert_eq!(engine.operation_session.as_ref().unwrap().revision(), 2);
    let json = engine.document_json();
    let mut loaded = DocumentEngine::load_json(&json).unwrap();
    loaded.enable_operations(&actor.to_string()).unwrap();
    assert!(loaded.undo());
    assert_eq!(loaded.document, before);
    assert!(loaded.redo());
    assert_eq!(loaded.document, engine.document);
    restored(loaded.operation_session.as_ref().unwrap(), &loaded.document);
    // Reparenting changes explicit null to an ID: distinguish null from absence.
    let before = engine.document.clone();
    let frame = engine.document.add_artboard("Frame".into(), 400., 300.);
    engine
        .document
        .active_page_mut()
        .nodes
        .iter_mut()
        .find(|n| n.id.to_string() == id)
        .unwrap()
        .parent_id = Some(frame);
    engine.record_operation(&before);
    restored(engine.operation_session.as_ref().unwrap(), &engine.document);
}
#[test]
fn tampered_journal_or_head_is_rejected() {
    let (mut doc, mut session, id) = setup();
    let command = properties(
        &doc,
        id,
        Properties {
            name: Some("Valid".into()),
            ..Default::default()
        },
    );
    apply(&mut doc, &mut session, command).unwrap();
    let mut journal = session.journal.clone();
    journal.entries[0].changes.clear();
    assert!(Session::restore(journal, &doc, session.actor).is_err());
    doc.active_page_mut().nodes[0].name = "Tampered".into();
    assert!(Session::restore(session.journal.clone(), &doc, session.actor).is_err());
}
#[test]
fn batch_replays_bounds_transform_style_text_reorder_reparent_delete() {
    let (mut doc, mut session, id) = setup();
    let page_id = doc.active_page_id;
    let frame = doc.add_artboard("Frame".into(), 400., 300.);
    let other = doc.add_rectangle_to(None);
    let text = doc.add_text_to(None);
    session = Session::new(&doc, session.actor);
    let commands = vec![
        Command::SetBounds {
            page_id,
            node_id: id,
            x: 20.,
            y: 30.,
            width: 80.,
            height: 90.,
        },
        Command::ResizeNode {
            page_id,
            node_id: id,
            handle: "se".into(),
            dx: 10.,
            dy: 12.,
        },
        Command::SetTransform {
            page_id,
            node_id: id,
            rotation: 30.,
            flip_x: true,
            flip_y: false,
        },
        properties(
            &doc,
            id,
            Properties {
                fill: Some([1., 0., 0., 1.]),
                ..Default::default()
            },
        ),
        properties(
            &doc,
            text,
            Properties {
                text: Some(TextStyle {
                    content: "Hello".into(),
                    ..Default::default()
                }),
                ..Default::default()
            },
        ),
        Command::ReparentNode {
            page_id,
            node_id: id,
            parent_id: Some(frame),
            before_id: None,
        },
        Command::ReorderNode {
            page_id,
            node_id: other,
            target_id: text,
            before: true,
        },
        Command::DeleteNode {
            page_id,
            node_id: other,
        },
    ];
    apply(&mut doc, &mut session, Command::Batch { commands }).unwrap();
    assert_eq!(session.revision(), 1);
    restored(&session, &doc);
}

#[test]
fn generated_move_transform_inverses_restore_exact_state() {
    for i in 0..32 {
        let (mut doc, mut session, id) = setup();
        let before = doc.clone();
        let command = Command::Batch {
            commands: vec![
                Command::MoveNodes {
                    page_id: doc.active_page_id,
                    node_ids: vec![id],
                    dx: i as f32 * 0.7,
                    dy: -(i as f32),
                },
                Command::SetTransform {
                    page_id: doc.active_page_id,
                    node_id: id,
                    rotation: i as f32 * 13.3,
                    flip_x: i % 2 == 0,
                    flip_y: i % 3 == 0,
                },
            ],
        };
        apply(&mut doc, &mut session, command).unwrap();
        let target = session
            .journal
            .entries
            .last()
            .unwrap()
            .envelope
            .operation_id;
        if !session.journal.entries.last().unwrap().changes.is_empty() {
            apply(
                &mut doc,
                &mut session,
                Command::Undo {
                    operation_id: target,
                },
            )
            .unwrap();
            assert_eq!(doc, before);
        }
        restored(&session, &doc);
    }
}

#[test]
fn undo_parent_creation_rejects_foreign_child_without_deleting_it() {
    let (mut doc, mut session, id) = setup();
    let actor = session.actor;
    let mut parent = doc.active_node(id).unwrap().clone();
    parent.id = Uuid::now_v7();
    parent.kind = NodeKind::Frame;
    let parent_id = parent.id;
    let command = Command::CreateNode {
        page_id: doc.active_page_id,
        node: Box::new(parent),
        before_id: None,
    };
    apply(&mut doc, &mut session, command).unwrap();
    let target = session.journal.entries[0].envelope.operation_id;
    session.actor = Uuid::now_v7();
    let mut child = doc.active_node(id).unwrap().clone();
    child.id = Uuid::now_v7();
    child.parent_id = Some(parent_id);
    let command = Command::CreateNode {
        page_id: doc.active_page_id,
        node: Box::new(child),
        before_id: None,
    };
    apply(&mut doc, &mut session, command).unwrap();
    let head = doc.clone();
    session.actor = actor;
    assert!(
        apply(
            &mut doc,
            &mut session,
            Command::Undo {
                operation_id: target
            }
        )
        .is_err()
    );
    assert_eq!(doc, head);
}

#[test]
fn wire_operations_require_explicit_shadow_identity() {
    let (doc, session, id) = setup();
    let cmd = properties(
        &doc,
        id,
        Properties {
            shadows: Some(vec![Shadow {
                id: Uuid::now_v7(),
                kind: ShadowKind::Outer,
                color: [0., 0., 0., 1.],
                offset_x: 2.,
                offset_y: 2.,
                blur: 3.,
                spread: 0.,
                enabled: true,
            }]),
            ..Default::default()
        },
    );
    let mut value = serde_json::to_value(session.envelope(cmd)).unwrap();
    assert!(crate::operations::parse_envelope(&value.to_string()).is_ok());
    value["command"]["properties"]["shadows"][0]
        .as_object_mut()
        .unwrap()
        .remove("id");
    assert!(crate::operations::parse_envelope(&value.to_string()).is_err());
}

#[test]
fn synchronized_component_child_identity_is_deterministic() {
    let mut doc = Document::demo();
    let variant = doc.components[0].variants[0].clone();
    let root = variant.source_root_id;
    let source = doc
        .pages
        .iter()
        .find(|p| p.nodes.iter().any(|n| n.id == root))
        .unwrap();
    let page_id = source.id;
    let mut child = source.nodes.iter().find(|n| n.id == root).unwrap().clone();
    child.id = Uuid::now_v7();
    child.kind = NodeKind::Rectangle;
    child.parent_id = Some(root);
    child.component_id = None;
    child.component_variant_id = None;
    child.component_slot_id = Some(child.id);
    child.instance_root_id = None;
    let mut session = Session::new(&doc, Uuid::now_v7());
    apply(
        &mut doc,
        &mut session,
        Command::CreateNode {
            page_id,
            node: Box::new(child),
            before_id: None,
        },
    )
    .unwrap();
    restored(&session, &doc);
}

#[test]
fn full_document_changes_share_pages_vectors_text_assets_and_libraries() {
    let (mut doc, mut session, _) = setup();
    let original_page = doc.active_page_id;
    let mut edited = doc.clone();
    edited.add_page("Artwork".into());
    edited.add_text_to(None);
    edited.add_vector_shape(VectorGeometry::Ellipse, None);
    edited.add_document_color("Brand".into(), "#336699".into());
    edited.add_number_variable("Spacing".into(), 16.0);
    edited
        .add_media_asset_node(
            MediaAssetKind::Image,
            "Pixel".into(),
            "image/png".into(),
            "data:image/png;base64,aGVsbG8=".into(),
            1,
            1,
            None,
        )
        .unwrap();
    let changes = operation_patch::diff(&doc, &edited);
    apply(&mut doc, &mut session, Command::DocumentChanges { changes }).unwrap();
    // Navigation is local, even when another actor creates a page.
    assert_eq!(doc.active_page_id, original_page);
    assert!(operation_patch::diff(&doc, &edited).is_empty());
    assert_eq!(restored(&session, &doc).journal, session.journal);
    let op = session
        .journal
        .entries
        .last()
        .unwrap()
        .envelope
        .operation_id;
    apply(&mut doc, &mut session, Command::Undo { operation_id: op }).unwrap();
    assert_eq!(doc.pages.len(), 1);
    assert!(doc.media_assets.is_empty());
}

#[test]
fn document_changes_reject_tampering_and_conflicting_values_atomically() {
    let (mut doc, mut session, id) = setup();
    let initial = doc.clone();
    let mut edited = doc.clone();
    edited.rename_node(id, "Renamed".into());
    let changes = operation_patch::diff(&doc, &edited);
    let mut invalid = changes.clone();
    invalid[0].ordered_ids = true;
    assert!(
        apply(
            &mut doc,
            &mut session,
            Command::DocumentChanges { changes: invalid }
        )
        .is_err()
    );
    let mut invalid = changes.clone();
    invalid[0].path = vec!["unknown_property".into()];
    assert!(
        apply(
            &mut doc,
            &mut session,
            Command::DocumentChanges { changes: invalid }
        )
        .is_err()
    );
    assert_eq!(doc, initial);
    assert_eq!(session.revision(), 0);
    apply(
        &mut doc,
        &mut session,
        Command::DocumentChanges {
            changes: changes.clone(),
        },
    )
    .unwrap();
    let head = doc.clone();
    assert!(apply(&mut doc, &mut session, Command::DocumentChanges { changes }).is_err());
    assert_eq!(doc, head);
    assert_eq!(session.revision(), 1);
}
