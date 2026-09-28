use super::*;
use crate::geometry::rotate_around;

#[test]
fn demo_document_has_stable_renderable_nodes() {
    let engine = DocumentEngine::new();
    assert!(engine.rect_count() >= 40);
    assert_eq!(
        engine.scene_data().len(),
        engine.rect_count() * FLOATS_PER_RECT
    );
    assert_eq!(engine.document.pages.len(), 5);
    for name in [
        "Finance · Welcome",
        "Finance · Wallet",
        "Finance · Analytics",
        "Finance · Goals",
    ] {
        assert!(
            engine
                .document
                .active_page()
                .nodes
                .iter()
                .any(|node| node.name == name && node.kind == NodeKind::Frame)
        );
    }
    assert_eq!(engine.document.text_styles.len(), 8);
    assert_eq!(engine.document.media_assets.len(), 18);
    assert_eq!(engine.document.components.len(), 6);
    for name in [
        "Button / Primary",
        "Card / Spending summary",
        "Card / Goal progress",
    ] {
        assert!(
            engine
                .document
                .components
                .iter()
                .any(|component| component.name == name)
        );
    }
    assert!(engine.document.active_page().nodes.iter().any(|node| {
        node.text_style_id.is_some()
            && node.text.is_some()
            && node.variable_bindings == VariableBindings::default()
    }));
    assert!(engine.document.active_page().nodes.iter().any(|node| {
        node.variable_bindings.width.is_some() || node.variable_bindings.gap.is_some()
    }));
}

#[test]
fn blank_document_starts_with_one_empty_page() {
    let engine = DocumentEngine::new_blank();
    assert_eq!(engine.document.pages.len(), 1);
    assert_eq!(engine.document.active_page().name, "Page 1");
    assert!(engine.document.active_page().nodes.is_empty());
    assert!(!engine.can_undo());
}

#[test]
fn media_assets_create_reusable_non_rectangle_nodes() {
    let mut document = Document::demo();
    let original_rectangles = document.scene_data().len();
    let image_node_id = document
        .add_media_asset_node(
            MediaAssetKind::Image,
            "House.jpg".into(),
            "image/jpeg".into(),
            "data:image/jpeg;base64,AA==".into(),
            1200,
            800,
            None,
        )
        .unwrap();
    let image = document.active_node(image_node_id).unwrap();
    assert_eq!(image.kind, NodeKind::Image);
    assert_eq!(image.image_fit, ImageFit::Cover);
    let asset_id = image.asset_id.unwrap();
    assert_eq!(
        document
            .media_assets
            .iter()
            .find(|asset| asset.id == asset_id)
            .unwrap()
            .kind,
        MediaAssetKind::Image
    );

    let reused_node_id = document.add_node_from_asset(asset_id, None).unwrap();
    assert_eq!(
        document.active_node(reused_node_id).unwrap().asset_id,
        Some(asset_id)
    );
    assert_eq!(document.scene_data().len(), original_rectangles);
    document.validate().unwrap();
    let restored: Document =
        serde_json::from_str(&serde_json::to_string(&document).unwrap()).unwrap();
    assert_eq!(restored.media_assets, document.media_assets);
}

#[test]
fn demo_mobile_artboard_uses_nested_auto_layout_groups() {
    let document = Document::demo();
    let page = document.active_page();
    let mobile = page
        .nodes
        .iter()
        .find(|node| node.name == "Finance · Wallet")
        .unwrap();
    assert_eq!(mobile.kind, NodeKind::Frame);
    let sections: Vec<_> = page
        .nodes
        .iter()
        .filter(|node| node.parent_id == Some(mobile.id))
        .collect();
    assert!(sections.iter().any(|node| node.kind == NodeKind::Group));
    for name in [
        "Wallet content · Auto layout",
        "Cards · Auto layout",
        "Quick actions · Auto layout",
        "Bottom navigation · Auto layout",
    ] {
        assert_ne!(
            page.nodes
                .iter()
                .find(|node| node.name == name)
                .unwrap()
                .layout_mode,
            LayoutMode::None
        );
    }
}

#[test]
fn clicking_nested_demo_element_keeps_its_group_parent() {
    let mut document = Document::demo();
    let hero = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Action label")
        .unwrap()
        .clone();
    assert!(!document.reparent_nodes_to_artboards(&[hero.id]));
    assert_eq!(
        document.active_node(hero.id).unwrap().parent_id,
        hero.parent_id
    );
}

#[test]
fn groups_render_when_they_have_a_fill_or_border() {
    let mut document = Document::demo();
    let group_id = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Wallet content · Auto layout")
        .unwrap()
        .id;
    let base_rects = document.scene_data().len() / FLOATS_PER_RECT;
    assert!(document.set_node_style(
        group_id,
        [0.2, 0.3, 0.4, 0.8],
        [0.8, 0.9, 1.0, 1.0],
        2.0,
        [12.0; 4],
        StrokeAlign::Inside,
        StrokeJoin::Round,
    ));
    assert_eq!(
        document.scene_data().len() / FLOATS_PER_RECT,
        base_rects + 1
    );
}

#[test]
fn number_variables_bind_and_propagate_layout_values() {
    let mut document = Document::demo();
    let card_content = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Wallet content · Auto layout")
        .unwrap()
        .id;
    let variable_id = document
        .add_number_variable("Spacing / Card".into(), 18.0)
        .unwrap();
    assert!(document.bind_node_variable(card_content, "gap", Some(variable_id)));
    assert_eq!(document.active_node(card_content).unwrap().layout_gap, 18.0);
    assert!(document.update_number_variable(variable_id, "Spacing / Card".into(), 24.0));
    let node = document.active_node(card_content).unwrap();
    assert_eq!(node.layout_gap, 24.0);
    assert_eq!(node.variable_bindings.gap, Some(variable_id));
    let restored: Document =
        serde_json::from_str(&serde_json::to_string(&document).unwrap()).unwrap();
    restored.validate().unwrap();
    assert_eq!(
        restored
            .number_variables
            .iter()
            .find(|variable| variable.id == variable_id)
            .unwrap()
            .value,
        24.0
    );
}

#[test]
fn text_style_updates_every_linked_text_node() {
    let mut document = Document::demo();
    let text_ids: Vec<_> = ["Greeting", "Greeting subtitle"]
        .map(|name| {
            document
                .active_page()
                .nodes
                .iter()
                .find(|node| node.name == name)
                .unwrap()
                .id
        })
        .into();
    let mut style = TypographyStyle::from(
        document
            .active_node(text_ids[0])
            .unwrap()
            .text
            .as_ref()
            .unwrap(),
    );
    style.font_size = 36.0;
    let style_id = document.add_text_style("Hero / Display".into(), style.clone());
    for id in &text_ids {
        assert!(document.bind_node_text_style(*id, Some(style_id)));
    }
    let original_content = document
        .active_node(text_ids[1])
        .unwrap()
        .text
        .as_ref()
        .unwrap()
        .content
        .clone();
    style.font_family = "Georgia".into();
    style.font_size = 42.0;
    style.line_height = 1.6;
    style.letter_spacing = 1.5;
    style.horizontal_align = TextAlign::Center;
    style.vertical_align = TextVerticalAlign::Middle;
    style.font_style = FontStyle::Italic;
    style.sizing = TextSizing::Fixed;
    assert!(document.update_text_style(style_id, "Hero / Display".into(), style));
    for id in text_ids {
        let node = document.active_node(id).unwrap();
        assert_eq!(node.text_style_id, Some(style_id));
        assert_eq!(node.text.as_ref().unwrap().font_size, 42.0);
        assert_eq!(node.text.as_ref().unwrap().font_family, "Georgia");
        assert_eq!(node.text.as_ref().unwrap().line_height, 1.6);
        assert_eq!(node.text.as_ref().unwrap().letter_spacing, 1.5);
        assert_eq!(
            node.text.as_ref().unwrap().horizontal_align,
            TextAlign::Center
        );
        assert_eq!(
            node.text.as_ref().unwrap().vertical_align,
            TextVerticalAlign::Middle
        );
        assert_eq!(node.text.as_ref().unwrap().font_style, FontStyle::Italic);
        assert_eq!(node.text.as_ref().unwrap().sizing, TextSizing::Fixed);
    }
    assert_eq!(
        document
            .active_node(
                document
                    .active_page()
                    .nodes
                    .iter()
                    .find(|node| node.name == "Greeting subtitle")
                    .unwrap()
                    .id,
            )
            .unwrap()
            .text
            .as_ref()
            .unwrap()
            .content,
        original_content
    );
}

