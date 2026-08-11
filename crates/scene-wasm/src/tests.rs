use super::*;
use crate::geometry::rotate_around;

#[test]
fn demo_document_has_stable_renderable_nodes() {
    let engine = DocumentEngine::new();
    assert_eq!(engine.rect_count(), 12);
    assert_eq!(engine.scene_data().len(), 12 * FLOATS_PER_RECT);
    assert_eq!(engine.document.pages.len(), 5);
}

#[test]
fn new_pages_nodes_and_colors_use_uuid_v7_ids() {
    let mut document = Document::demo();
    let node = document.add_node(NodeKind::Rectangle);
    let color = document.add_document_color("Blue".into(), "#3366CC".into());
    let page = document.add_page("UUID page".into());
    assert!(
        [node, color, page]
            .iter()
            .all(|id| id.get_version_num() == 7)
    );
    let json = serde_json::to_value(&document).unwrap();
    assert!(json["active_page_id"].is_string());
}

#[test]
fn schema_one_numeric_ids_migrate_deterministically() {
    let mut value = serde_json::json!({
        "schema_version": 1,
        "next_id": 2,
        "active_page_id": 1,
        "pages": [{ "id": 1, "name": "Legacy", "nodes": [] }],
        "color_library": []
    });
    migrate_legacy_document_ids(&mut value);
    let document: Document = serde_json::from_value(value).unwrap();
    assert_eq!(document.schema_version, SCHEMA_VERSION);
    assert_eq!(document.active_page_id, document.pages[0].id);
    document.validate().unwrap();
}

#[test]
fn legacy_radius_migrates_to_four_corners_and_border_defaults() {
    let mut value = serde_json::to_value(Document::demo()).unwrap();
    value["schema_version"] = serde_json::json!(2);
    let node = value["pages"][0]["nodes"][0].as_object_mut().unwrap();
    node.remove("corner_radii");
    node.remove("stroke_align");
    node.remove("stroke_join");
    node.insert("corner_radius".into(), serde_json::json!(7.0));

    migrate_legacy_document_ids(&mut value);
    let document: Document = serde_json::from_value(value).unwrap();
    let node = &document.pages[0].nodes[0];
    assert_eq!(node.corner_radii, [7.0; 4]);
    assert_eq!(node.stroke_align, StrokeAlign::Inside);
    assert_eq!(node.stroke_join, StrokeJoin::Round);
}

#[test]
fn benchmark_pages_are_lazy_and_generate_exact_scene_sizes() {
    let mut document = Document::demo();
    let benchmarks = [
        ("1K Nodes · Baseline", 1_000),
        ("10K Nodes · Large", 10_000),
        ("50K Nodes · Stress", 50_000),
        ("100K Nodes · Extreme", 100_000),
    ];

    for (name, expected_count) in benchmarks {
        let page = document
            .pages
            .iter()
            .find(|page| page.name == name)
            .unwrap();
        assert!(page.nodes.is_empty());
        assert!(!page.description.is_empty());
        let page_id = page.id;

        assert!(document.set_active_page(page_id));
        assert_eq!(document.active_page().nodes.len(), expected_count);
        assert_eq!(
            document.scene_data().len(),
            expected_count * FLOATS_PER_RECT
        );
    }

    document.validate().unwrap();
}

#[test]
fn benchmark_hit_testing_uses_grid_coordinates() {
    let mut document = Document::demo();
    let page_id = document
        .pages
        .iter()
        .find(|page| page.benchmark_node_count == Some(100_000))
        .unwrap()
        .id;
    assert!(document.set_active_page(page_id));
    assert_eq!(
        document.benchmark_hit_test(5.0, 5.0),
        Some(document.active_page().nodes[0].id)
    );
    assert_eq!(document.benchmark_hit_test(14.0, 14.0), Some(Uuid::nil()));
    assert_eq!(document.benchmark_hit_test(-1.0, 5.0), Some(Uuid::nil()));

    let enlarged_id = document.active_page().nodes[0].id;
    assert!(document.set_node_bounds(enlarged_id, 0.0, 0.0, 100.0, 100.0));
    assert_eq!(document.benchmark_hit_test(50.0, 50.0), Some(enlarged_id));
    assert!(document.move_nodes(&[enlarged_id], 1_000.0, 1_000.0));
    assert_eq!(document.benchmark_hit_test(5.0, 5.0), Some(Uuid::nil()));
    assert_eq!(
        document.benchmark_hit_test(1_050.0, 1_050.0),
        Some(enlarged_id)
    );
}

