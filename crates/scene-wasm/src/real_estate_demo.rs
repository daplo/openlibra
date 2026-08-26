use crate::*;
use uuid::Uuid;
impl Document {
    pub(crate) fn style_demo_shape(
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
    pub(crate) fn insert_demo_text(
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

    pub(crate) fn insert_demo_group(
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

    pub(crate) fn build_real_estate_mobile(
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

    pub(crate) fn build_demo_auto_layouts(
        &mut self,
        desktop: EntityId,
        desktop_metrics: [EntityId; 2],
    ) {
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
}