#[test]
fn direct_typography_edit_can_override_a_linked_text_style_after_unbinding() {
    let mut document = Document::demo();
    let node_id = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Greeting")
        .unwrap()
        .id;
    assert!(
        document
            .active_node(node_id)
            .unwrap()
            .text_style_id
            .is_some()
    );
    assert!(document.bind_node_text_style(node_id, None));
    let mut text = document.active_node(node_id).unwrap().text.clone().unwrap();
    text.horizontal_align = TextAlign::Center;
    assert!(document.set_node_text(node_id, text));
    let node = document.active_node(node_id).unwrap();
    assert_eq!(node.text_style_id, None);
    assert_eq!(
        node.text.as_ref().unwrap().horizontal_align,
        TextAlign::Center
    );
}

#[test]
fn component_instances_sync_source_and_preserve_text_overrides() {
    let mut engine = DocumentEngine::new();
    let root_id = engine
        .document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Wallet content · Auto layout")
        .unwrap()
        .id;
    let component_id = engine.create_component(root_id.to_string(), "Wallet content".into());
    let component_id = parse_entity_id(&component_id);
    let variant_id = engine
        .document
        .components
        .iter()
        .find(|component| component.id == component_id)
        .unwrap()
        .variants[0]
        .id;
    let instance_id = engine.create_component_instance(
        component_id.to_string(),
        variant_id.to_string(),
        String::new(),
    );
    let instance_id = parse_entity_id(&instance_id);
    let source_greeting = engine
        .document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Greeting" && node.instance_root_id.is_none())
        .unwrap()
        .clone();
    let instance_greeting = engine
        .document
        .active_page()
        .nodes
        .iter()
        .find(|node| {
            node.instance_root_id == Some(instance_id)
                && node.component_slot_id == Some(source_greeting.id)
        })
        .unwrap()
        .clone();
    let mut override_text = instance_greeting.text.clone().unwrap();
    override_text.content = "Hi, Maya".into();
    engine
        .set_node_text(
            instance_greeting.id.to_string(),
            &serde_json::to_string(&override_text).unwrap(),
        )
        .unwrap();
    let mut source_text = source_greeting.text.clone().unwrap();
    source_text.content = "Hi, updated source".into();
    source_text.font_size = 22.0;
    engine
        .set_node_text(
            source_greeting.id.to_string(),
            &serde_json::to_string(&source_text).unwrap(),
        )
        .unwrap();
    let instance = engine.document.active_node(instance_greeting.id).unwrap();
    assert_eq!(instance.text.as_ref().unwrap().content, "Hi, Maya");
    assert!(instance.text_override);
}

#[test]
fn component_instances_sync_when_source_edit_commits_a_transaction() {
    let mut engine = DocumentEngine::new();
    let component = engine
        .document
        .components
        .iter()
        .find(|component| component.name == "Button / Primary")
        .unwrap()
        .clone();
    let source_id = component.variants[0].source_root_id;
    let instance_id = parse_entity_id(&engine.create_component_instance(
        component.id.to_string(),
        component.variants[0].id.to_string(),
        String::new(),
    ));
    let source = engine.document.active_node(source_id).unwrap().clone();
    engine.begin_transaction();
    assert!(engine.set_node_bounds(
        source_id.to_string(),
        source.x,
        source.y,
        source.width + 24.0,
        source.height,
    ));
    engine.end_transaction();
    assert_eq!(
        engine.document.active_node(instance_id).unwrap().width,
        source.width + 24.0
    );
}

#[test]
fn component_instance_background_syncs_through_compact_style_history() {
    let mut engine = DocumentEngine::new();
    let component = engine
        .document
        .components
        .iter()
        .find(|component| component.name == "Button / Primary")
        .unwrap()
        .clone();
    let source_id = component.variants[0].source_root_id;
    let instance_id = parse_entity_id(&engine.create_component_instance(
        component.id.to_string(),
        component.variants[0].id.to_string(),
        String::new(),
    ));
    assert!(
        engine
            .set_node_style(
                source_id.to_string(),
                "#CC3366".into(),
                "#000000".into(),
                0.0,
                22.0,
                22.0,
                22.0,
                22.0,
                "inside".into(),
                "round".into(),
            )
            .unwrap()
    );
    assert_eq!(
        engine.document.active_node(instance_id).unwrap().fill,
        [0.8, 0.2, 0.4, 1.0]
    );
    assert!(engine.undo());
    assert_eq!(
        engine.document.active_node(instance_id).unwrap().fill,
        engine.document.active_node(source_id).unwrap().fill
    );
}

#[test]
fn duplicate_nodes_clones_groups_and_component_instances() {
    let mut document = Document::demo();
    let component = document.components[0].clone();
    let instance = document
        .create_component_instance(component.id, component.variants[0].id, None)
        .unwrap();
    let before = document.active_page().nodes.len();
    let duplicates = document.duplicate_nodes(&[instance]);
    assert_eq!(duplicates.len(), 1);
    let duplicate = document.active_node(duplicates[0]).unwrap();
    assert_eq!(duplicate.component_id, Some(component.id));
    assert_eq!(duplicate.instance_root_id, Some(duplicate.id));
    assert!(document.active_page().nodes.len() > before + 1);
    document.validate().unwrap();
}

#[test]
fn adding_an_icon_to_a_component_master_updates_existing_instances() {
    let mut engine = DocumentEngine::new();
    let component = engine
        .document
        .components
        .iter()
        .find(|component| component.name == "Button / Primary")
        .unwrap()
        .clone();
    let source_root = component.variants[0].source_root_id;
    let instance_root = parse_entity_id(&engine.create_component_instance(
        component.id.to_string(),
        component.variants[0].id.to_string(),
        String::new(),
    ));
    let icon_asset = engine
        .document
        .media_assets
        .iter()
        .find(|asset| asset.kind == MediaAssetKind::Icon)
        .unwrap()
        .id;
    let source_icon = parse_entity_id(
        &engine.add_node_from_asset(icon_asset.to_string(), source_root.to_string()),
    );
    assert_eq!(
        engine
            .document
            .active_node(source_icon)
            .unwrap()
            .component_slot_id,
        Some(source_icon)
    );
    assert!(engine.document.active_page().nodes.iter().any(|node| {
        node.instance_root_id == Some(instance_root)
            && node.component_slot_id == Some(source_icon)
            && node.kind == NodeKind::Icon
    }));
    engine.document.validate().unwrap();
}