#[test]
fn benchmark_view_scene_only_contains_intersecting_nodes() {
    let mut document = Document::demo();
    let page_id = document
        .pages
        .iter()
        .find(|page| page.benchmark_node_count == Some(100_000))
        .unwrap()
        .id;
    assert!(document.set_active_page(page_id));
    let visible = document.scene_data_for_view(-1.0, -1.0, 100.0, 100.0);
    assert_eq!(visible.len() / FLOATS_PER_RECT, 49);

    let first_id = document.active_page().nodes[0].id;
    assert!(document.move_nodes(&[first_id], 1_000.0, 1_000.0));
    let visible = document.scene_data_for_view(-1.0, -1.0, 100.0, 100.0);
    assert_eq!(visible.len() / FLOATS_PER_RECT, 48);
}

#[test]
fn document_round_trip_is_lossless() {
    let mut engine = DocumentEngine::new();
    engine.add_page("Checkout".into());
    engine.add_frame();
    engine.add_rectangle();
    let json = engine.document_json();
    let decoded: Document = serde_json::from_str(&json).unwrap();
    assert_eq!(decoded, engine.document);
    decoded.validate().unwrap();
}

#[test]
fn deleting_a_frame_removes_its_direct_children() {
    let mut document = Document::demo();
    let frame = document.active_page().nodes[0].id;
    assert!(document.delete_node(frame));
    assert!(
        !document
            .active_page()
            .nodes
            .iter()
            .any(|node| node.parent_id == Some(frame))
    );
}

#[test]
fn deleting_a_container_removes_its_full_descendant_subtree() {
    let mut document = Document::demo();
    let frame = document.active_page().nodes[0].id;
    let children: Vec<_> = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.parent_id == Some(frame))
        .take(2)
        .map(|node| node.id)
        .collect();
    let group = document.group_nodes(&children).unwrap();
    assert!(document.delete_node(frame));
    assert!(document.active_node(group).is_none());
    assert!(
        children
            .iter()
            .all(|id| document.active_node(*id).is_none())
    );
    document.validate().unwrap();
}

#[test]
fn document_validation_rejects_parent_cycles() {
    let mut document = Document::demo();
    let frames: Vec<_> = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.kind == NodeKind::Frame)
        .map(|node| node.id)
        .collect();
    for node in &mut document.active_page_mut().nodes {
        if node.id == frames[0] {
            node.parent_id = Some(frames[1]);
        } else if node.id == frames[1] {
            node.parent_id = Some(frames[0]);
        }
    }
    assert!(document.validate().unwrap_err().contains("parent cycle"));
}

#[test]
fn document_validation_rejects_cross_page_node_ownership() {
    let mut document = Document::demo();
    let duplicate = document.active_page().nodes[0].clone();
    let other_page = document.pages[1].id;
    document
        .pages
        .iter_mut()
        .find(|page| page.id == other_page)
        .unwrap()
        .nodes
        .push(duplicate);
    assert!(
        document
            .validate()
            .unwrap_err()
            .contains("more than one page")
    );
}

#[test]
fn document_validation_rejects_cross_page_and_non_container_parents() {
    let mut cross_page = Document::demo();
    let child = cross_page.active_page().nodes[1].clone();
    cross_page.active_page_mut().nodes.remove(1);
    cross_page.pages[1].nodes.push(child);
    assert!(
        cross_page
            .validate()
            .unwrap_err()
            .contains("parent outside page")
    );

    let mut non_container = Document::demo();
    let rectangle = non_container.active_page().nodes[1].id;
    non_container.active_page_mut().nodes[2].parent_id = Some(rectangle);
    assert!(
        non_container
            .validate()
            .unwrap_err()
            .contains("non-container parent")
    );
}

