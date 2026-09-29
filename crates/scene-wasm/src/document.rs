use crate::geometry::point_in_rotated_node;
use crate::*;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

impl Document {
    pub(crate) fn blank() -> Self {
        let page_id = Uuid::now_v7();
        Self {
            schema_version: SCHEMA_VERSION,
            active_page_id: page_id,
            pages: vec![Page {
                id: page_id,
                name: "Page 1".into(),
                description: String::new(),
                nodes: Vec::new(),
                benchmark_node_count: None,
                benchmark_modified_node_ids: Vec::new(),
            }],
            color_library: Vec::new(),
            number_variables: Vec::new(),
            text_styles: Vec::new(),
            media_assets: Vec::new(),
            components: Vec::new(),
        }
    }

    pub(crate) fn demo() -> Self {
        let home_id = Uuid::now_v7();
        let mut document = Self {
            schema_version: SCHEMA_VERSION,
            active_page_id: home_id,
            pages: vec![Page {
                id: home_id,
                name: "Home".into(),
                description:
                    "Moss finance · Four editable mobile screens with components and auto layout."
                        .into(),
                nodes: Vec::new(),
                benchmark_node_count: None,
                benchmark_modified_node_ids: Vec::new(),
            }],
            color_library: Vec::new(),
            number_variables: Vec::new(),
            text_styles: Vec::new(),
            media_assets: Vec::new(),
            components: Vec::new(),
        };

        let mobile = document.insert_node(
            "Mobile app",
            NodeKind::Frame,
            None,
            [80.0, 80.0, 390.0, 760.0],
            [0.96, 0.97, 0.99, 1.0],
        );
        let mobile_nav = document.insert_node(
            "Navigation",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 108.0, 342.0, 64.0],
            [0.10, 0.12, 0.16, 1.0],
        );
        let mobile_hero = document.insert_node(
            "Hero",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 196.0, 342.0, 180.0],
            [0.23, 0.36, 0.78, 1.0],
        );
        let mobile_action = document.insert_node(
            "Primary action",
            NodeKind::Rectangle,
            Some(mobile),
            [124.0, 286.0, 110.0, 42.0],
            [0.46, 0.91, 0.72, 1.0],
        );
        let mobile_card_a = document.insert_node(
            "Card A",
            NodeKind::Rectangle,
            Some(mobile),
            [104.0, 400.0, 160.0, 170.0],
            [1.0, 1.0, 1.0, 1.0],
        );
        let mobile_card_b = document.insert_node(
            "Card B",
            NodeKind::Rectangle,
            Some(mobile),
            [286.0, 400.0, 160.0, 170.0],
            [1.0, 1.0, 1.0, 1.0],
        );

        let desktop = document.insert_node(
            "Dashboard",
            NodeKind::Frame,
            None,
            [530.0, 80.0, 820.0, 620.0],
            [0.96, 0.97, 0.99, 1.0],
        );
        let desktop_top = document.insert_node(
            "Top bar",
            NodeKind::Rectangle,
            Some(desktop),
            [554.0, 104.0, 772.0, 58.0],
            [0.10, 0.12, 0.16, 1.0],
        );
        let desktop_sidebar = document.insert_node(
            "Sidebar",
            NodeKind::Rectangle,
            Some(desktop),
            [554.0, 162.0, 170.0, 514.0],
            [0.95, 0.96, 0.98, 1.0],
        );
        let desktop_metric_a = document.insert_node(
            "Metric A",
            NodeKind::Rectangle,
            Some(desktop),
            [748.0, 194.0, 260.0, 110.0],
            [0.23, 0.36, 0.78, 1.0],
        );
        let desktop_metric_b = document.insert_node(
            "Metric B",
            NodeKind::Rectangle,
            Some(desktop),
            [1030.0, 194.0, 272.0, 110.0],
            [0.46, 0.91, 0.72, 1.0],
        );
        let desktop_chart = document.insert_node(
            "Chart",
            NodeKind::Rectangle,
            Some(desktop),
            [748.0, 328.0, 554.0, 220.0],
            [1.0, 1.0, 1.0, 1.0],
        );
        for id in [mobile, desktop] {
            document.style_demo_shape(id, 24.0, [0.84, 0.86, 0.90, 1.0], 1.0, false);
        }
        document.style_demo_shape(mobile_nav, 18.0, [0.10, 0.12, 0.16, 1.0], 0.0, false);
        document.style_demo_shape(mobile_hero, 22.0, [0.23, 0.36, 0.78, 1.0], 0.0, false);
        document.style_demo_shape(mobile_action, 12.0, [0.46, 0.91, 0.72, 1.0], 0.0, false);
        document.style_demo_shape(mobile_card_a, 18.0, [0.84, 0.86, 0.90, 1.0], 1.0, true);
        document.style_demo_shape(mobile_card_b, 18.0, [0.84, 0.86, 0.90, 1.0], 1.0, true);
        document.style_demo_shape(desktop_top, 14.0, [0.10, 0.12, 0.16, 1.0], 0.0, false);
        document.style_demo_shape(desktop_sidebar, 14.0, [0.84, 0.86, 0.90, 1.0], 1.0, false);
        document.style_demo_shape(desktop_metric_a, 18.0, [0.23, 0.36, 0.78, 1.0], 0.0, true);
        document.style_demo_shape(desktop_metric_b, 18.0, [0.46, 0.91, 0.72, 1.0], 0.0, true);
        document.style_demo_shape(desktop_chart, 18.0, [0.84, 0.86, 0.90, 1.0], 1.0, true);

        document.build_real_estate_mobile(
            mobile,
            mobile_nav,
            mobile_hero,
            mobile_action,
            mobile_card_a,
            mobile_card_b,
        );
        document.insert_demo_text(
            desktop,
            "Desktop brand",
            "NOVA",
            [578.0, 122.0, 100.0, 24.0],
            18.0,
            800,
            [0.93, 0.96, 1.0, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Desktop search",
            "Search anything…",
            [1100.0, 123.0, 170.0, 22.0],
            11.0,
            400,
            [0.60, 0.64, 0.72, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Balance label",
            "TOTAL BALANCE",
            [772.0, 216.0, 150.0, 16.0],
            10.0,
            700,
            [0.82, 0.87, 1.0, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Balance value",
            "$24,860.40",
            [772.0, 242.0, 205.0, 36.0],
            27.0,
            800,
            [1.0, 1.0, 1.0, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Savings label",
            "SAVINGS RATE",
            [1054.0, 216.0, 150.0, 16.0],
            10.0,
            700,
            [0.08, 0.22, 0.16, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Savings value",
            "31.8%",
            [1054.0, 242.0, 180.0, 36.0],
            27.0,
            800,
            [0.07, 0.12, 0.10, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Chart title",
            "Cash flow",
            [772.0, 352.0, 160.0, 26.0],
            18.0,
            800,
            [0.08, 0.10, 0.14, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Chart range",
            "Last 6 months",
            [1172.0, 354.0, 105.0, 20.0],
            11.0,
            500,
            [0.43, 0.47, 0.55, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Chart value",
            "$42.6k income   ·   $28.4k spent",
            [772.0, 394.0, 300.0, 22.0],
            12.0,
            600,
            [0.31, 0.35, 0.42, 1.0],
        );
        document.insert_demo_text(
            desktop,
            "Chart visualization",
            "▁▂▃▅▄▆▅▇",
            [790.0, 430.0, 450.0, 82.0],
            58.0,
            700,
            [0.23, 0.36, 0.78, 1.0],
        );
        document.build_demo_auto_layouts(desktop, [desktop_metric_a, desktop_metric_b]);

        // Keep the original construction above as coverage for the editing helpers, then
        // present a coherent, fully editable finance product on the Home page.
        document.active_page_mut().nodes.clear();
        document.color_library.clear();
        document.number_variables.clear();
        document.text_styles.clear();
        document.media_assets.clear();
        document.build_finance_mobile_demo();

        document
    }

    fn style_demo_shape(
        &mut self,
        id: EntityId,
        radius: f32,
        stroke: [f32; 4],
        stroke_width: f32,
        shadow: bool,
    ) {
        let node = self.active_node_mut(id).unwrap();
        node.corner_radii = [radius; 4];
        node.stroke = stroke;
        node.stroke_width = stroke_width;
        if shadow {
            node.shadows.push(Shadow {
                id: Uuid::now_v7(),
                kind: ShadowKind::Outer,
                color: [0.04, 0.06, 0.10, 0.16],
                offset_x: 0.0,
                offset_y: 8.0,
                blur: 18.0,
                spread: -2.0,
                enabled: true,
            });
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn insert_demo_text(
        &mut self,
        parent_id: EntityId,
        name: &str,
        content: &str,
        bounds: [f32; 4],
        font_size: f32,
        font_weight: u16,
        color: [f32; 4],
    ) -> EntityId {
        let id = self.insert_node(name, NodeKind::Text, Some(parent_id), bounds, color);
        self.active_node_mut(id).unwrap().text = Some(TextStyle {
            content: content.into(),
            font_size,
            font_weight,
            sizing: TextSizing::Fixed,
            ..TextStyle::default()
        });
        id
    }

    fn insert_demo_group(
        &mut self,
        parent_id: EntityId,
        name: &str,
        bounds: [f32; 4],
        mode: LayoutMode,
        gap: f32,
    ) -> EntityId {
        let id = self.insert_node(name, NodeKind::Group, Some(parent_id), bounds, [0.0; 4]);
        let group = self.active_node_mut(id).unwrap();
        group.layout_mode = mode;
        group.layout_gap = gap;
        group.layout_align = LayoutAlign::Center;
        id
    }

    #[allow(clippy::too_many_arguments)]
    fn build_real_estate_mobile(
        &mut self,
        mobile: EntityId,
        search_background: EntityId,
        property_image: EntityId,
        category_all: EntityId,
        category_house: EntityId,
        category_villa: EntityId,
    ) {
        {
            let frame = self.active_node_mut(mobile).unwrap();
            frame.name = "Real estate · Home".into();
            frame.fill = [0.95, 0.95, 0.89, 1.0];
            frame.layout_mode = LayoutMode::Column;
            frame.layout_gap = 0.0;
            frame.layout_padding = [24.0; 4];
            frame.layout_align = LayoutAlign::Center;
            frame.layout_justify = LayoutAlign::Start;
        }
        let content = self.insert_demo_group(
            mobile,
            "Mobile content · Auto layout",
            [104.0, 104.0, 342.0, 712.0],
            LayoutMode::Column,
            12.0,
        );
        {
            let group = self.active_node_mut(content).unwrap();
            group.layout_align = LayoutAlign::Start;
            group.layout_justify = LayoutAlign::Start;
            group.width_sizing = LayoutSizing::Fill;
        }

        let status = self.insert_demo_group(
            content,
            "Status bar · Auto layout",
            [104.0, 104.0, 342.0, 24.0],
            LayoutMode::Row,
            8.0,
        );
        let time = self.insert_demo_text(
            status,
            "Time",
            "9:41",
            [104.0, 104.0, 238.0, 24.0],
            15.0,
            700,
            [0.08, 0.09, 0.08, 1.0],
        );
        self.active_node_mut(time).unwrap().width_sizing = LayoutSizing::Fill;
        self.insert_demo_text(
            status,
            "Phone status",
            "▮▮▮  ◉  ▰",
            [350.0, 106.0, 96.0, 20.0],
            11.0,
            700,
            [0.08, 0.09, 0.08, 1.0],
        );
        self.relayout_container(status);

        let location = self.insert_demo_group(
            content,
            "Location header · Auto layout",
            [104.0, 140.0, 342.0, 54.0],
            LayoutMode::Row,
            8.0,
        );
        let location_copy = self.insert_demo_text(
            location,
            "Location",
            "Location\nHouston, Texas ⌄",
            [104.0, 140.0, 230.0, 54.0],
            15.0,
            650,
            [0.10, 0.11, 0.09, 1.0],
        );
        self.active_node_mut(location_copy).unwrap().width_sizing = LayoutSizing::Fill;
        let bell = self.insert_demo_group(
            location,
            "Notifications",
            [342.0, 145.0, 44.0, 44.0],
            LayoutMode::None,
            0.0,
        );
        self.style_demo_shape(bell, 22.0, [1.0; 4], 0.0, false);
        self.active_node_mut(bell).unwrap().fill = [1.0, 1.0, 0.98, 0.76];
        self.insert_demo_text(
            bell,
            "Notification icon",
            "♧",
            [355.0, 156.0, 20.0, 22.0],
            17.0,
            600,
            [0.10, 0.11, 0.09, 1.0],
        );
        let avatar = self.insert_demo_group(
            location,
            "Profile avatar",
            [394.0, 145.0, 44.0, 44.0],
            LayoutMode::None,
            0.0,
        );
        self.style_demo_shape(avatar, 22.0, [0.13, 0.22, 0.22, 1.0], 0.0, false);
        self.active_node_mut(avatar).unwrap().fill = [0.13, 0.22, 0.22, 1.0];
        self.insert_demo_text(
            avatar,
            "Avatar initials",
            "JM",
            [404.0, 157.0, 26.0, 20.0],
            12.0,
            800,
            [0.93, 0.95, 0.89, 1.0],
        );
        self.relayout_container(location);

        let search = self.insert_demo_group(
            content,
            "Search · Group",
            [104.0, 206.0, 342.0, 54.0],
            LayoutMode::None,
            0.0,
        );
        {
            let background = self.active_node_mut(search_background).unwrap();
            background.name = "Search background".into();
            background.parent_id = Some(search);
            background.x = 104.0;
            background.y = 206.0;
            background.width = 342.0;
            background.height = 54.0;
            background.fill = [1.0, 1.0, 0.98, 0.82];
            background.corner_radii = [27.0; 4];
            background.stroke_width = 0.0;
        }
        self.insert_demo_text(
            search,
            "Search icon",
            "⌕",
            [122.0, 220.0, 24.0, 26.0],
            22.0,
            500,
            [0.18, 0.20, 0.17, 1.0],
        );
        self.insert_demo_text(
            search,
            "Search placeholder",
            "Search homes...",
            [154.0, 222.0, 220.0, 24.0],
            14.0,
            400,
            [0.40, 0.42, 0.38, 1.0],
        );
        self.insert_demo_text(
            search,
            "Filter action",
            "☷",
            [407.0, 219.0, 24.0, 26.0],
            20.0,
            600,
            [0.18, 0.20, 0.17, 1.0],
        );

        let welcome = self.insert_demo_group(
            content,
            "Welcome copy · Auto layout",
            [104.0, 272.0, 342.0, 86.0],
            LayoutMode::Column,
            5.0,
        );
        for (name, copy, height, size, weight, color) in [
            (
                "Welcome title",
                "Welcome Back, James!",
                32.0,
                23.0,
                750,
                [0.07, 0.08, 0.07, 1.0],
            ),
            (
                "Welcome subtitle",
                "Explore homes, apartments, and opportunities\ntailored for you.",
                49.0,
                13.0,
                400,
                [0.39, 0.41, 0.37, 1.0],
            ),
        ] {
            let id = self.insert_demo_text(
                welcome,
                name,
                copy,
                [104.0, 272.0, 342.0, height],
                size,
                weight,
                color,
            );
            self.active_node_mut(id).unwrap().width_sizing = LayoutSizing::Fill;
        }
        self.active_node_mut(welcome).unwrap().layout_align = LayoutAlign::Start;
        self.active_node_mut(welcome).unwrap().layout_justify = LayoutAlign::Start;
        self.relayout_container(welcome);

        let categories = self.insert_demo_group(
            content,
            "Property categories · Auto layout",
            [104.0, 370.0, 342.0, 50.0],
            LayoutMode::Row,
            8.0,
        );
        for (index, (name, label, shape, width, selected)) in [
            ("All category", "All", category_all, 64.0, true),
            ("House category", "◉  House", category_house, 131.0, false),
            ("Villa category", "▣  Villa", category_villa, 131.0, false),
        ]
        .into_iter()
        .enumerate()
        {
            let x = 104.0 + [0.0, 72.0, 211.0][index];
            let item = self.insert_demo_group(
                categories,
                name,
                [x, 370.0, width, 50.0],
                LayoutMode::None,
                0.0,
            );
            let background = self.active_node_mut(shape).unwrap();
            background.parent_id = Some(item);
            background.x = x;
            background.y = 370.0;
            background.width = width;
            background.height = 50.0;
            background.fill = if selected {
                [0.04, 0.64, 0.39, 1.0]
            } else {
                [1.0, 1.0, 0.98, 0.72]
            };
            background.corner_radii = [25.0; 4];
            background.stroke_width = 0.0;
            background.shadows.clear();
            self.insert_demo_text(
                item,
                &format!("{name} label"),
                label,
                [x + 14.0, 385.0, width - 24.0, 22.0],
                13.0,
                550,
                if selected {
                    [1.0, 1.0, 1.0, 1.0]
                } else {
                    [0.26, 0.28, 0.25, 1.0]
                },
            );
        }
        self.active_node_mut(categories).unwrap().layout_align = LayoutAlign::Center;
        self.active_node_mut(categories).unwrap().layout_justify = LayoutAlign::Start;
        self.relayout_container(categories);

        let listing = self.insert_demo_group(
            content,
            "Featured property · Auto layout",
            [104.0, 432.0, 342.0, 308.0],
            LayoutMode::Column,
            8.0,
        );
        self.style_demo_shape(listing, 20.0, [1.0, 1.0, 1.0, 0.45], 1.0, true);
        {
            let group = self.active_node_mut(listing).unwrap();
            group.fill = [0.92, 0.96, 0.91, 1.0];
            group.layout_padding = [8.0; 4];
            group.layout_align = LayoutAlign::Start;
            group.layout_justify = LayoutAlign::Start;
        }
        let image = self.insert_demo_group(
            listing,
            "Property image · Group",
            [112.0, 440.0, 326.0, 160.0],
            LayoutMode::None,
            0.0,
        );
        {
            let background = self.active_node_mut(property_image).unwrap();
            background.name = "Property image background".into();
            background.parent_id = Some(image);
            background.x = 112.0;
            background.y = 440.0;
            background.width = 326.0;
            background.height = 160.0;
            background.fill = [0.54, 0.78, 0.84, 1.0];
            background.corner_radii = [16.0; 4];
            background.stroke_width = 0.0;
        }
        let lawn = self.insert_node(
            "Lawn",
            NodeKind::Rectangle,
            Some(image),
            [112.0, 548.0, 326.0, 52.0],
            [0.24, 0.38, 0.25, 1.0],
        );
        let house = self.insert_node(
            "House facade",
            NodeKind::Rectangle,
            Some(image),
            [165.0, 493.0, 226.0, 82.0],
            [0.95, 0.88, 0.74, 1.0],
        );
        self.style_demo_shape(house, 3.0, [0.35, 0.29, 0.23, 1.0], 1.0, false);
        for (index, x) in [184.0, 242.0, 300.0, 358.0].into_iter().enumerate() {
            let window = self.insert_node(
                &format!("Window {}", index + 1),
                NodeKind::Rectangle,
                Some(image),
                [x, 514.0, 34.0, 42.0],
                [0.16, 0.31, 0.35, 1.0],
            );
            self.style_demo_shape(window, 2.0, [0.95, 0.88, 0.74, 1.0], 2.0, false);
        }
        let roof = self.insert_node(
            "Roof",
            NodeKind::Rectangle,
            Some(image),
            [153.0, 476.0, 250.0, 22.0],
            [0.28, 0.20, 0.16, 1.0],
        );
        self.style_demo_shape(roof, 3.0, [0.28, 0.20, 0.16, 1.0], 0.0, false);
        self.style_demo_shape(lawn, 0.0, [0.24, 0.38, 0.25, 1.0], 0.0, false);
        self.insert_demo_text(
            image,
            "Featured badge",
            "Featured",
            [126.0, 453.0, 72.0, 24.0],
            10.0,
            600,
            [0.17, 0.24, 0.22, 1.0],
        );
        self.insert_demo_text(
            image,
            "Favorite",
            "♡",
            [400.0, 451.0, 26.0, 28.0],
            24.0,
            500,
            [0.16, 0.20, 0.18, 1.0],
        );

        let title_row = self.insert_demo_group(
            listing,
            "Property title · Auto layout",
            [112.0, 608.0, 326.0, 30.0],
            LayoutMode::Row,
            8.0,
        );
        let title = self.insert_demo_text(
            title_row,
            "Property title",
            "Cozy Family House",
            [112.0, 608.0, 218.0, 30.0],
            18.0,
            700,
            [0.07, 0.08, 0.07, 1.0],
        );
        self.active_node_mut(title).unwrap().width_sizing = LayoutSizing::Fill;
        let contact = self.insert_demo_group(
            title_row,
            "Contact action",
            [338.0, 608.0, 100.0, 30.0],
            LayoutMode::None,
            0.0,
        );
        self.style_demo_shape(contact, 15.0, [0.05, 0.06, 0.05, 1.0], 0.0, false);
        self.active_node_mut(contact).unwrap().fill = [0.05, 0.06, 0.05, 1.0];
        self.insert_demo_text(
            contact,
            "Contact label",
            "▱  Contact",
            [352.0, 616.0, 74.0, 16.0],
            10.0,
            600,
            [1.0, 1.0, 1.0, 1.0],
        );
        self.relayout_container(title_row);
        let features = self.insert_demo_text(
            listing,
            "Property features",
            "▤ 3 Beds    ♨ 2 Baths    ⛶ 1500 Sqft    +03",
            [112.0, 646.0, 326.0, 24.0],
            10.0,
            500,
            [0.34, 0.37, 0.33, 1.0],
        );
        self.active_node_mut(features).unwrap().width_sizing = LayoutSizing::Fill;
        let price = self.insert_demo_text(
            listing,
            "Property price",
            "$425,000",
            [112.0, 678.0, 326.0, 34.0],
            24.0,
            750,
            [0.05, 0.06, 0.05, 1.0],
        );
        self.active_node_mut(price).unwrap().width_sizing = LayoutSizing::Fill;
        self.relayout_container(listing);

        let bottom_nav = self.insert_demo_group(
            content,
            "Bottom navigation · Auto layout",
            [104.0, 752.0, 342.0, 64.0],
            LayoutMode::Row,
            4.0,
        );
        self.style_demo_shape(bottom_nav, 32.0, [0.04, 0.05, 0.04, 1.0], 0.0, true);
        {
            let group = self.active_node_mut(bottom_nav).unwrap();
            group.fill = [0.04, 0.05, 0.04, 1.0];
            group.layout_padding = [6.0; 4];
            group.layout_justify = LayoutAlign::Start;
        }
        for (index, (name, icon)) in [
            ("Home", "⌂"),
            ("Discover", "✧"),
            ("Search", "⌕"),
            ("Messages", "▱"),
            ("Settings", "⚙"),
        ]
        .into_iter()
        .enumerate()
        {
            let item = self.insert_demo_group(
                bottom_nav,
                &format!("{name} tab"),
                [110.0 + index as f32 * 66.0, 758.0, 62.0, 52.0],
                LayoutMode::None,
                0.0,
            );
            if index == 0 {
                self.style_demo_shape(item, 26.0, [0.04, 0.64, 0.39, 1.0], 0.0, false);
                self.active_node_mut(item).unwrap().fill = [0.04, 0.64, 0.39, 1.0];
            }
            self.insert_demo_text(
                item,
                &format!("{name} icon"),
                icon,
                [130.0 + index as f32 * 66.0, 772.0, 24.0, 26.0],
                20.0,
                500,
                [0.95, 0.96, 0.92, 1.0],
            );
        }
        self.relayout_container(bottom_nav);
        self.relayout_container(content);
        self.relayout_container(mobile);
    }

    fn build_demo_auto_layouts(&mut self, desktop: EntityId, desktop_metrics: [EntityId; 2]) {
        let metric_row = self.insert_demo_group(
            desktop,
            "Metrics · Auto layout",
            [748.0, 194.0, 554.0, 110.0],
            LayoutMode::Row,
            22.0,
        );
        for id in desktop_metrics {
            self.active_node_mut(id).unwrap().parent_id = Some(metric_row);
        }
        self.relayout_container(metric_row);

        let planning_row = self.insert_demo_group(
            desktop,
            "Planning summary · Auto layout",
            [748.0, 570.0, 554.0, 74.0],
            LayoutMode::Row,
            13.0,
        );
        for (index, (name, label, value, tint)) in [
            (
                "Emergency fund",
                "EMERGENCY FUND",
                "68%",
                [0.95, 0.73, 0.44, 1.0],
            ),
            (
                "Travel goal",
                "TRAVEL GOAL",
                "$1,840",
                [0.55, 0.64, 0.92, 1.0],
            ),
            (
                "Subscriptions",
                "SUBSCRIPTIONS",
                "6 active",
                [0.46, 0.91, 0.72, 1.0],
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let x = 748.0 + index as f32 * 189.0;
            let card = self.insert_node(
                name,
                NodeKind::Rectangle,
                Some(planning_row),
                [x, 570.0, 176.0, 74.0],
                [1.0, 1.0, 1.0, 1.0],
            );
            self.style_demo_shape(card, 14.0, [0.84, 0.86, 0.90, 1.0], 1.0, false);
            self.insert_demo_text(
                desktop,
                &format!("{name} label"),
                label,
                [x + 16.0, 586.0, 140.0, 14.0],
                9.0,
                700,
                [0.40, 0.44, 0.51, 1.0],
            );
            self.insert_demo_text(
                desktop,
                &format!("{name} value"),
                value,
                [x + 16.0, 610.0, 140.0, 22.0],
                16.0,
                800,
                tint,
            );
        }
        self.relayout_container(planning_row);

        let sidebar = self.insert_demo_group(
            desktop,
            "Sidebar navigation · Auto layout",
            [574.0, 190.0, 130.0, 278.0],
            LayoutMode::Column,
            11.0,
        );
        for (name, content, height, weight, color) in [
            (
                "Greeting",
                "Good morning,\nMaya",
                42.0,
                700,
                [0.10, 0.12, 0.16, 1.0],
            ),
            (
                "Overview link",
                "●  Overview",
                24.0,
                700,
                [0.23, 0.36, 0.78, 1.0],
            ),
            (
                "Transactions link",
                "○  Transactions",
                24.0,
                600,
                [0.34, 0.38, 0.46, 1.0],
            ),
            (
                "Budgets link",
                "○  Budgets",
                24.0,
                600,
                [0.34, 0.38, 0.46, 1.0],
            ),
            ("Goals link", "○  Goals", 24.0, 600, [0.34, 0.38, 0.46, 1.0]),
            (
                "Insights link",
                "○  Insights",
                24.0,
                600,
                [0.34, 0.38, 0.46, 1.0],
            ),
        ] {
            let id = self.insert_demo_text(
                sidebar,
                name,
                content,
                [574.0, 190.0, 130.0, height],
                12.0,
                weight,
                color,
            );
            self.active_node_mut(id).unwrap().width_sizing = LayoutSizing::Fill;
        }
        self.relayout_container(sidebar);
    }

    pub(crate) fn benchmark(node_count: usize) -> Self {
        let mut document = Self::blank();
        let page = document.active_page_mut();
        page.name = format!("{}K Nodes", node_count / 1_000);
        page.description = "Temporary stress test. Changes reset when leaving.".into();
        page.benchmark_node_count = Some(node_count);
        document.populate_active_benchmark();
        document
    }

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

    pub(crate) fn active_page(&self) -> &Page {
        self.pages
            .iter()
            .find(|page| page.id == self.active_page_id)
            .expect("active page exists")
    }

    pub(crate) fn active_page_mut(&mut self) -> &mut Page {
        let active = self.active_page_id;
        self.pages
            .iter_mut()
            .find(|page| page.id == active)
            .expect("active page exists")
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

    pub(crate) fn active_node(&self, node_id: EntityId) -> Option<&Node> {
        let page = self.active_page();
        page.nodes.iter().find(|node| node.id == node_id)
    }

    pub(crate) fn active_node_mut(&mut self, node_id: EntityId) -> Option<&mut Node> {
        let page = self.active_page_mut();
        page.nodes.iter_mut().find(|node| node.id == node_id)
    }

    pub(crate) fn allocate_id(&mut self) -> EntityId {
        Uuid::now_v7()
    }

    pub(crate) fn insert_node(
        &mut self,
        name: &str,
        kind: NodeKind,
        parent_id: Option<EntityId>,
        bounds: [f32; 4],
        fill: [f32; 4],
    ) -> EntityId {
        let id = self.allocate_id();
        self.active_page_mut().nodes.push(Node {
            id,
            name: name.into(),
            kind,
            parent_id,
            mask_shape: false,
            boolean_operation: None,
            boolean_operands: Vec::new(),
            x: bounds[0],
            y: bounds[1],
            width: bounds[2],
            height: bounds[3],
            fill,
            stroke: [0.12, 0.14, 0.18, 1.0],
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
            guide_color: [0.25, 0.55, 1.0, 1.0],
            guide_opacity: default_guide_opacity(),
            locked: false,
            text: (kind == NodeKind::Text).then(TextStyle::default),
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
        });
        id
    }

    pub(crate) fn add_node(&mut self, kind: NodeKind) -> EntityId {
        let index = self.active_page().nodes.len() as f32;
        let offset = (index % 12.0) * 18.0;
        match kind {
            NodeKind::Frame => self.insert_node(
                "Frame",
                kind,
                None,
                [120.0 + offset, 120.0 + offset, 320.0, 240.0],
                [0.96, 0.97, 0.99, 1.0],
            ),
            NodeKind::Text => self.insert_node(
                "Text",
                kind,
                None,
                [160.0 + offset, 160.0 + offset, 240.0, 80.0],
                [0.08, 0.09, 0.12, 1.0],
            ),
            NodeKind::Vector => self.add_vector_shape(VectorGeometry::Ellipse, None),
            _ => self.insert_node(
                "Rectangle",
                kind,
                None,
                [160.0 + offset, 160.0 + offset, 160.0, 100.0],
                [0.46, 0.91, 0.72, 1.0],
            ),
        }
    }

    pub(crate) fn add_vector_shape(
        &mut self,
        geometry: VectorGeometry,
        parent_id: Option<EntityId>,
    ) -> EntityId {
        let index = self.active_page().nodes.len() as f32;
        let offset = (index % 12.0) * 18.0;
        let (name, width, height) = match &geometry {
            VectorGeometry::Ellipse => ("Ellipse", 140.0, 140.0),
            VectorGeometry::Line => ("Line", 180.0, 2.0),
            VectorGeometry::Polygon { .. } => ("Polygon", 150.0, 150.0),
            VectorGeometry::Star { .. } => ("Star", 160.0, 160.0),
            VectorGeometry::Path { .. } => ("Vector", 160.0, 120.0),
        };
        let valid_parent = parent_id.filter(|id| {
            self.active_node(*id)
                .is_some_and(|node| matches!(node.kind, NodeKind::Frame | NodeKind::Group))
        });
        let id = self.insert_node(
            name,
            NodeKind::Vector,
            valid_parent,
            [160.0 + offset, 160.0 + offset, width, height],
            [0.46, 0.91, 0.72, 1.0],
        );
        let node = self.active_node_mut(id).expect("inserted vector exists");
        node.stroke_width = if matches!(geometry, VectorGeometry::Line) {
            2.0
        } else {
            0.0
        };
        node.vector = Some(VectorData {
            geometry,
            fill_rule: FillRule::Nonzero,
        });
        self.orient_new_child(id);
        if let Some(parent) = valid_parent {
            self.relayout_container(parent);
        }
        id
    }

    fn orient_new_child(&mut self, node_id: EntityId) {
        let Some(parent) = self
            .active_node(node_id)
            .and_then(|node| node.parent_id)
            .and_then(|id| self.active_node(id))
            .cloned()
        else {
            return;
        };
        let mut axes = parent.clone();
        axes.rotation = 0.0;
        axes.flip_x = false;
        axes.flip_y = false;
        if let Some(node) = self.active_node_mut(node_id) {
            crate::geometry::transform_between(node, &axes, &parent);
        }
    }

    pub(crate) fn add_rectangle_to(&mut self, parent_id: Option<EntityId>) -> EntityId {
        let parent = parent_id.and_then(|id| {
            self.active_page()
                .nodes
                .iter()
                .find(|node| {
                    node.id == id && matches!(node.kind, NodeKind::Frame | NodeKind::Group)
                })
                .cloned()
        });
        let index = self.active_page().nodes.len() as f32;
        let bounds = parent
            .as_ref()
            .map(|parent| {
                [
                    parent.x + parent.layout_padding[3] + 24.0,
                    parent.y + parent.layout_padding[0] + 24.0,
                    160.0,
                    100.0,
                ]
            })
            .unwrap_or([
                160.0 + (index % 12.0) * 18.0,
                160.0 + (index % 12.0) * 18.0,
                160.0,
                100.0,
            ]);
        let actual_parent = parent.as_ref().map(|parent| parent.id);
        let id = self.insert_node(
            "Rectangle",
            NodeKind::Rectangle,
            actual_parent,
            bounds,
            [0.46, 0.91, 0.72, 1.0],
        );
        self.orient_new_child(id);
        if let Some(parent_id) = actual_parent {
            self.relayout_container(parent_id);
        }
        id
    }

    pub(crate) fn add_text_to(&mut self, parent_id: Option<EntityId>) -> EntityId {
        let parent = parent_id.and_then(|id| {
            self.active_page()
                .nodes
                .iter()
                .find(|node| {
                    node.id == id && matches!(node.kind, NodeKind::Frame | NodeKind::Group)
                })
                .cloned()
        });
        let index = self.active_page().nodes.len() as f32;
        let bounds = parent
            .as_ref()
            .map(|parent| {
                [
                    parent.x + parent.layout_padding[3] + 24.0,
                    parent.y + parent.layout_padding[0] + 24.0,
                    240.0,
                    80.0,
                ]
            })
            .unwrap_or([
                160.0 + (index % 12.0) * 18.0,
                160.0 + (index % 12.0) * 18.0,
                240.0,
                80.0,
            ]);
        let actual_parent = parent.as_ref().map(|parent| parent.id);
        let id = self.insert_node(
            "Text",
            NodeKind::Text,
            actual_parent,
            bounds,
            [0.08, 0.09, 0.12, 1.0],
        );
        self.orient_new_child(id);
        if let Some(parent_id) = actual_parent {
            self.relayout_container(parent_id);
        }
        id
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn add_media_asset_node(
        &mut self,
        kind: MediaAssetKind,
        name: String,
        mime_type: String,
        source: String,
        width: u32,
        height: u32,
        parent_id: Option<EntityId>,
    ) -> Option<EntityId> {
        if source.is_empty() || source.len() > 20_000_000 || width == 0 || height == 0 {
            return None;
        }
        let asset_id = self.allocate_id();
        let name: String = if name.trim().is_empty() {
            match kind {
                MediaAssetKind::Image => "Image".into(),
                MediaAssetKind::Icon => "Icon".into(),
            }
        } else {
            name.trim().chars().take(120).collect()
        };
        self.media_assets.push(MediaAsset {
            id: asset_id,
            name: name.clone(),
            kind,
            mime_type: mime_type.chars().take(100).collect(),
            source,
            width,
            height,
            tags: Vec::new(),
        });
        self.add_node_from_asset(asset_id, parent_id)
    }

    pub(crate) fn add_node_from_asset(
        &mut self,
        asset_id: EntityId,
        parent_id: Option<EntityId>,
    ) -> Option<EntityId> {
        let asset = self
            .media_assets
            .iter()
            .find(|asset| asset.id == asset_id)?
            .clone();
        let parent = parent_id.and_then(|id| {
            self.active_page()
                .nodes
                .iter()
                .find(|node| {
                    node.id == id && matches!(node.kind, NodeKind::Frame | NodeKind::Group)
                })
                .cloned()
        });
        let max_width: f32 = if asset.kind == MediaAssetKind::Icon {
            48.0
        } else {
            320.0
        };
        let ratio = asset.height as f32 / asset.width.max(1) as f32;
        let width = max_width.min(asset.width as f32).max(24.0);
        let height = if asset.kind == MediaAssetKind::Icon {
            width
        } else {
            (width * ratio).clamp(24.0, 320.0)
        };
        let index = self.active_page().nodes.len() as f32;
        let (x, y, actual_parent) = parent
            .as_ref()
            .map(|parent| {
                (
                    parent.x + parent.layout_padding[3] + 24.0,
                    parent.y + parent.layout_padding[0] + 24.0,
                    Some(parent.id),
                )
            })
            .unwrap_or((
                160.0 + (index % 12.0) * 18.0,
                160.0 + (index % 12.0) * 18.0,
                None,
            ));
        let node_kind = match asset.kind {
            MediaAssetKind::Image => NodeKind::Image,
            MediaAssetKind::Icon => NodeKind::Icon,
        };
        let id = self.insert_node(
            &asset.name,
            node_kind,
            actual_parent,
            [x, y, width, height],
            if node_kind == NodeKind::Icon {
                [0.08, 0.10, 0.12, 1.0]
            } else {
                [1.0; 4]
            },
        );
        let component_source_parent = actual_parent.is_some_and(|parent_id| {
            let mut current = self.active_node(parent_id);
            while let Some(node) = current {
                if node.component_id.is_some() && node.instance_root_id.is_none() {
                    return true;
                }
                current = node.parent_id.and_then(|id| self.active_node(id));
            }
            false
        });
        let node = self.active_node_mut(id).unwrap();
        node.asset_id = Some(asset_id);
        node.corner_radii = if node_kind == NodeKind::Image {
            [12.0; 4]
        } else {
            [0.0; 4]
        };
        if component_source_parent {
            node.component_slot_id = Some(id);
        }
        self.orient_new_child(id);
        if let Some(parent_id) = actual_parent {
            self.relayout_container(parent_id);
        }
        Some(id)
    }

    pub(crate) fn add_artboard(&mut self, name: String, width: f32, height: f32) -> EntityId {
        let right_edge = self
            .active_page()
            .nodes
            .iter()
            .filter(|node| node.kind == NodeKind::Frame && node.parent_id.is_none())
            .map(|node| node.x + node.width)
            .fold(0.0_f32, f32::max);
        let x = if right_edge == 0.0 {
            80.0
        } else {
            right_edge + 80.0
        };
        self.insert_node(
            &name,
            NodeKind::Frame,
            None,
            [x, 80.0, width, height],
            [0.96, 0.97, 0.99, 1.0],
        )
    }

    pub(crate) fn add_page(&mut self, name: String) -> EntityId {
        let id = self.allocate_id();
        self.pages.push(Page {
            id,
            name,
            description: String::new(),
            nodes: Vec::new(),
            benchmark_node_count: None,
            benchmark_modified_node_ids: Vec::new(),
        });
        self.active_page_id = id;
        id
    }

    pub(crate) fn add_document_color(&mut self, name: String, value: String) -> EntityId {
        if let Some(existing) = self.color_library.iter().find(|color| color.value == value) {
            return existing.id;
        }
        let id = self.allocate_id();
        self.color_library.push(ColorAsset {
            id,
            name: if name.trim().is_empty() {
                value.clone()
            } else {
                name.trim().to_owned()
            },
            value,
        });
        id
    }

    pub(crate) fn set_active_page(&mut self, page_id: EntityId) -> bool {
        if self.pages.iter().any(|page| page.id == page_id) {
            self.active_page_id = page_id;
            self.populate_active_benchmark();
            true
        } else {
            false
        }
    }

    pub(crate) fn rename_page(&mut self, page_id: EntityId, name: String) -> bool {
        let Some(page) = self.pages.iter_mut().find(|page| page.id == page_id) else {
            return false;
        };
        page.name = name;
        true
    }

    pub(crate) fn delete_page(&mut self, page_id: EntityId) -> bool {
        if self.pages.len() <= 1 || !self.pages.iter().any(|page| page.id == page_id) {
            return false;
        }
        let page_node_ids: HashSet<EntityId> = self
            .pages
            .iter()
            .find(|page| page.id == page_id)
            .map(|page| page.nodes.iter().map(|node| node.id).collect())
            .unwrap_or_default();
        if self
            .components
            .iter()
            .flat_map(|component| &component.variants)
            .any(|variant| page_node_ids.contains(&variant.source_root_id))
        {
            return false;
        }
        self.pages.retain(|page| page.id != page_id);
        if self.active_page_id == page_id {
            self.active_page_id = self.pages[0].id;
            self.populate_active_benchmark();
        }
        true
    }

    pub(crate) fn delete_node(&mut self, node_id: EntityId) -> bool {
        let page = self.active_page();
        if page
            .nodes
            .iter()
            .any(|node| node.id == node_id && node.locked)
        {
            return false;
        }
        let mut removed = HashSet::from([node_id]);
        loop {
            let descendants: Vec<_> = page
                .nodes
                .iter()
                .filter(|node| {
                    node.parent_id
                        .is_some_and(|parent| removed.contains(&parent))
                })
                .map(|node| node.id)
                .collect();
            let previous_len = removed.len();
            removed.extend(descendants);
            if removed.len() == previous_len {
                break;
            }
        }
        if self
            .components
            .iter()
            .flat_map(|component| &component.variants)
            .any(|variant| removed.contains(&variant.source_root_id))
        {
            return false;
        }
        let page = self.active_page_mut();
        let before = page.nodes.len();
        page.nodes.retain(|node| !removed.contains(&node.id));
        page.nodes.len() != before
    }

    pub(crate) fn rename_node(&mut self, node_id: EntityId, name: String) -> bool {
        if let Some(node) = self
            .active_page_mut()
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
        {
            if node.locked {
                return false;
            }
            node.name = name;
            true
        } else {
            false
        }
    }

    pub(crate) fn read_model(&self) -> DocumentReadModel<'_> {
        DocumentReadModel {
            schema_version: self.schema_version,
            active_page_id: self.active_page_id,
            pages: self
                .pages
                .iter()
                .map(|page| PageSummary {
                    id: page.id,
                    name: &page.name,
                    description: &page.description,
                    benchmark_node_count: page.benchmark_node_count,
                })
                .collect(),
            nodes: &self.active_page().nodes,
            document_colors: &self.color_library,
            number_variables: &self.number_variables,
            text_styles: &self.text_styles,
            media_assets: &self.media_assets,
            components: &self.components,
        }
    }

    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(format!(
                "Unsupported schema version {}",
                self.schema_version
            ));
        }
        if self.pages.is_empty() {
            return Err("Document must contain at least one page".into());
        }
        if !self.pages.iter().any(|page| page.id == self.active_page_id) {
            return Err("Active page does not exist".into());
        }
        let mut owned_ids = HashSet::new();
        let variable_ids: HashSet<_> = self.number_variables.iter().map(|item| item.id).collect();
        let text_style_ids: HashSet<_> = self.text_styles.iter().map(|item| item.id).collect();
        let media_asset_ids: HashSet<_> = self.media_assets.iter().map(|item| item.id).collect();
        let component_ids: HashSet<_> = self.components.iter().map(|item| item.id).collect();
        let all_node_ids: HashSet<_> = self
            .pages
            .iter()
            .flat_map(|page| page.nodes.iter().map(|node| node.id))
            .collect();
        for page in &self.pages {
            if !owned_ids.insert(page.id) {
                return Err(format!("Duplicate page or object ID {}", page.id));
            }
            let nodes_by_id: HashMap<_, _> =
                page.nodes.iter().map(|node| (node.id, node)).collect();
            if nodes_by_id.len() != page.nodes.len() {
                return Err(format!("Page {} contains duplicate node IDs", page.id));
            }
            let mut mask_parents = HashSet::new();
            for node in &page.nodes {
                if node.mask_shape {
                    if !crate::edit::mask_geometry_supported(node) {
                        return Err("Mask source must be a closed shape".into());
                    }
                    if let Some(parent) = node.parent_id
                        && nodes_by_id
                            .get(&parent)
                            .is_some_and(|n| n.kind == NodeKind::Group)
                        && !mask_parents.insert(parent)
                    {
                        return Err("A group can have only one mask shape".into());
                    }
                }
                if node.id.is_nil()
                    || ![
                        node.x,
                        node.y,
                        node.width,
                        node.height,
                        node.rotation,
                        node.stroke_width,
                        node.opacity,
                        node.layout_gap,
                        node.guide_gap,
                        node.guide_opacity,
                    ]
                    .iter()
                    .chain(&node.corner_radii)
                    .chain(&node.layout_padding)
                    .all(|v| v.is_finite())
                    || node.width <= 0.0
                    || node.height <= 0.0
                    || node.stroke_width < 0.0
                    || !(0.0..=1.0).contains(&node.opacity)
                    || node.corner_radii.iter().any(|v| *v < 0.0)
                    || node
                        .fill
                        .iter()
                        .chain(&node.stroke)
                        .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
                {
                    return Err(format!("Node {} has invalid geometry or paint", node.id));
                }
                if let Some(text) = &node.text
                    && (![text.font_size, text.line_height, text.letter_spacing]
                        .iter()
                        .all(|v| v.is_finite())
                        || text.font_size <= 0.0
                        || text.line_height <= 0.0)
                {
                    return Err(format!("Node {} has invalid typography", node.id));
                }
                let mut shadow_ids = HashSet::new();
                for shadow in &node.shadows {
                    if shadow.id.is_nil()
                        || !shadow_ids.insert(shadow.id)
                        || ![shadow.offset_x, shadow.offset_y, shadow.blur, shadow.spread]
                            .iter()
                            .all(|v| v.is_finite())
                        || shadow.blur < 0.0
                        || shadow
                            .color
                            .iter()
                            .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
                    {
                        return Err(format!("Node {} has invalid shadows", node.id));
                    }
                }
                if !owned_ids.insert(node.id) {
                    return Err(format!("Node {} belongs to more than one page", node.id));
                }
                if node.kind == NodeKind::Vector && node.vector.is_none() {
                    return Err(format!("Vector node {} has no geometry", node.id));
                }
                if node.kind != NodeKind::Vector
                    && node.boolean_operation.is_none()
                    && node.vector.is_some()
                {
                    return Err(format!("Non-vector node {} has vector geometry", node.id));
                }
                if node.boolean_operation.is_some() {
                    if node.kind != NodeKind::Group
                        || node.vector.is_none()
                        || node.mask_shape
                        || node.layout_mode != LayoutMode::None
                    {
                        return Err("Invalid boolean group".into());
                    }
                    let operands: Vec<_> = page
                        .nodes
                        .iter()
                        .filter(|child| child.parent_id == Some(node.id))
                        .collect();
                    if operands.len() > 64
                        || operands
                            .iter()
                            .any(|child| !crate::boolean::supported(child) || child.mask_shape)
                    {
                        return Err("Boolean groups accept at most 64 closed shapes".into());
                    }
                }
                if let Some(vector) = &node.vector {
                    validate_vector(node.id, vector)?;
                }
                if let Some(parent_id) = node.parent_id {
                    let Some(parent) = nodes_by_id.get(&parent_id) else {
                        return Err(format!(
                            "Node {} has a parent outside page {}",
                            node.id, page.id
                        ));
                    };
                    if !matches!(parent.kind, NodeKind::Frame | NodeKind::Group) {
                        return Err(format!(
                            "Node {} has non-container parent {}",
                            node.id, parent_id
                        ));
                    }
                }

                let mut ancestors = HashSet::new();
                let mut ancestor_id = node.parent_id;
                while let Some(id) = ancestor_id {
                    if id == node.id || !ancestors.insert(id) {
                        return Err(format!("Node {} is part of a parent cycle", node.id));
                    }
                    ancestor_id = nodes_by_id.get(&id).and_then(|ancestor| ancestor.parent_id);
                }
                for variable_id in [
                    node.variable_bindings.width,
                    node.variable_bindings.height,
                    node.variable_bindings.gap,
                    node.variable_bindings.padding[0],
                    node.variable_bindings.padding[1],
                    node.variable_bindings.padding[2],
                    node.variable_bindings.padding[3],
                ]
                .into_iter()
                .flatten()
                {
                    if !variable_ids.contains(&variable_id) {
                        return Err(format!(
                            "Node {} references missing variable {}",
                            node.id, variable_id
                        ));
                    }
                }
                if let Some(style_id) = node.text_style_id
                    && !text_style_ids.contains(&style_id)
                {
                    return Err(format!(
                        "Node {} references missing text style {}",
                        node.id, style_id
                    ));
                }
                if let Some(asset_id) = node.asset_id
                    && !media_asset_ids.contains(&asset_id)
                {
                    return Err(format!(
                        "Node {} references missing media asset {}",
                        node.id, asset_id
                    ));
                }
                if let Some(component_id) = node.component_id
                    && !component_ids.contains(&component_id)
                {
                    return Err(format!(
                        "Node {} references missing component {}",
                        node.id, component_id
                    ));
                }
            }
        }
        for color in &self.color_library {
            if !owned_ids.insert(color.id) {
                return Err(format!("Duplicate page or object ID {}", color.id));
            }
        }
        for variable in &self.number_variables {
            if !variable.value.is_finite() {
                return Err("Number variables must be finite".into());
            }
            if !owned_ids.insert(variable.id) {
                return Err(format!("Duplicate page or object ID {}", variable.id));
            }
        }
        for style in &self.text_styles {
            if ![
                style.style.font_size,
                style.style.line_height,
                style.style.letter_spacing,
            ]
            .iter()
            .all(|v| v.is_finite())
                || style.style.font_size <= 0.0
                || style.style.line_height <= 0.0
            {
                return Err("Invalid typography asset".into());
            }
            if !owned_ids.insert(style.id) {
                return Err(format!("Duplicate page or object ID {}", style.id));
            }
        }
        for asset in &self.media_assets {
            if !owned_ids.insert(asset.id) {
                return Err(format!("Duplicate page or object ID {}", asset.id));
            }
        }
        for component in &self.components {
            if !owned_ids.insert(component.id) {
                return Err(format!("Duplicate page or object ID {}", component.id));
            }
            for variant in &component.variants {
                if !owned_ids.insert(variant.id) {
                    return Err(format!("Duplicate page or object ID {}", variant.id));
                }
                if !all_node_ids.contains(&variant.source_root_id) {
                    return Err(format!(
                        "Component variant {} references missing source {}",
                        variant.id, variant.source_root_id
                    ));
                }
            }
        }
        if owned_ids.contains(&Uuid::nil()) {
            return Err("Object identities must not be nil".into());
        }
        Ok(())
    }
}

fn validate_vector(node_id: EntityId, vector: &VectorData) -> Result<(), String> {
    match &vector.geometry {
        VectorGeometry::Polygon { sides } if !(3..=100).contains(sides) => {
            return Err(format!("Vector node {node_id} has invalid polygon sides"));
        }
        VectorGeometry::Star {
            points,
            inner_ratio,
        } if !(3..=100).contains(points)
            || !inner_ratio.is_finite()
            || !(0.01..=0.99).contains(inner_ratio) =>
        {
            return Err(format!("Vector node {node_id} has invalid star geometry"));
        }
        VectorGeometry::Path { contours } => {
            for contour in contours {
                if contour.points.len() < 2
                    || contour.points.iter().any(|point| {
                        point
                            .position
                            .iter()
                            .chain(point.handle_in.iter().flatten())
                            .chain(point.handle_out.iter().flatten())
                            .any(|value| !value.is_finite())
                    })
                {
                    return Err(format!("Vector node {node_id} has an invalid contour"));
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn benchmark_node(id: EntityId, index: usize, columns: usize) -> Node {
    let column = index % columns;
    let row = index / columns;
    Node {
        id,
        name: format!("Node {}", index + 1),
        mask_shape: false,
        boolean_operation: None,
        boolean_operands: Vec::new(),
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