#[test]
fn component_variant_can_be_duplicated_for_editing() {
    let mut document = Document::demo();
    let root_id = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Wallet content · Auto layout")
        .unwrap()
        .id;
    let component_id = document.create_component(root_id, "Button".into()).unwrap();
    let default_variant_id = document
        .components
        .iter()
        .find(|component| component.id == component_id)
        .unwrap()
        .variants[0]
        .id;
    let variant_root_id = document
        .duplicate_component_variant(component_id, default_variant_id, "Secondary".into())
        .unwrap();
    let component = document
        .components
        .iter()
        .find(|component| component.id == component_id)
        .unwrap();
    assert_eq!(component.variants.len(), 2);
    assert_eq!(component.variants[1].name, "Secondary");
    assert_eq!(component.variants[1].source_root_id, variant_root_id);
    let variant_root = document.active_node(variant_root_id).unwrap();
    assert_eq!(variant_root.component_id, Some(component_id));
    assert_ne!(variant_root.x, document.active_node(root_id).unwrap().x);
    document.validate().unwrap();
}

#[test]
fn a_single_shape_layer_can_become_a_component() {
    let mut document = Document::demo();
    let rectangle = document.add_node(NodeKind::Rectangle);
    let component_id = document
        .create_component(rectangle, "Icon background".into())
        .unwrap();
    let component = document
        .components
        .iter()
        .find(|component| component.id == component_id)
        .unwrap();
    let instance = document
        .create_component_instance(component_id, component.variants[0].id, None)
        .unwrap();
    assert_eq!(
        document.active_node(rectangle).unwrap().component_id,
        Some(component_id)
    );
    assert_eq!(
        document.active_node(instance).unwrap().component_id,
        Some(component_id)
    );
    document.validate().unwrap();
}

#[test]
fn new_pages_nodes_and_colors_use_uuid_v7_ids() {
    let mut document = Document::demo();
    let node = document.add_node(NodeKind::Rectangle);
    let color = document.add_document_color("Blue".into(), "#3366CC".into());
    let variable = document
        .add_number_variable("Spacing".into(), 16.0)
        .unwrap();
    let style =
        document.add_text_style("Body".into(), TypographyStyle::from(&TextStyle::default()));
    let page = document.add_page("UUID page".into());
    assert!(
        [node, color, variable, style, page]
            .iter()
            .all(|id| id.get_version_num() == 7)
    );
    let json = serde_json::to_value(&document).unwrap();
    assert!(json["active_page_id"].is_string());
}

#[test]
fn figma_import_appends_editable_pages_and_preserves_hierarchy() {
    let mut engine = DocumentEngine::new();
    let page_id = engine
        .import_figma_json(
            r#"{
                "name":"Imported design",
                "assets":[],
                "pages":[{
                    "name":"Figma screen",
                    "nodes":[
                        {"source_id":"1:1","name":"Phone","kind":"frame","x":80,"y":80,"width":375,"height":812,"fill":[1,1,1,1],"stroke":[0,0,0,0],"stroke_width":0,"corner_radii":[24,24,24,24],"stroke_align":"inside","opacity":1,"rotation":0,"layout_mode":"column","layout_gap":16,"layout_padding":[24,24,24,24]},
                        {"source_id":"1:2","parent_source_id":"1:1","name":"Heading","kind":"text","x":24,"y":24,"width":200,"height":40,"fill":[0,0,0,1],"stroke":[0,0,0,0],"stroke_width":0,"corner_radii":[0,0,0,0],"stroke_align":"inside","opacity":1,"rotation":0,"layout_mode":"none","layout_gap":0,"layout_padding":[0,0,0,0],"text":{"content":"Tasks","font_family":"Inter","font_weight":700,"font_size":32,"line_height":1.2,"letter_spacing":0,"horizontal_align":"left","vertical_align":"top","font_style":"normal","sizing":"fixed"}}
                    ]
                }]
            }"#,
        )
        .expect("Figma payload imports");
    let model: serde_json::Value = serde_json::from_str(&engine.read_model_json()).unwrap();
    assert_eq!(model["active_page_id"], page_id);
    assert_eq!(
        model["pages"].as_array().unwrap().last().unwrap()["name"],
        "Figma screen"
    );
    let nodes = model["nodes"].as_array().unwrap();
    assert_eq!(nodes.len(), 2);
    assert_eq!(nodes[1]["parent_id"], nodes[0]["id"]);
    assert_eq!(nodes[1]["text"]["content"], "Tasks");
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
fn schema_three_text_placeholders_gain_default_typography() {
    let mut value = serde_json::to_value(Document::demo()).unwrap();
    value["schema_version"] = serde_json::json!(3);
    let node = value["pages"][0]["nodes"][0].as_object_mut().unwrap();
    node.insert("kind".into(), serde_json::json!("text"));
    node.remove("text");
    migrate_legacy_document_ids(&mut value);
    let document: Document = serde_json::from_value(value).unwrap();
    assert_eq!(
        document.pages[0].nodes[0].text.as_ref().unwrap(),
        &TextStyle::default()
    );
}

#[test]
fn schema_four_documents_gain_empty_token_collections_and_bindings() {
    let mut value = serde_json::to_value(Document::demo()).unwrap();
    value["schema_version"] = serde_json::json!(4);
    value.as_object_mut().unwrap().remove("number_variables");
    value.as_object_mut().unwrap().remove("text_styles");
    for node in value["pages"][0]["nodes"].as_array_mut().unwrap() {
        node.as_object_mut().unwrap().remove("variable_bindings");
        node.as_object_mut().unwrap().remove("text_style_id");
    }
    migrate_legacy_document_ids(&mut value);
    let document: Document = serde_json::from_value(value).unwrap();
    document.validate().unwrap();
    assert!(document.number_variables.is_empty());
    assert!(document.text_styles.is_empty());
    assert!(
        document
            .active_page()
            .nodes
            .iter()
            .all(|node| node.variable_bindings == VariableBindings::default())
    );
}

#[test]
fn schema_five_documents_gain_empty_media_assets_and_node_defaults() {
    let mut source = Document::demo();
    source.add_text_style(
        "Legacy style".into(),
        TypographyStyle::from(&TextStyle::default()),
    );
    let mut value = serde_json::to_value(source).unwrap();
    value["schema_version"] = serde_json::json!(5);
    value.as_object_mut().unwrap().remove("media_assets");
    value["text_styles"][0]["style"]
        .as_object_mut()
        .unwrap()
        .remove("sizing");
    for page in value["pages"].as_array_mut().unwrap() {
        for node in page["nodes"].as_array_mut().unwrap() {
            node.as_object_mut().unwrap().remove("asset_id");
            node.as_object_mut().unwrap().remove("image_fit");
        }
    }
    migrate_legacy_document_ids(&mut value);
    let document: Document = serde_json::from_value(value).unwrap();
    document.validate().unwrap();
    assert!(document.media_assets.is_empty());
    assert_eq!(document.text_styles[0].style.sizing, TextSizing::AutoWidth);
    assert!(
        document
            .pages
            .iter()
            .flat_map(|page| &page.nodes)
            .all(|node| { node.asset_id.is_none() && node.image_fit == ImageFit::Cover })
    );
}