#[test]
fn invalid_reparenting_does_not_change_document_or_history() {
    let mut engine = DocumentEngine::new();
    let frame = engine.document.active_page().nodes[0].id;
    let descendant = engine.document.active_page().nodes[1].id;
    let before = engine.document.clone();

    assert!(!engine.reorder_node(frame.to_string(), descendant.to_string(), true));
    assert_eq!(engine.document, before);
    assert!(!engine.can_undo());
    engine.document.validate().unwrap();
}

#[test]
fn page_switching_changes_the_render_scene() {
    let mut document = Document::demo();
    let home = document.active_page_id;
    let page = document.add_page("Empty".into());
    assert!(document.scene_data().is_empty());
    document.add_node(NodeKind::Rectangle);
    assert_eq!(document.scene_data().len(), FLOATS_PER_RECT);
    assert!(document.set_active_page(home));
    assert_ne!(document.active_page_id, page);
}

#[test]
fn a_group_moves_its_children_as_one_unit() {
    let mut document = Document::demo();
    let ids = [
        document.active_page().nodes[1].id,
        document.active_page().nodes[2].id,
    ];
    let before = document.active_page().nodes[1].x;
    let group = document.group_nodes(&ids).unwrap();
    assert!(document.move_nodes(&[group], 25.0, -10.0));
    assert_eq!(document.active_page().nodes[1].x, before + 25.0);
    assert!(
        document
            .active_page()
            .nodes
            .iter()
            .filter(|node| ids.contains(&node.id))
            .all(|node| node.parent_id == Some(group))
    );
}

#[test]
fn layers_can_be_reordered_above_and_below_siblings() {
    let mut document = Document::demo();
    let first = document.active_page().nodes[1].id;
    let second = document.active_page().nodes[2].id;
    assert!(document.reorder_node(first, second, false));
    let page = document.active_page();
    let first_index = page.nodes.iter().position(|node| node.id == first).unwrap();
    let second_index = page
        .nodes
        .iter()
        .position(|node| node.id == second)
        .unwrap();
    assert_eq!(first_index, second_index + 1);
    assert_eq!(
        page.nodes[first_index].parent_id,
        page.nodes[second_index].parent_id
    );
}

#[test]
fn hit_testing_returns_the_topmost_node() {
    let engine = DocumentEngine::new();
    let hit = engine.hit_test(130.0, 210.0);
    let expected = engine
        .document
        .active_page()
        .nodes
        .iter()
        .rev()
        .find(|node| {
            130.0 >= node.x
                && 210.0 >= node.y
                && 130.0 <= node.x + node.width
                && 210.0 <= node.y + node.height
        })
        .unwrap();
    assert_eq!(hit, expected.id.to_string());
    assert_eq!(engine.hit_test(-100.0, -100.0), "");
}

#[test]
fn artboards_use_requested_dimensions_and_do_not_overlap() {
    let mut document = Document::demo();
    let first = document.add_artboard("Mobile 390".into(), 390.0, 844.0);
    let second = document.add_artboard("Desktop 1440".into(), 1440.0, 900.0);
    let first = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == first)
        .unwrap();
    let second = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == second)
        .unwrap();
    assert_eq!((first.width, first.height), (390.0, 844.0));
    assert!(second.x >= first.x + first.width + 80.0);
}

#[test]
fn node_styles_are_clamped_and_serialized() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[1].id;
    assert!(document.set_node_style(
        id,
        [1.0, 0.0, 0.5, 1.0],
        [0.0, 0.0, 0.0, 1.0],
        4.0,
        [1_000.0; 4],
        StrokeAlign::Outside,
        StrokeJoin::Straight,
    ));
    let node = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == id)
        .unwrap();
    assert_eq!(node.stroke_width, 4.0);
    assert_eq!(node.corner_radii, [node.width.min(node.height) / 2.0; 4]);
    assert_eq!(node.stroke_align, StrokeAlign::Outside);
    assert_eq!(node.stroke_join, StrokeJoin::Straight);
    assert!(
        serde_json::to_string(&document)
            .unwrap()
            .contains("corner_radii")
    );
}

