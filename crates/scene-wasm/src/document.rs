use crate::geometry::point_in_rotated_node;
use crate::*;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

impl Document {
    pub(crate) fn demo() -> Self {
        let home_id = Uuid::now_v7();
        let mut document = Self {
            schema_version: SCHEMA_VERSION,
            active_page_id: home_id,
            pages: vec![Page {
                id: home_id,
                name: "Home".into(),
                description: "Sample mobile and desktop interface composition.".into(),
                nodes: Vec::new(),
                benchmark_node_count: None,
                benchmark_modified_node_ids: Vec::new(),
            }],
            color_library: Vec::new(),
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

        document.insert_demo_text(
            mobile,
            "Mobile brand",
            "NOVA",
            [126.0, 128.0, 120.0, 24.0],
            18.0,
            800,
            [0.93, 0.96, 1.0, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Mobile menu",
            "•••",
            [380.0, 127.0, 42.0, 24.0],
            18.0,
            700,
            [0.70, 0.74, 0.82, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Hero title",
            "Your money,\nfinally clear.",
            [128.0, 216.0, 270.0, 68.0],
            30.0,
            800,
            [1.0, 1.0, 1.0, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Hero subtitle",
            "Spending, saving, and goals—together.",
            [128.0, 342.0, 280.0, 20.0],
            12.0,
            400,
            [0.84, 0.88, 1.0, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Action label",
            "Start planning  →",
            [142.0, 297.0, 170.0, 22.0],
            12.0,
            700,
            [0.08, 0.12, 0.11, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Flow label",
            "MONTHLY FLOW",
            [122.0, 422.0, 120.0, 16.0],
            10.0,
            700,
            [0.39, 0.43, 0.51, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Flow value",
            "$8,420",
            [122.0, 452.0, 120.0, 32.0],
            24.0,
            800,
            [0.08, 0.10, 0.14, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Flow change",
            "+12.4% this month",
            [122.0, 510.0, 130.0, 20.0],
            11.0,
            600,
            [0.16, 0.55, 0.37, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Goals label",
            "GOALS",
            [304.0, 422.0, 100.0, 16.0],
            10.0,
            700,
            [0.39, 0.43, 0.51, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Goals value",
            "82%",
            [304.0, 452.0, 110.0, 32.0],
            24.0,
            800,
            [0.08, 0.10, 0.14, 1.0],
        );
        document.insert_demo_text(
            mobile,
            "Goals status",
            "3 goals on track",
            [304.0, 510.0, 125.0, 20.0],
            11.0,
            600,
            [0.23, 0.36, 0.78, 1.0],
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
        document.build_demo_auto_layouts(
            mobile,
            desktop,
            [mobile_card_a, mobile_card_b],
            [desktop_metric_a, desktop_metric_b],
        );

        for (name, description, count) in [
            (
                "1K Nodes · Baseline",
                "A lightweight grid for validating normal editor responsiveness.",
                1_000,
            ),
            (
                "10K Nodes · Large",
                "A large scene for measuring interaction and rendering headroom.",
                10_000,
            ),
            (
                "50K Nodes · Stress",
                "A stress scene for observing frame rate and memory pressure.",
                50_000,
            ),
            (
                "100K Nodes · Extreme",
                "An extreme scene for testing engine and GPU scaling limits.",
                100_000,
            ),
        ] {
            document.add_benchmark_page(name, description, count);
        }
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

    fn build_demo_auto_layouts(
        &mut self,
        mobile: EntityId,
        desktop: EntityId,
        mobile_cards: [EntityId; 2],
        desktop_metrics: [EntityId; 2],
    ) {
        let card_row = self.insert_demo_group(
            mobile,
            "Overview cards · Auto layout",
            [104.0, 400.0, 342.0, 170.0],
            LayoutMode::Row,
            22.0,
        );
        for id in mobile_cards {
            self.active_node_mut(id).unwrap().parent_id = Some(card_row);
        }
        self.relayout_container(card_row);

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

        let activity = self.insert_demo_group(
            mobile,
            "Recent activity · Auto layout",
            [104.0, 610.0, 342.0, 146.0],
            LayoutMode::Column,
            8.0,
        );
        let title = self.insert_demo_text(
            activity,
            "Activity title",
            "Recent activity",
            [104.0, 610.0, 342.0, 26.0],
            18.0,
            800,
            [0.08, 0.10, 0.14, 1.0],
        );
        self.active_node_mut(title).unwrap().width_sizing = LayoutSizing::Fill;
        for (index, (label, amount, tint)) in [
            ("Coffee shop", "−$6.40", [0.95, 0.68, 0.40, 1.0]),
            ("Salary", "+$4,200", [0.46, 0.91, 0.72, 1.0]),
            ("Cloud storage", "−$12.00", [0.55, 0.64, 0.92, 1.0]),
        ]
        .into_iter()
        .enumerate()
        {
            let y = 644.0 + index as f32 * 36.0;
            let row = self.insert_demo_group(
                activity,
                &format!("Activity row {} · Auto layout", index + 1),
                [104.0, y, 342.0, 28.0],
                LayoutMode::Row,
                8.0,
            );
            let icon = self.insert_node(
                "Category icon",
                NodeKind::Rectangle,
                Some(row),
                [104.0, y, 28.0, 28.0],
                tint,
            );
            self.style_demo_shape(icon, 8.0, tint, 0.0, false);
            let label_id = self.insert_demo_text(
                row,
                "Activity name",
                label,
                [140.0, y + 6.0, 226.0, 18.0],
                12.0,
                600,
                [0.30, 0.34, 0.41, 1.0],
            );
            self.active_node_mut(label_id).unwrap().width_sizing = LayoutSizing::Fill;
            self.insert_demo_text(
                row,
                "Activity amount",
                amount,
                [374.0, y + 6.0, 72.0, 18.0],
                12.0,
                700,
                if amount.starts_with('+') {
                    [0.16, 0.55, 0.37, 1.0]
                } else {
                    [0.22, 0.25, 0.31, 1.0]
                },
            );
            self.relayout_container(row);
        }
        self.relayout_container(activity);
    }

    fn add_benchmark_page(&mut self, name: &str, description: &str, node_count: usize) {
        let id = self.allocate_id();
        self.pages.push(Page {
            id,
            name: name.into(),
            description: description.into(),
            nodes: Vec::new(),
            benchmark_node_count: Some(node_count),
            benchmark_modified_node_ids: Vec::new(),
        });
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
            _ => self.insert_node(
                "Rectangle",
                kind,
                None,
                [160.0 + offset, 160.0 + offset, 160.0, 100.0],
                [0.46, 0.91, 0.72, 1.0],
            ),
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
        if let Some(parent_id) = actual_parent {
            self.relayout_container(parent_id);
        }
        id
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

    pub(crate) fn delete_node(&mut self, node_id: EntityId) -> bool {
        let page = self.active_page_mut();
        if page
            .nodes
            .iter()
            .any(|node| node.id == node_id && node.locked)
        {
            return false;
        }
        let before = page.nodes.len();
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
                })
                .collect(),
            nodes: &self.active_page().nodes,
            document_colors: &self.color_library,
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
        for page in &self.pages {
            if !owned_ids.insert(page.id) {
                return Err(format!("Duplicate page or object ID {}", page.id));
            }
            let nodes_by_id: HashMap<_, _> =
                page.nodes.iter().map(|node| (node.id, node)).collect();
            if nodes_by_id.len() != page.nodes.len() {
                return Err(format!("Page {} contains duplicate node IDs", page.id));
            }
            for node in &page.nodes {
                if !owned_ids.insert(node.id) {
                    return Err(format!("Node {} belongs to more than one page", node.id));
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
            }
        }
        for color in &self.color_library {
            if !owned_ids.insert(color.id) {
                return Err(format!("Duplicate page or object ID {}", color.id));
            }
        }
        Ok(())
    }
}

fn benchmark_node(id: EntityId, index: usize, columns: usize) -> Node {
    let column = index % columns;
    let row = index / columns;
    Node {
        id,
        name: format!("Node {}", index + 1),
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
    }
}