#[test]
fn schema_seven_shadow_ids_migrate_deterministically() {
    let mut value = serde_json::to_value(Document::demo()).unwrap();
    value["schema_version"] = serde_json::json!(7);
    let shadow = value["pages"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .flat_map(|page| page["nodes"].as_array_mut().unwrap())
        .flat_map(|node| node["shadows"].as_array_mut().unwrap())
        .next()
        .unwrap();
    shadow.as_object_mut().unwrap().remove("id");

    let mut first = value.clone();
    let mut second = value;
    migrate_legacy_document_ids(&mut first);
    migrate_legacy_document_ids(&mut second);

    let first: Document = serde_json::from_value(first).unwrap();
    let second: Document = serde_json::from_value(second).unwrap();
    assert_eq!(first.schema_version, SCHEMA_VERSION);
    assert_eq!(first, second);
}

#[test]
fn vector_shapes_are_native_serializable_nodes() {
    let mut engine = DocumentEngine::new_blank();
    for shape in ["ellipse", "line", "polygon", "star"] {
        let id = engine.add_vector_shape(shape.into(), String::new());
        let node: Node = serde_json::from_str(&engine.node_json(id)).unwrap();
        assert_eq!(node.kind, NodeKind::Vector);
        assert!(node.vector.is_some());
    }
    let document: Document = serde_json::from_str(&engine.document_json()).unwrap();
    document.validate().unwrap();
    assert_eq!(document.active_page().nodes.len(), 4);
}

#[test]
fn invalid_vector_geometry_is_rejected() {
    let mut document = Document::blank();
    let id = document.add_vector_shape(VectorGeometry::Polygon { sides: 6 }, None);
    document.active_node_mut(id).unwrap().vector = Some(VectorData {
        geometry: VectorGeometry::Star {
            points: 2,
            inner_ratio: f32::NAN,
        },
        fill_rule: FillRule::Nonzero,
    });
    assert!(document.validate().is_err());
}

#[test]
fn vector_parameters_and_conversion_are_undoable() {
    let mut engine = DocumentEngine::new_blank();
    let id = engine.add_vector_shape("star".into(), String::new());
    assert!(engine.update_vector_parameters(id.clone(), 8, 0.3));
    assert!(engine.set_vector_fill_rule(id.clone(), "evenodd".into()));
    assert!(engine.convert_vector_to_path(id.clone()));
    let node: Node = serde_json::from_str(&engine.node_json(id.clone())).unwrap();
    let vector = node.vector.unwrap();
    assert_eq!(vector.fill_rule, FillRule::Evenodd);
    let VectorGeometry::Path { contours } = vector.geometry else {
        panic!("star should convert to a path");
    };
    assert_eq!(contours[0].points.len(), 16);
    assert!(engine.undo());
    let node: Node = serde_json::from_str(&engine.node_json(id)).unwrap();
    assert!(matches!(
        node.vector.unwrap().geometry,
        VectorGeometry::Star { points: 8, .. }
    ));
}

#[test]
fn text_nodes_are_created_editable_serialized_and_undoable() {
    let mut engine = DocumentEngine::new();
    let id = engine.add_text();
    let node_id = parse_entity_id(&id);
    let text = TextStyle {
        content: "Hello, Libra".into(),
        font_family: " Georgia ".into(),
        font_weight: 1200,
        font_size: 42.0,
        horizontal_align: TextAlign::Center,
        ..TextStyle::default()
    };
    assert!(
        engine
            .set_node_text(id.clone(), &serde_json::to_string(&text).unwrap())
            .unwrap()
    );
    let node = engine.document.active_node(node_id).unwrap();
    let saved = node.text.as_ref().unwrap();
    assert_eq!(saved.content, "Hello, Libra");
    assert_eq!(saved.font_family, "Georgia");
    assert_eq!(saved.font_weight, 900);
    assert!(engine.document_json().contains("Hello, Libra"));
    assert!(engine.undo());
    assert_eq!(
        engine
            .document
            .active_node(node_id)
            .unwrap()
            .text
            .as_ref()
            .unwrap(),
        &TextStyle::default()
    );
    assert!(engine.redo());
    assert_eq!(
        engine
            .document
            .active_node(node_id)
            .unwrap()
            .text
            .as_ref()
            .unwrap()
            .font_size,
        42.0
    );
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
    let mut document = Document::blank();
    let parent = document.add_artboard("Finance · Wallet".into(), 360.0, 780.0);
    let group = document.insert_node(
        "Content",
        NodeKind::Group,
        Some(parent),
        [20.0, 20.0, 200.0, 200.0],
        [0.0; 4],
    );
    document.add_rectangle_to(Some(group));
    let frame = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Finance · Wallet")
        .unwrap()
        .id;
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
    let mut document = Document::blank();
    let parent = document.add_artboard("Finance · Wallet".into(), 360.0, 780.0);
    let group = document.insert_node(
        "Content",
        NodeKind::Group,
        Some(parent),
        [20.0, 20.0, 200.0, 200.0],
        [0.0; 4],
    );
    document.add_rectangle_to(Some(group));
    let frame = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.name == "Finance · Wallet")
        .unwrap()
        .id;
    let group = document
        .active_page()
        .nodes
        .iter()
        .find(|node| node.parent_id == Some(frame) && node.kind == NodeKind::Group)
        .unwrap()
        .id;
    let children: Vec<_> = document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.parent_id == Some(group))
        .take(2)
        .map(|node| node.id)
        .collect();
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
    let mut engine = DocumentEngine::new_blank();
    let a = engine.add_rectangle();
    let b = engine.add_rectangle();
    engine.set_node_bounds(a, 100.0, 180.0, 80.0, 80.0);
    engine.set_node_bounds(b, 110.0, 190.0, 80.0, 80.0);
    let hit = engine.hit_test(130.0, 210.0);
    let expected = ordered_nodes(engine.document.active_page())
        .into_iter()
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
    let id = document.active_page().nodes[0].id;
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
fn outside_border_join_changes_outer_corner_geometry() {
    let mut document = Document::demo();
    document.add_page("Border joins".into());
    let id = document.add_node(NodeKind::Rectangle);
    assert!(document.set_node_style(
        id,
        [1.0; 4],
        [0.0, 0.0, 0.0, 1.0],
        8.0,
        [0.0; 4],
        StrokeAlign::Outside,
        StrokeJoin::Round,
    ));
    let round_scene = document.scene_data();
    assert_eq!(&round_scene[16..20], &[8.0; 4]);

    assert!(document.set_node_style(
        id,
        [1.0; 4],
        [0.0, 0.0, 0.0, 1.0],
        8.0,
        [0.0; 4],
        StrokeAlign::Outside,
        StrokeJoin::Straight,
    ));
    let straight_scene = document.scene_data();
    assert_eq!(&straight_scene[16..20], &[0.0; 4]);
    assert_ne!(&round_scene[16..20], &straight_scene[16..20]);
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
fn node_dimensions_are_rounded_to_whole_pixels() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[1].id;
    assert!(document.set_node_bounds(id, 10.25, 20.75, 391.2, 207.8));
    let node = document.active_node(id).unwrap();
    assert_eq!((node.width, node.height), (391.0, 208.0));

    let old_right = node.x + node.width;
    assert!(document.resize_node(id, "w", 10.4, 0.0));
    let node = document.active_node(id).unwrap();
    assert_eq!(node.width.fract(), 0.0);
    assert!((node.x + node.width - old_right).abs() < 0.001);
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
    let id = document.active_page().nodes[0].id;
    let base_rects = document.scene_data().len() / FLOATS_PER_RECT;
    let shadows = vec![
        Shadow {
            id: Uuid::now_v7(),
            kind: ShadowKind::Outer,
            color: [0.0, 0.0, 0.0, 0.25],
            offset_x: 0.0,
            offset_y: 8.0,
            blur: 16.0,
            spread: 0.0,
            enabled: true,
        },
        Shadow {
            id: Uuid::now_v7(),
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
    assert_eq!(document.active_page().nodes[0].shadows, shadows);
    assert_eq!(
        document.scene_data().len() / FLOATS_PER_RECT,
        base_rects + 1
    );
    let json = serde_json::to_string(&document).unwrap();
    let restored: Document = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.active_page().nodes[0].shadows.len(), 2);
}

#[test]
fn duplicate_shadow_ids_are_replaced() {
    let mut document = Document::demo();
    let id = document.active_page().nodes[0].id;
    let duplicate_id = Uuid::now_v7();
    let shadow = Shadow {
        id: duplicate_id,
        kind: ShadowKind::Outer,
        color: [0.0, 0.0, 0.0, 0.25],
        offset_x: 0.0,
        offset_y: 8.0,
        blur: 16.0,
        spread: 0.0,
        enabled: true,
    };
    assert!(document.set_node_shadows(id, vec![shadow.clone(), shadow]));
    let shadows = &document.active_node(id).unwrap().shadows;
    assert_eq!(shadows[0].id, duplicate_id);
    assert_ne!(shadows[0].id, shadows[1].id);
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
    let node = document.active_node(id).unwrap().clone();
    assert!(document.move_nodes(&[id], -500.0 - node.x, -500.0 - node.y));
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
        .find(|node| node.name == "Status bar")
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
    let before = document.color_library.len();
    let first = document.add_document_color("Brand".into(), "#82E6B8".into());
    let second = document.add_document_color("Duplicate".into(), "#82E6B8".into());
    assert_eq!(first, second);
    assert_eq!(document.color_library.len(), before + 1);
    assert_eq!(
        document
            .color_library
            .iter()
            .find(|color| color.id == first)
            .unwrap()
            .name,
        "Brand"
    );
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
    let node = engine.document.active_page().nodes[0].clone();
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
        engine.document.active_page().nodes[0].corner_radii,
        node.corner_radii
    );
    assert!(engine.redo());
    assert_eq!(
        engine.document.active_page().nodes[0].corner_radii,
        [4.0, 8.0, 12.0, 16.0]
    );
    assert_eq!(
        engine.document.active_page().nodes[0].stroke_align,
        StrokeAlign::Outside
    );
    assert_eq!(
        engine.document.active_page().nodes[0].stroke_join,
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

#[test]
fn deleting_a_node_mid_geometry_transaction_preserves_undo_history() {
    let mut engine = DocumentEngine::new();
    let benchmark_page_id = engine.document.pages[1].id;
    assert!(engine.document.set_active_page(benchmark_page_id));
    let doomed_id = engine.document.active_page().nodes[0].id;
    let survivor_id = engine.document.active_page().nodes[1].id;
    let doomed_original = {
        let node = engine.document.active_node(doomed_id).unwrap();
        (node.x, node.y)
    };
    let survivor_original = {
        let node = engine.document.active_node(survivor_id).unwrap();
        (node.x, node.y)
    };
    engine
        .begin_geometry_transaction(&serde_json::to_string(&[doomed_id, survivor_id]).unwrap())
        .unwrap();
    assert!(
        engine
            .move_nodes(
                &serde_json::to_string(&[doomed_id, survivor_id]).unwrap(),
                12.0,
                4.0,
            )
            .unwrap()
    );
    assert!(engine.delete_node(doomed_id.to_string()));
    engine.end_transaction();
    // The deletion is a separate structural edit, so the first undo restores
    // the node at its moved position.
    assert!(engine.undo());
    let restored = engine.document.active_node(doomed_id).unwrap();
    assert_eq!(
        (restored.x, restored.y),
        (doomed_original.0 + 12.0, doomed_original.1 + 4.0)
    );
    // The second undo reverses the geometry transaction for both nodes.
    assert!(engine.undo());
    let survivor = engine.document.active_node(survivor_id).unwrap();
    assert_eq!((survivor.x, survivor.y), survivor_original);
    let restored = engine.document.active_node(doomed_id).unwrap();
    assert_eq!((restored.x, restored.y), doomed_original);
}

#[test]
fn grouping_an_ancestor_with_its_own_descendant_is_rejected() {
    let mut document = Document::demo();
    let child_a = document.active_page().nodes[1].id;
    let child_b = document.active_page().nodes[2].id;
    let group_id = document.group_nodes(&[child_a, child_b]).unwrap();
    let nodes_before = document.active_page().nodes.clone();
    // `group_id` is the parent of `child_a`; grouping them together must be
    // rejected instead of silently flattening the group's subtree.
    assert!(document.group_nodes(&[group_id, child_a]).is_none());
    assert_eq!(document.active_page().nodes, nodes_before);
}

#[test]
fn deleting_the_last_page_is_rejected() {
    let mut document = Document::demo();
    document.components.clear();
    document.pages.truncate(1);
    let only_page = document.active_page_id;
    assert!(!document.delete_page(only_page));
    assert_eq!(document.pages.len(), 1);
}

#[test]
fn deleting_the_active_page_reassigns_the_active_page() {
    let mut document = Document::demo();
    document.components.clear();
    document.pages.truncate(1);
    let home = document.active_page_id;
    let second = document.add_page("Second".into());
    assert!(document.set_active_page(home));
    assert!(document.delete_page(home));
    assert_eq!(document.pages.len(), 1);
    assert_eq!(document.active_page_id, second);
}

#[test]
fn deleting_a_page_with_a_component_source_is_rejected() {
    let mut document = Document::demo();
    let home = document.active_page_id;
    let root_id = document.active_page().nodes[0].id;
    assert!(document.create_component(root_id, "Card".into()).is_some());
    document.add_page("Second".into());
    assert!(document.set_active_page(home));
    assert!(!document.delete_page(home));
}

#[test]
fn rename_page_updates_the_page_name() {
    let mut document = Document::demo();
    let page_id = document.active_page_id;
    assert!(document.rename_page(page_id, "Renamed".into()));
    assert_eq!(document.active_page().name, "Renamed");
    assert!(!document.rename_page(Uuid::now_v7(), "Missing".into()));
}

#[test]
fn ungrouping_restores_children_as_flat_siblings_at_the_same_position() {
    let mut document = Document::demo();
    let parent_id = document.active_page().nodes[1].parent_id;
    let child_a = document.active_page().nodes[1].id;
    let child_b = document.active_page().nodes[2].id;
    let positions_before: Vec<_> = [child_a, child_b]
        .iter()
        .map(|id| {
            let node = document.active_node(*id).unwrap();
            (node.x, node.y)
        })
        .collect();
    let group_id = document.group_nodes(&[child_a, child_b]).unwrap();
    assert!(document.ungroup_nodes(group_id));
    assert!(document.active_node(group_id).is_none());
    for (id, expected) in [child_a, child_b].iter().zip(positions_before) {
        let node = document.active_node(*id).unwrap();
        assert_eq!((node.x, node.y), expected);
        assert_eq!(node.parent_id, parent_id);
    }
}

#[test]
fn ungrouping_rejects_locked_or_component_groups() {
    let mut document = Document::demo();
    let child_a = document.active_page().nodes[1].id;
    let child_b = document.active_page().nodes[2].id;
    let group_id = document.group_nodes(&[child_a, child_b]).unwrap();
    assert!(document.set_node_locked(group_id, true));
    assert!(!document.ungroup_nodes(group_id));
    assert!(document.set_node_locked(group_id, false));
    assert!(
        document
            .create_component(group_id, "Group component".into())
            .is_some()
    );
    assert!(!document.ungroup_nodes(group_id));
}

#[test]
fn component_instances_can_be_reset_swapped_and_detached() {
    let mut document = Document::demo();
    let source_a = document.active_page().nodes[1].id;
    let source_b = document.active_page().nodes[2].id;
    let component_a = document.create_component(source_a, "A".into()).unwrap();
    let component_b = document.create_component(source_b, "B".into()).unwrap();
    let variant_a = document
        .components
        .iter()
        .find(|component| component.id == component_a)
        .unwrap()
        .variants[0]
        .id;
    let variant_b = document
        .components
        .iter()
        .find(|component| component.id == component_b)
        .unwrap()
        .variants[0]
        .id;
    let instance = document
        .create_component_instance(component_a, variant_a, None)
        .unwrap();
    let original_position = {
        let node = document.active_node(instance).unwrap();
        (node.x, node.y)
    };
    let reset = document.reset_component_instance(instance).unwrap();
    assert_ne!(reset, instance);
    let swapped = document
        .swap_component_instance(reset, component_b, variant_b)
        .unwrap();
    assert_eq!(
        document.active_node(swapped).unwrap().x,
        original_position.0
    );
    assert_eq!(
        document.active_node(swapped).unwrap().y,
        original_position.1
    );
    assert_eq!(
        document.active_node(swapped).unwrap().component_id,
        Some(component_b)
    );
    assert!(document.detach_component_instance(swapped));
    let detached = document.active_node(swapped).unwrap();
    assert!(detached.component_id.is_none());
    assert!(detached.instance_root_id.is_none());
}

#[test]
fn locked_component_instance_cannot_be_replaced() {
    let mut document = Document::demo();
    let source = document.active_page().nodes[1].id;
    let component = document.create_component(source, "Locked".into()).unwrap();
    let variant = document
        .components
        .iter()
        .find(|item| item.id == component)
        .unwrap()
        .variants[0]
        .id;
    let instance = document
        .create_component_instance(component, variant, None)
        .unwrap();
    document.active_node_mut(instance).unwrap().locked = true;
    let node_count = document.active_page().nodes.len();

    assert!(document.reset_component_instance(instance).is_none());
    assert!(
        document
            .swap_component_instance(instance, component, variant)
            .is_none()
    );
    assert_eq!(document.active_page().nodes.len(), node_count);
    assert!(document.active_node(instance).is_some());
}

fn transform_fixture() -> (DocumentEngine, EntityId, EntityId, EntityId) {
    let mut engine = DocumentEngine::new();
    engine.document.add_page("Transform fixtures".into());
    let root = engine.document.insert_node(
        "Root",
        NodeKind::Frame,
        None,
        [0.0, 0.0, 200.0, 200.0],
        [1.0; 4],
    );
    let group = engine.document.insert_node(
        "Nested",
        NodeKind::Group,
        Some(root),
        [20.0, 20.0, 80.0, 80.0],
        [0.0; 4],
    );
    let child = engine.document.insert_node(
        "Child",
        NodeKind::Rectangle,
        Some(group),
        [30.0, 40.0, 20.0, 10.0],
        [1.0, 0.0, 0.0, 1.0],
    );
    (engine, root, group, child)
}

#[test]
fn container_transform_propagates_through_nested_groups_and_undo() {
    let (mut engine, root, group, child) = transform_fixture();
    let before = engine.document.clone();
    assert!(engine.set_node_transform(root.to_string(), 90.0, false, false));
    let child_node = engine.document.active_node(child).unwrap();
    assert!((child_node.x - 145.0).abs() < 0.001);
    assert!((child_node.y - 35.0).abs() < 0.001);
    assert!((child_node.rotation - 90.0).abs() < 0.001);
    assert_eq!(engine.hit_test(155.0, 40.0), child.to_string());
    assert!(engine.set_node_transform(group.to_string(), 180.0, true, false));
    let transformed = engine.document.clone();
    assert!(engine.undo());
    assert!(engine.undo());
    assert_eq!(engine.document, before);
    assert!(engine.redo());
    assert!(engine.redo());
    assert_eq!(engine.document, transformed);
    let restored: Document =
        serde_json::from_str(&serde_json::to_string(&engine.document).unwrap()).unwrap();
    assert_eq!(restored, transformed);
    engine.document.validate().unwrap();
}

#[test]
fn container_transform_roundtrip_preserves_descendant_orientation_and_locked_children() {
    let (mut engine, root, _, child) = transform_fixture();
    engine.document.set_node_transform(child, 23.0, true, false);
    engine.document.active_node_mut(child).unwrap().locked = true;
    let before = engine.document.active_node(child).unwrap().clone();
    for (angle, fx, fy) in [
        (71.0, true, false),
        (181.0, false, true),
        (315.0, true, true),
        (0.0, false, false),
    ] {
        assert!(engine.document.set_node_transform(root, angle, fx, fy));
    }
    let after = engine.document.active_node(child).unwrap();
    assert!((after.x - before.x).abs() < 0.001 && (after.y - before.y).abs() < 0.001);
    assert!((after.rotation - before.rotation).abs() < 0.001);
    assert_eq!((after.flip_x, after.flip_y), (before.flip_x, before.flip_y));
    assert!(!engine.document.set_node_transform(root, 0.0, false, false));
    assert!(
        !engine
            .document
            .set_node_transform(root, f32::NAN, false, false)
    );
}

#[test]
fn rotated_auto_layout_positions_children_in_container_axes() {
    let (mut engine, root, _, child) = transform_fixture();
    engine.document.set_node_layout(
        root,
        LayoutMode::Column,
        LayoutAlign::Start,
        LayoutAlign::Start,
        12.0,
        [10.0; 4],
    );
    engine.document.set_node_transform(root, 90.0, true, false);
    engine.document.set_node_layout(
        root,
        LayoutMode::Column,
        LayoutAlign::Start,
        LayoutAlign::Start,
        20.0,
        [20.0; 4],
    );
    engine.document.set_node_transform(root, 0.0, false, false);
    let parent = engine
        .document
        .active_node(
            engine
                .document
                .active_node(child)
                .unwrap()
                .parent_id
                .unwrap(),
        )
        .unwrap();
    assert!((parent.x - 20.0).abs() < 0.001 && (parent.y - 20.0).abs() < 0.001);
    assert!((engine.document.active_node(child).unwrap().rotation).abs() < 0.001);
}

#[test]
fn hit_testing_respects_rounded_frame_clipping_and_ancestor_opacity() {
    let (mut engine, root, _, child) = transform_fixture();
    engine.document.active_node_mut(root).unwrap().corner_radii = [40.0; 4];
    let node = engine.document.active_node_mut(child).unwrap();
    node.x = -10.0;
    node.y = -10.0;
    node.width = 50.0;
    node.height = 50.0;
    assert_eq!(engine.hit_test(-5.0, 5.0), "");
    assert_eq!(engine.hit_test(1.0, 1.0), "");
    assert_eq!(engine.hit_test(30.0, 30.0), child.to_string());
    engine.document.active_node_mut(root).unwrap().opacity = 0.0;
    assert_eq!(engine.hit_test(30.0, 30.0), "");
}

#[test]
fn transformed_component_instance_keeps_its_frame_after_master_edit() {
    let (mut engine, root, _, child) = transform_fixture();
    let component = engine
        .document
        .create_component(root, "Fixture".into())
        .unwrap();
    let variant = engine
        .document
        .components
        .iter()
        .find(|item| item.id == component)
        .unwrap()
        .variants[0]
        .id;
    let instance = parse_entity_id(&engine.create_component_instance(
        component.to_string(),
        variant.to_string(),
        String::new(),
    ));
    engine.set_node_transform(instance.to_string(), 90.0, true, false);
    let before: Vec<_> = engine
        .document
        .active_page()
        .nodes
        .iter()
        .filter(|node| node.instance_root_id == Some(instance))
        .cloned()
        .collect();
    // A style change triggers component sync without changing geometry.
    engine.set_node_opacity(child.to_string(), 0.7);
    for old in before {
        let new = engine.document.active_node(old.id).unwrap();
        assert!((new.x - old.x).abs() < 0.001 && (new.y - old.y).abs() < 0.001);
        assert!((new.rotation - old.rotation).abs() < 0.001);
        assert_eq!((new.flip_x, new.flip_y), (old.flip_x, old.flip_y));
    }
}

#[test]
fn new_children_inherit_transformed_container_and_numeric_moves_keep_hierarchy() {
    let (mut engine, root, _, child) = transform_fixture();
    engine.document.set_node_transform(root, 90.0, true, false);
    let added = engine.document.add_rectangle_to(Some(root));
    let node = engine.document.active_node(added).unwrap();
    assert!((node.rotation - 90.0).abs() < 0.001 && node.flip_x);
    let before = engine.document.active_node(child).unwrap().clone();
    engine
        .document
        .set_node_bounds(root, 40.0, 30.0, 200.0, 200.0);
    let after = engine.document.active_node(child).unwrap();
    assert!((after.x - before.x - 40.0).abs() < 0.001 && (after.y - before.y - 30.0).abs() < 0.001);
}

#[test]
fn finance_starter_layouts_fit_and_instances_reuse_real_content() {
    let document = Document::demo();
    document.validate().unwrap();
    let nodes = &document.active_page().nodes;
    for node in nodes.iter().filter(|node| node.name == "Action label") {
        let text = node.text.as_ref().unwrap();
        assert_eq!(text.vertical_align, TextVerticalAlign::Middle);
        assert_eq!(text.sizing, TextSizing::Fixed);
        assert!(node.height >= text.font_size * text.line_height);
    }
    for parent in nodes.iter().filter(|n| n.layout_mode != LayoutMode::None) {
        for child in nodes.iter().filter(|n| n.parent_id == Some(parent.id)) {
            assert!(
                child.x >= parent.x + parent.layout_padding[3] - 1.0,
                "{} left overflow in {}",
                child.name,
                parent.name
            );
            assert!(
                child.y >= parent.y + parent.layout_padding[0] - 1.0,
                "{} top overflow in {}",
                child.name,
                parent.name
            );
            assert!(
                child.x + child.width <= parent.x + parent.width - parent.layout_padding[1] + 1.0,
                "{} right overflow in {}",
                child.name,
                parent.name
            );
            assert!(
                child.y + child.height <= parent.y + parent.height - parent.layout_padding[2] + 1.0,
                "{} bottom overflow in {}",
                child.name,
                parent.name
            );
        }
    }
    assert!(
        nodes
            .iter()
            .filter(|n| n.instance_root_id == Some(n.id))
            .count()
            >= 6
    );
    for node in nodes.iter().filter(|n| n.kind == NodeKind::Text) {
        let text = node.text.as_ref().unwrap();
        assert!(
            !text.content.contains("   "),
            "Text must not fake column spacing"
        );
        assert!(!text.content.contains(['█', '░', '╭', '▁']));
    }
    let navigation = document
        .components
        .iter()
        .find(|c| c.name == "Navigation / Bottom bar")
        .unwrap();
    assert_eq!(
        nodes
            .iter()
            .filter(|n| n.component_id == Some(navigation.id) && n.instance_root_id == Some(n.id))
            .count(),
        2
    );
}

#[test]
fn pen_paths_validate_round_trip_and_undo_as_one_edit() {
    let mut engine = DocumentEngine::new_blank();
    engine
        .enable_operations(&Uuid::now_v7().to_string())
        .unwrap();
    let contours = r#"[{"closed":false,"points":[{"position":[0,0],"handle_out":[0.3,0.5],"point_type":"smooth"},{"position":[1,1],"handle_in":[0.7,0.5]}]}]"#;
    let id = engine.add_path(contours.into(), "[30,40,200,100]".into(), "".into());
    assert!(!id.is_empty());
    let original = engine.node_json(id.clone());
    let mut next: Vec<VectorContour> = serde_json::from_str(contours).unwrap();
    next[0].points[0].position = [0.1, 0.2];
    assert!(engine.update_path(id.clone(), serde_json::to_string(&next).unwrap()));
    assert!(engine.undo());
    assert_eq!(engine.node_json(id.clone()), original);
    assert!(engine.redo());
    let loaded = DocumentEngine::load_json(&engine.document_json()).unwrap();
    assert_eq!(loaded.node_json(id.clone()), engine.node_json(id.clone()));
    let before = engine.document_json();
    assert!(!engine.update_path(id.clone(), "[]".into()));
    assert!(
        engine
            .add_path("[]".into(), "[0,0,100,100]".into(), "".into())
            .is_empty()
    );
    assert!(
        engine
            .add_path(contours.into(), "[0,0,-1,100]".into(), "".into())
            .is_empty()
    );
    assert_eq!(engine.document_json(), before);
    engine.set_node_locked(id.clone(), true);
    assert!(!engine.update_path(id, contours.into()));
}

#[test]
fn path_bounds_expand_without_moving_rotated_or_flipped_geometry() {
    for flip in [false, true] {
        let mut document = Document::blank();
        let id = document.add_vector_shape(VectorGeometry::Line, None);
        document.convert_vector_to_path(id);
        let node = document.active_node_mut(id).unwrap();
        node.rotation = 37.0;
        node.flip_x = flip;
        let VectorGeometry::Path { contours } = &mut node.vector.as_mut().unwrap().geometry else {
            panic!()
        };
        contours[0].points[0].position = [-0.5, 1.8];
        contours[0].points[0].handle_out = Some([-0.8, 2.0]);
        let positions = |n: &Node| {
            let VectorGeometry::Path { contours } = &n.vector.as_ref().unwrap().geometry else {
                panic!()
            };
            let angle = n.rotation.to_radians();
            contours
                .iter()
                .flat_map(|c| &c.points)
                .flat_map(|p| {
                    std::iter::once(p.position)
                        .chain(p.handle_in)
                        .chain(p.handle_out)
                })
                .map(|p| {
                    let dx = (p[0] - 0.5) * n.width * if n.flip_x { -1.0 } else { 1.0 };
                    let dy = (p[1] - 0.5) * n.height * if n.flip_y { -1.0 } else { 1.0 };
                    [
                        n.x + n.width / 2.0 + dx * angle.cos() - dy * angle.sin(),
                        n.y + n.height / 2.0 + dx * angle.sin() + dy * angle.cos(),
                    ]
                })
                .collect::<Vec<_>>()
        };
        let before = positions(node);
        expand_path_bounds(node);
        assert!(node.width > 180.0 && node.height > 2.0);
        for (a, b) in before.iter().zip(positions(node)) {
            assert!((a[0] - b[0]).abs() < 0.001 && (a[1] - b[1]).abs() < 0.001);
        }
    }
}

#[test]
fn mask_group_preserves_artwork_undo_reload_and_hit_clipping() {
    let mut engine = DocumentEngine::new_blank();
    engine
        .enable_operations(&Uuid::now_v7().to_string())
        .unwrap();
    let content = engine.add_rectangle();
    engine.set_node_bounds(content.clone(), 0.0, 0.0, 200.0, 200.0);
    let source = engine.add_vector_shape("ellipse".into(), "".into());
    engine.set_node_bounds(source.clone(), 50.0, 50.0, 100.0, 100.0);
    let group = engine.mask_nodes(&serde_json::to_string(&[&content, &source]).unwrap());
    assert!(!group.is_empty());
    assert!(engine.hit_test(55.0, 55.0).is_empty());
    assert!(engine.hit_test(10.0, 10.0).is_empty());
    assert_eq!(engine.hit_test(100.0, 100.0), source);
    let loaded = DocumentEngine::load_json(&engine.document_json()).unwrap();
    assert!(loaded.hit_test(55.0, 55.0).is_empty());
    assert!(engine.release_mask(group.clone()));
    assert_eq!(engine.hit_test(10.0, 10.0), content);
    assert!(engine.undo());
    assert!(engine.hit_test(10.0, 10.0).is_empty());
    assert!(engine.undo());
    assert!(engine.node_json(group.clone()).is_empty());
    assert_eq!(engine.hit_test(10.0, 10.0), content);
    assert!(engine.redo());
    assert!(engine.ungroup_nodes(group));
    let source_node: Node = serde_json::from_str(&engine.node_json(source)).unwrap();
    assert!(!source_node.mask_shape);
    engine.document.validate().unwrap();
}

#[test]
fn masks_reject_open_paths_and_separate_containers_without_mutation() {
    let mut engine = DocumentEngine::new_blank();
    let a = engine.add_rectangle();
    let line = engine.add_vector_shape("line".into(), "".into());
    let before = engine.document_json();
    assert!(
        engine
            .mask_nodes(&serde_json::to_string(&[a, line]).unwrap())
            .is_empty()
    );
    assert_eq!(engine.document_json(), before);
    let frame = engine.add_frame();
    let inside = engine.add_rectangle_to(frame);
    let outside = engine.add_rectangle();
    let before = engine.document_json();
    assert!(
        engine
            .mask_nodes(&serde_json::to_string(&[inside, outside]).unwrap())
            .is_empty()
    );
    assert_eq!(engine.document_json(), before);
}

#[test]
fn masking_preserves_unselected_sibling_stacking() {
    let mut engine = DocumentEngine::new_blank();
    let content = engine.add_rectangle();
    let source = engine.add_vector_shape("ellipse".into(), "".into());
    let above = engine.add_rectangle();
    for id in [&content, &source, &above] {
        engine.set_node_bounds(id.clone(), 0.0, 0.0, 100.0, 100.0);
    }
    assert!(
        !engine
            .mask_nodes(&serde_json::to_string(&[content, source]).unwrap())
            .is_empty()
    );
    assert_eq!(engine.hit_test(50.0, 50.0), above);
}

#[test]
fn boolean_modes_preserve_operands_and_update_through_history() {
    for (mode, hits) in [
        ("union", [true, true, true]),
        ("subtract", [true, false, false]),
        ("intersect", [false, true, false]),
        ("exclude", [true, false, true]),
    ] {
        let mut engine = DocumentEngine::new_blank();
        engine
            .enable_operations(&Uuid::now_v7().to_string())
            .unwrap();
        let a = engine.add_rectangle();
        engine.set_node_bounds(a.clone(), 0.0, 0.0, 100.0, 100.0);
        let b = engine.add_rectangle();
        engine.set_node_bounds(b.clone(), 50.0, 0.0, 100.0, 100.0);
        let ids = serde_json::to_string(&[&a, &b]).unwrap();
        let group = engine.boolean_nodes(&ids, mode).unwrap();
        for (x, expected) in [25.0, 75.0, 125.0].into_iter().zip(hits) {
            assert_eq!(
                !engine.hit_test(x, 50.0).is_empty(),
                expected,
                "{mode} at {x}"
            );
            if expected {
                assert_eq!(engine.hit_test(x, 50.0), group);
            }
        }
        let loaded = DocumentEngine::load_json(&engine.document_json()).unwrap();
        assert_eq!(
            loaded.node_json(group.clone()),
            engine.node_json(group.clone())
        );
        let before = engine.node_json(group.clone());
        engine.set_node_bounds(b.clone(), 200.0, 0.0, 100.0, 100.0);
        assert_ne!(engine.node_json(group.clone()), before);
        assert!(engine.undo());
        assert_eq!(engine.node_json(group.clone()), before);
        assert!(engine.set_boolean_operation(group.clone(), "union"));
        assert_eq!(engine.hit_test(125.0, 50.0), group);
        assert!(engine.release_boolean(group.clone()));
        assert_eq!(engine.hit_test(125.0, 50.0), b);
        assert!(engine.undo());
        assert_eq!(engine.hit_test(125.0, 50.0), group);
        engine.document.validate().unwrap();
    }
}

#[test]
fn boolean_holes_nested_shapes_and_empty_results() {
    let mut engine = DocumentEngine::new_blank();
    let a = engine.add_rectangle();
    engine.set_node_bounds(a.clone(), 0.0, 0.0, 200.0, 200.0);
    let b = engine.add_vector_shape("ellipse".into(), "".into());
    engine.set_node_bounds(b.clone(), 50.0, 50.0, 100.0, 100.0);
    let original: Node = serde_json::from_str(&engine.node_json(b.clone())).unwrap();
    let group = engine
        .boolean_nodes(&serde_json::to_string(&[&a, &b]).unwrap(), "subtract")
        .unwrap();
    assert!(engine.hit_test(100.0, 100.0).is_empty());
    assert_eq!(engine.hit_test(55.0, 55.0), group);
    let retained: Node = serde_json::from_str(&engine.node_json(b.clone())).unwrap();
    assert_eq!(retained.vector, original.vector);
    let c = engine.add_rectangle();
    engine.set_node_bounds(c.clone(), 300.0, 0.0, 50.0, 50.0);
    let outer = engine
        .boolean_nodes(&serde_json::to_string(&[&group, &c]).unwrap(), "union")
        .unwrap();
    assert_eq!(engine.hit_test(20.0, 20.0), outer);
    assert_eq!(engine.hit_test(320.0, 20.0), outer);
    assert!(engine.hit_test(100.0, 100.0).is_empty());
    engine.set_boolean_operation(outer.clone(), "intersect");
    assert!(engine.hit_test(20.0, 20.0).is_empty());
    engine.document.validate().unwrap();
}

#[test]
fn boolean_rejects_open_operands_without_mutation() {
    let mut engine = DocumentEngine::new_blank();
    let a = engine.add_rectangle();
    let b = engine.add_vector_shape("line".into(), "".into());
    let before = engine.document.clone();
    assert!(
        engine
            .document
            .create_boolean(
                &[parse_entity_id(&a), parse_entity_id(&b)],
                BooleanOperation::Union
            )
            .is_err()
    );
    assert_eq!(engine.document, before);
}

#[test]
fn boolean_transformed_operand_keeps_its_footprint() {
    let mut engine = DocumentEngine::new_blank();
    let a = engine.add_rectangle();
    engine.set_node_bounds(a.clone(), 0.0, 0.0, 100.0, 100.0);
    engine
        .document
        .active_node_mut(parse_entity_id(&a))
        .unwrap()
        .rotation = 45.0;
    let b = engine.add_rectangle();
    engine.set_node_bounds(b.clone(), 300.0, 0.0, 100.0, 100.0);
    let group = engine
        .boolean_nodes(&serde_json::to_string(&[&a, &b]).unwrap(), "union")
        .unwrap();
    assert!(engine.hit_test(0.0, 0.0).is_empty());
    assert_eq!(engine.hit_test(50.0, -10.0), group);
    assert_eq!(engine.hit_test(350.0, 50.0), group);
}