#[test]
fn corner_resize_updates_bounds_and_enforces_minimum_size() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[1].id;
    let before = document.active_page().nodes[1].clone();
    assert!(document.resize_node(id, "se", 20.0, 15.0));
    let node = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == id)
        .unwrap();
    assert_eq!(node.width, before.width + 20.0);
    assert_eq!(node.height, before.height + 15.0);
    assert!(document.resize_node(id, "nw", 10_000.0, 10_000.0));
    let node = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == id)
        .unwrap();
    assert_eq!((node.width, node.height), (8.0, 8.0));
}

#[test]
fn numeric_bounds_are_editable_and_validated() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[1].id;
    assert!(document.set_node_bounds(id, -24.0, 42.0, 200.0, 3.0));
    let node = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == id)
        .unwrap();
    assert_eq!(
        (node.x, node.y, node.width, node.height),
        (-24.0, 42.0, 200.0, 8.0)
    );
    assert!(!document.set_node_bounds(id, f32::NAN, 0.0, 10.0, 10.0));
}

#[test]
fn locked_nodes_reject_edits_and_canvas_hit_testing() {
    let mut engine = DocumentEngine::new();
    let id = engine.document.active_page().nodes[2].id;
    let point = {
        let node = engine
            .document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == id)
            .unwrap();
        (node.x + 2.0, node.y + 2.0)
    };
    assert!(engine.set_node_locked(id.to_string(), true));
    assert!(!engine.document.move_nodes(&[id], 10.0, 10.0));
    assert!(!engine.document.resize_node(id, "se", 10.0, 10.0));
    assert_ne!(engine.hit_test(point.0, point.1), id.to_string());
    assert!(engine.set_node_locked(id.to_string(), false));
    assert!(engine.document.move_nodes(&[id], 10.0, 10.0));
}

#[test]
fn opacity_is_clamped_and_locked_nodes_reject_changes() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[1].id;
    assert!(document.set_node_opacity(id, 1.5));
    assert_eq!(document.active_page().nodes[1].opacity, 1.0);
    assert!(document.set_node_opacity(id, -0.2));
    assert_eq!(document.active_page().nodes[1].opacity, 0.0);
    assert!(document.set_node_locked(id, true));
    assert!(!document.set_node_opacity(id, 0.5));
}

#[test]
fn multiple_outer_and_inner_shadows_are_serialized_and_rendered() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[1].id;
    let base_rects = document.scene_data().len() / FLOATS_PER_RECT;
    let shadows = vec![
        Shadow {
            kind: ShadowKind::Outer,
            color: [0.0, 0.0, 0.0, 0.25],
            offset_x: 0.0,
            offset_y: 8.0,
            blur: 16.0,
            spread: 0.0,
            enabled: true,
        },
        Shadow {
            kind: ShadowKind::Inner,
            color: [0.0, 0.0, 0.0, 0.4],
            offset_x: 0.0,
            offset_y: 2.0,
            blur: 4.0,
            spread: 0.0,
            enabled: true,
        },
    ];
    assert!(document.set_node_shadows(id, shadows.clone()));
    assert_eq!(document.active_page().nodes[1].shadows, shadows);
    assert_eq!(
        document.scene_data().len() / FLOATS_PER_RECT,
        base_rects + 2
    );
    let json = serde_json::to_string(&document).unwrap();
    let restored: Document = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.active_page().nodes[1].shadows.len(), 2);
}

#[test]
fn rotation_and_flips_are_normalized_and_persisted() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[1].id;
    assert!(document.set_node_transform(id, 450.0, true, true));
    let node = &document.active_page().nodes[1];
    assert_eq!(node.rotation, 90.0);
    assert!(node.flip_x && node.flip_y);
    let json = serde_json::to_string(&document).unwrap();
    let restored: Document = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.active_page().nodes[1].rotation, 90.0);
}

#[test]
fn resizing_a_rotated_node_keeps_the_opposite_visual_corner_fixed() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[1].id;
    assert!(document.set_node_transform(id, 180.0, false, false));
    let before = document.active_page().nodes[1].clone();
    let fixed_before = rotate_around(
        (before.x, before.y),
        (
            before.x + before.width / 2.0,
            before.y + before.height / 2.0,
        ),
        before.rotation.to_radians(),
    );
    assert!(document.resize_node(id, "se", 20.0, 15.0));
    let after = &document.active_page().nodes[1];
    let fixed_after = rotate_around(
        (after.x, after.y),
        (after.x + after.width / 2.0, after.y + after.height / 2.0),
        after.rotation.to_radians(),
    );
    assert!((fixed_before.0 - fixed_after.0).abs() < 0.001);
    assert!((fixed_before.1 - fixed_after.1).abs() < 0.001);
    assert_eq!(after.width, before.width + 20.0);
    assert_eq!(after.height, before.height + 15.0);
}

#[test]
fn row_and_column_layout_reflow_group_children_with_gap_and_padding() {
    let mut document = Document::demo();
    let ids = [
        document.active_page().nodes[4].id,
        document.active_page().nodes[5].id,
    ];
    let group_id = document.group_nodes(&ids).unwrap();
    assert!(document.set_node_layout(
        group_id,
        LayoutMode::Row,
        LayoutAlign::Center,
        LayoutAlign::Start,
        12.0,
        [8.0, 6.0, 8.0, 10.0]
    ));
    let group = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == group_id)
        .unwrap();
    let children: Vec<_> = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.parent_id == Some(group_id))
        .collect();
    assert_eq!(children[0].x, group.x + 10.0);
    assert_eq!(children[1].x, children[0].x + children[0].width + 12.0);
    assert!(document.set_node_layout(
        group_id,
        LayoutMode::Column,
        LayoutAlign::End,
        LayoutAlign::Start,
        5.0,
        [7.0, 9.0, 3.0, 2.0]
    ));
    let group = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == group_id)
        .unwrap();
    let children: Vec<_> = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.parent_id == Some(group_id))
        .collect();
    assert_eq!(children[0].y, group.y + 7.0);
    assert_eq!(children[1].y, children[0].y + children[0].height + 5.0);
    assert_eq!(
        children[0].x,
        group.x + group.width - 9.0 - children[0].width
    );
    assert!(document.set_node_width_sizing(ids[0], LayoutSizing::Fill));
    let group = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == group_id)
        .unwrap();
    let child = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == ids[0])
        .unwrap();
    assert_eq!(child.width, group.width - 2.0 - 9.0);
    let expected_height = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.parent_id == Some(group_id))
        .map(|node| node.height)
        .sum::<f32>()
        + 5.0
        + 7.0
        + 3.0;
    assert!(document.set_node_auto_height(group_id, true));
    let group = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == group_id)
        .unwrap();
    assert_eq!(group.height, expected_height);
}

#[test]
fn artboard_guides_store_grid_and_column_configuration() {
    let mut document = Document::demo();
    let artboard_id = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.kind == NodeKind::Frame)
        .unwrap()
        .id;
    assert!(document.set_artboard_guide(
        artboard_id,
        GuideMode::Columns,
        12,
        24.0,
        [0.2, 0.4, 1.0, 1.0],
        0.2
    ));
    let artboard = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.id == artboard_id)
        .unwrap();
    assert_eq!(artboard.guide_mode, GuideMode::Columns);
    assert_eq!(artboard.guide_count, 12);
    assert_eq!(artboard.guide_gap, 24.0);
    assert_eq!(artboard.guide_opacity, 0.2);
    let json = serde_json::to_string(&document).unwrap();
    let restored: Document = serde_json::from_str(&json).unwrap();
    assert_eq!(
        restored
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == artboard_id)
            .unwrap()
            .guide_mode,
        GuideMode::Columns
    );
}

#[test]
fn new_and_dragged_nodes_are_parented_to_their_artboard() {
    let mut document = Document::demo();
    let artboards: Vec<_> = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.kind == NodeKind::Frame && node.parent_id.is_none())
        .cloned()
        .collect();
    let first = &artboards[0];
    let second = &artboards[1];
    let id = document.add_rectangle_to(Some(second.id));
    assert_eq!(
        document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == id)
            .unwrap()
            .parent_id,
        Some(second.id)
    );
    assert!(document.set_node_bounds(id, first.x + 20.0, first.y + 20.0, 40.0, 40.0));
    assert!(document.reparent_nodes_to_artboards(&[id]));
    assert_eq!(
        document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == id)
            .unwrap()
            .parent_id,
        Some(first.id)
    );
    assert!(document.set_node_bounds(id, -500.0, -500.0, 40.0, 40.0));
    assert!(document.reparent_nodes_to_artboards(&[id]));
    assert_eq!(
        document
            .active_page()
            .nodes
            .iter()
            .find(|node| node.id == id)
            .unwrap()
            .parent_id,
        None
    );
}

#[test]
fn reparented_children_render_above_the_destination_artboard() {
    let mut document = Document::demo();
    let artboards: Vec<_> = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.kind == NodeKind::Frame && node.parent_id.is_none())
        .cloned()
        .collect();
    let moved_id = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.parent_id == Some(artboards[0].id))
        .unwrap()
        .id;
    assert!(document.set_node_bounds(
        moved_id,
        artboards[1].x + 10.0,
        artboards[1].y + 10.0,
        40.0,
        40.0
    ));
    assert!(document.reparent_nodes_to_artboards(&[moved_id]));
    let order: Vec<_> = ordered_nodes(document.active_page())
        .into_iter()
        .map(|node| node.id)
        .collect();
    let artboard_index = order.iter().position(|id| *id == artboards[1].id).unwrap();
    let child_index = order.iter().position(|id| *id == moved_id).unwrap();
    assert!(child_index > artboard_index);
}

#[test]
fn document_color_library_deduplicates_normalized_colors() {
    let mut document = Document::demo();
    let first = document.add_document_color("Brand".into(), "#82E6B8".into());
    let second = document.add_document_color("Duplicate".into(), "#82E6B8".into());
    assert_eq!(first, second);
    assert_eq!(document.color_library.len(), 1);
    assert_eq!(document.color_library[0].name, "Brand");
}

#[test]
fn undo_redo_and_transactions_restore_document_states() {
    let mut engine = DocumentEngine::new();
    let id = engine.document.active_page().nodes[1].id;
    let original_x = engine.document.active_page().nodes[1].x;
    engine.begin_transaction();
    let selection = serde_json::to_string(&[id]).unwrap();
    engine.move_nodes(&selection, 5.0, 0.0).unwrap();
    engine.move_nodes(&selection, 7.0, 0.0).unwrap();
    engine.end_transaction();
    assert_eq!(engine.document.active_page().nodes[1].x, original_x + 12.0);
    assert!(engine.undo());
    assert_eq!(engine.document.active_page().nodes[1].x, original_x);
    assert!(engine.redo());
    assert_eq!(engine.document.active_page().nodes[1].x, original_x + 12.0);
    assert!(!engine.redo());
}

#[test]
fn compact_style_history_restores_node_without_document_snapshots() {
    let mut engine = DocumentEngine::new();
    let node = engine.document.active_page().nodes[1].clone();
    assert!(
        engine
            .set_node_style(
                node.id.to_string(),
                "#3366CC".into(),
                "#000000".into(),
                3.0,
                4.0,
                8.0,
                12.0,
                16.0,
                "outside".into(),
                "straight".into(),
            )
            .unwrap()
    );
    assert!(matches!(
        engine.undo_stack.last(),
        Some(HistoryEntry::NodeStyle { .. })
    ));
    assert!(engine.undo());
    assert_eq!(
        engine.document.active_page().nodes[1].corner_radii,
        node.corner_radii
    );
    assert!(engine.redo());
    assert_eq!(
        engine.document.active_page().nodes[1].corner_radii,
        [4.0, 8.0, 12.0, 16.0]
    );
    assert_eq!(
        engine.document.active_page().nodes[1].stroke_align,
        StrokeAlign::Outside
    );
    assert_eq!(
        engine.document.active_page().nodes[1].stroke_join,
        StrokeJoin::Straight
    );
}

#[test]
fn benchmark_geometry_transaction_uses_compact_history() {
    let mut engine = DocumentEngine::new();
    let benchmark_page_id = engine.document.pages[1].id;
    assert!(engine.document.set_active_page(benchmark_page_id));
    let node = engine.document.active_page().nodes[0].clone();
    engine
        .begin_geometry_transaction(&serde_json::to_string(&[node.id]).unwrap())
        .unwrap();
    assert!(
        engine
            .move_nodes(&serde_json::to_string(&[node.id]).unwrap(), 31.0, 7.0)
            .unwrap()
    );
    engine.end_transaction();
    assert!(matches!(
        engine.undo_stack.last(),
        Some(HistoryEntry::Geometry { nodes, .. }) if nodes.len() == 1
    ));
    assert!(engine.undo());
    let restored = &engine.document.active_page().nodes[0];
    assert_eq!((restored.x, restored.y), (node.x, node.y));
    assert!(engine.redo());
    let redone = &engine.document.active_page().nodes[0];
    assert_eq!((redone.x, redone.y), (node.x + 31.0, node.y + 7.0));
}

#[test]
fn benchmark_group_move_and_undo_include_children() {
    let mut engine = DocumentEngine::new();
    let benchmark_page_id = engine.document.pages[1].id;
    assert!(engine.document.set_active_page(benchmark_page_id));
    let child_ids = [
        engine.document.active_page().nodes[0].id,
        engine.document.active_page().nodes[1].id,
    ];
    let original_positions: Vec<_> = child_ids
        .iter()
        .map(|id| {
            let node = engine.document.active_node(*id).unwrap();
            (node.x, node.y)
        })
        .collect();
    let group_id = engine.document.group_nodes(&child_ids).unwrap();
    engine
        .begin_geometry_transaction(&serde_json::to_string(&[group_id]).unwrap())
        .unwrap();
    assert!(
        engine
            .move_nodes(&serde_json::to_string(&[group_id]).unwrap(), 20.0, 15.0)
            .unwrap()
    );
    engine.end_transaction();
    assert!(matches!(
        engine.undo_stack.last(),
        Some(HistoryEntry::Geometry { nodes, .. }) if nodes.len() == 3
    ));
    for (index, id) in child_ids.iter().enumerate() {
        let node = engine.document.active_node(*id).unwrap();
        assert_eq!(
            (node.x, node.y),
            (
                original_positions[index].0 + 20.0,
                original_positions[index].1 + 15.0
            )
        );
    }
    assert!(engine.undo());
    for (index, id) in child_ids.iter().enumerate() {
        let node = engine.document.active_node(*id).unwrap();
        assert_eq!((node.x, node.y), original_positions[index]);
    }
}

#[test]
fn selected_nodes_align_to_their_combined_bounds() {
    let mut document = Document::demo();
    let ids = [
        document.active_page().nodes[4].id,
        document.active_page().nodes[5].id,
    ];
    assert!(document.align_nodes(&ids, "top"));
    let nodes: Vec<_> = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| ids.contains(&node.id))
        .collect();
    assert_eq!(nodes[0].y, nodes[1].y);
    assert!(document.align_nodes(&ids, "left"));
    assert_eq!(
        document.active_page().nodes[4].x,
        document.active_page().nodes[5].x
    );
}
