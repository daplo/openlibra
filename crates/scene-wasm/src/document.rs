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
            number_variables: Vec::new(),
            text_styles: Vec::new(),
            media_assets: Vec::new(),
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

    fn build_finance_mobile_demo(&mut self) {
        for (name, value) in [
            ("Finance / Ink", "#103D20"),
            ("Finance / Lime", "#A6EB67"),
            ("Finance / Surface", "#FFFFFF"),
            ("Finance / Muted", "#F4F7F1"),
        ] {
            self.add_document_color(name.into(), value.into());
        }
        for (name, value) in [
            ("Space / 8", 8.0),
            ("Space / 12", 12.0),
            ("Space / 16", 16.0),
            ("Space / 24", 24.0),
            ("Radius / Card", 18.0),
            ("Size / Mobile", 320.0),
        ] {
            self.add_number_variable(name.into(), value);
        }
        let display = self.finance_text_style("Display / Large", 32.0, 500, 1.18);
        let title = self.finance_text_style("Title / Section", 18.0, 650, 1.2);
        let body = self.finance_text_style("Body / Regular", 13.0, 400, 1.35);
        let label = self.finance_text_style("Label / Small", 10.0, 500, 1.25);

        let home_icon = self.finance_icon_asset(
            "Home",
            "<path d='M4 11 12 4l8 7v9H4Z'/><path d='M9 20v-6h6v6'/>",
        );
        let chart_icon =
            self.finance_icon_asset("Analytics", "<path d='M5 19V10M12 19V5M19 19v-7'/>");
        let scan_icon = self.finance_icon_asset(
            "Scan",
            "<path d='M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5'/><path d='M8 12h8'/>",
        );
        let card_icon = self.finance_icon_asset(
            "Card",
            "<rect x='3' y='6' width='18' height='12' rx='2'/><path d='M3 10h18'/>",
        );
        let user_icon = self.finance_icon_asset(
            "Profile",
            "<circle cx='12' cy='8' r='4'/><path d='M4 21a8 8 0 0 1 16 0'/>",
        );

        let welcome = self.finance_frame("Finance · Welcome", 80.0, [0.65, 0.92, 0.40, 1.0]);
        self.finance_status_bar(welcome, 104.0, label, true);
        let mark = self.finance_group(
            welcome,
            "Brand mark",
            [108.0, 138.0, 38.0, 38.0],
            LayoutMode::Row,
            0.0,
            [0.04, 0.28, 0.12, 1.0],
            8.0,
        );
        self.finance_text(
            mark,
            "Brand glyph",
            "◼",
            [115.0, 143.0, 24.0, 24.0],
            title,
            [0.65, 0.92, 0.40, 1.0],
        );
        let hero = self.finance_group(
            welcome,
            "Welcome copy · Auto layout",
            [108.0, 360.0, 272.0, 190.0],
            LayoutMode::Column,
            14.0,
            [0.0; 4],
            0.0,
        );
        self.finance_text(
            hero,
            "Welcome headline",
            "Track Your\nSpending\nEffortlessly.",
            [108.0, 360.0, 272.0, 116.0],
            display,
            [0.03, 0.22, 0.10, 1.0],
        );
        self.finance_text(
            hero,
            "Welcome description",
            "Manage your finances easily using our intuitive interface and monitor your progress.",
            [108.0, 490.0, 272.0, 58.0],
            body,
            [0.16, 0.35, 0.22, 1.0],
        );
        let cta = self.finance_group(
            welcome,
            "Get started button",
            [108.0, 574.0, 272.0, 44.0],
            LayoutMode::Row,
            0.0,
            [0.03, 0.27, 0.11, 1.0],
            22.0,
        );
        self.finance_text(
            cta,
            "Get started label",
            "Get Started",
            [108.0, 586.0, 272.0, 20.0],
            body,
            [1.0, 1.0, 1.0, 1.0],
        );
        self.finance_text(
            welcome,
            "Login prompt",
            "Already have an account?  Login",
            [108.0, 636.0, 272.0, 22.0],
            label,
            [0.12, 0.31, 0.17, 1.0],
        );

        let wallet = self.finance_frame("Finance · Wallet", 440.0, [1.0, 1.0, 1.0, 1.0]);
        self.finance_status_bar(wallet, 464.0, label, false);
        let wallet_content = self.finance_group(
            wallet,
            "Wallet content · Auto layout",
            [468.0, 144.0, 272.0, 486.0],
            LayoutMode::Column,
            16.0,
            [0.0; 4],
            0.0,
        );
        self.finance_text(
            wallet_content,
            "Greeting",
            "Hi, Jonathan",
            [468.0, 144.0, 220.0, 28.0],
            title,
            [0.06, 0.08, 0.07, 1.0],
        );
        self.finance_text(
            wallet_content,
            "Greeting subtitle",
            "Welcome Back!",
            [468.0, 174.0, 160.0, 18.0],
            label,
            [0.45, 0.47, 0.45, 1.0],
        );
        self.finance_text(
            wallet_content,
            "Balance label",
            "Wallet Balance",
            [468.0, 212.0, 150.0, 18.0],
            label,
            [0.45, 0.47, 0.45, 1.0],
        );
        self.finance_text(
            wallet_content,
            "Balance",
            "$17,298.92  •",
            [468.0, 234.0, 272.0, 48.0],
            display,
            [0.03, 0.05, 0.04, 1.0],
        );
        let cards = self.finance_group(
            wallet_content,
            "Cards · Auto layout",
            [468.0, 302.0, 272.0, 58.0],
            LayoutMode::Row,
            10.0,
            [0.0; 4],
            0.0,
        );
        self.finance_text(
            cards,
            "Cards label",
            "Cards   +",
            [468.0, 318.0, 82.0, 22.0],
            body,
            [0.05, 0.07, 0.06, 1.0],
        );
        for (index, text) in ["•••• 7391", "•••• 7391"].iter().enumerate() {
            let card = self.finance_group(
                cards,
                &format!("Payment card {}", index + 1),
                [560.0 + index as f32 * 92.0, 302.0, 82.0, 46.0],
                LayoutMode::Row,
                0.0,
                if index == 0 {
                    [0.18, 0.49, 0.32, 1.0]
                } else {
                    [0.04, 0.12, 0.09, 1.0]
                },
                8.0,
            );
            self.finance_text(
                card,
                "Card ending",
                text,
                [566.0 + index as f32 * 92.0, 316.0, 70.0, 18.0],
                label,
                [1.0, 1.0, 1.0, 1.0],
            );
        }
        let actions = self.finance_group(
            wallet_content,
            "Quick actions · Auto layout",
            [468.0, 378.0, 272.0, 44.0],
            LayoutMode::Row,
            8.0,
            [0.0; 4],
            0.0,
        );
        for (index, text) in ["↗  Send", "↙  Request", "••"].iter().enumerate() {
            let width = if index == 2 { 44.0 } else { 104.0 };
            let x = 468.0
                + if index == 0 {
                    0.0
                } else if index == 1 {
                    112.0
                } else {
                    224.0
                };
            let action = self.finance_group(
                actions,
                text,
                [x, 378.0, width, 40.0],
                LayoutMode::Row,
                0.0,
                if index == 0 {
                    [0.02, 0.36, 0.10, 1.0]
                } else {
                    [0.70, 0.96, 0.48, 1.0]
                },
                20.0,
            );
            self.finance_text(
                action,
                "Action label",
                text,
                [x, 389.0, width, 18.0],
                label,
                if index == 0 {
                    [1.0, 1.0, 1.0, 1.0]
                } else {
                    [0.02, 0.25, 0.08, 1.0]
                },
            );
        }
        self.finance_text(
            wallet_content,
            "Recent heading",
            "Recent Activity                         See Details ›",
            [468.0, 448.0, 272.0, 22.0],
            label,
            [0.05, 0.07, 0.06, 1.0],
        );
        for (index, row) in [
            "●   Dribbble                         -$120",
            "WM  Wilson Mango                 -$240",
            "●   Abram Botosh                  +$450",
        ]
        .iter()
        .enumerate()
        {
            self.finance_text(
                wallet_content,
                "Transaction row",
                row,
                [468.0, 486.0 + index as f32 * 48.0, 272.0, 34.0],
                body,
                [0.05, 0.08, 0.06, 1.0],
            );
        }
        self.finance_bottom_nav(
            wallet,
            464.0,
            [home_icon, chart_icon, scan_icon, card_icon, user_icon],
        );

        let analytics = self.finance_frame("Finance · Analytics", 800.0, [1.0, 1.0, 1.0, 1.0]);
        self.finance_status_bar(analytics, 824.0, label, false);
        self.finance_text(
            analytics,
            "Analytics title",
            "Analytics",
            [828.0, 154.0, 272.0, 28.0],
            title,
            [0.05, 0.07, 0.06, 1.0],
        );
        let spending = self.finance_group(
            analytics,
            "Spending summary · Auto layout",
            [828.0, 210.0, 272.0, 92.0],
            LayoutMode::Column,
            7.0,
            [0.98, 0.99, 0.97, 1.0],
            12.0,
        );
        self.finance_text(
            spending,
            "Spending label",
            "My Spending",
            [844.0, 224.0, 130.0, 18.0],
            label,
            [0.45, 0.47, 0.45, 1.0],
        );
        self.finance_text(
            spending,
            "Spending value",
            "$7,221.18       ▁▃▂▅▇▆▃",
            [844.0, 248.0, 240.0, 30.0],
            title,
            [0.05, 0.08, 0.06, 1.0],
        );
        let expense = self.finance_group(
            analytics,
            "Expense chart · Auto layout",
            [828.0, 324.0, 272.0, 190.0],
            LayoutMode::Column,
            8.0,
            [1.0, 1.0, 1.0, 1.0],
            12.0,
        );
        self.finance_text(
            expense,
            "Expense label",
            "Expense                         Jul 2024⌄",
            [828.0, 332.0, 272.0, 20.0],
            label,
            [0.43, 0.45, 0.43, 1.0],
        );
        self.finance_text(
            expense,
            "Expense value",
            "-$2,082.12",
            [828.0, 360.0, 200.0, 34.0],
            title,
            [0.04, 0.06, 0.05, 1.0],
        );
        self.finance_text(
            expense,
            "Chart",
            "╭──╮      ╭────╮\n╯  ╰──────╯    ╰──",
            [828.0, 408.0, 272.0, 62.0],
            body,
            [0.39, 0.75, 0.12, 1.0],
        );
        self.finance_text(
            expense,
            "Chart months",
            "Feb      Mar      Apr      May      Jun      Jul",
            [828.0, 482.0, 272.0, 18.0],
            label,
            [0.48, 0.50, 0.48, 1.0],
        );
        let categories = self.finance_group(
            analytics,
            "Expense categories · Auto layout",
            [828.0, 526.0, 272.0, 104.0],
            LayoutMode::Column,
            8.0,
            [0.0; 4],
            0.0,
        );
        for (index, row) in [
            "●  Healthcare                                  $450.00",
            "●  Food                                             $250.00",
            "●  Utilities                                       $275.00",
            "●  Supplies                                      $150.00",
        ]
        .iter()
        .enumerate()
        {
            self.finance_text(
                categories,
                "Category row",
                row,
                [828.0, 526.0 + index as f32 * 25.0, 272.0, 20.0],
                label,
                [0.03, 0.25, 0.09, 1.0],
            );
        }
        self.finance_bottom_nav(
            analytics,
            824.0,
            [home_icon, chart_icon, scan_icon, card_icon, user_icon],
        );
    }

    fn finance_frame(&mut self, name: &str, x: f32, fill: [f32; 4]) -> EntityId {
        let id = self.insert_node(name, NodeKind::Frame, None, [x, 80.0, 320.0, 680.0], fill);
        self.style_demo_shape(id, 34.0, [0.12, 0.14, 0.13, 1.0], 2.0, true);
        if let Some(variable_id) = self
            .number_variables
            .iter()
            .find(|variable| variable.name == "Size / Mobile")
            .map(|variable| variable.id)
        {
            self.bind_node_variable(id, "width", Some(variable_id));
        }
        id
    }

    fn finance_text_style(&mut self, name: &str, size: f32, weight: u16, line: f32) -> EntityId {
        let text = TextStyle {
            font_family: "Inter".into(),
            font_size: size,
            font_weight: weight,
            line_height: line,
            ..TextStyle::default()
        };
        self.add_text_style(name.into(), TypographyStyle::from(&text))
    }

    fn finance_text(
        &mut self,
        parent: EntityId,
        name: &str,
        content: &str,
        bounds: [f32; 4],
        style: EntityId,
        color: [f32; 4],
    ) -> EntityId {
        let id = self.insert_demo_text(parent, name, content, bounds, 13.0, 400, color);
        self.bind_node_text_style(id, Some(style));
        id
    }

    #[allow(clippy::too_many_arguments)]
    fn finance_group(
        &mut self,
        parent: EntityId,
        name: &str,
        bounds: [f32; 4],
        mode: LayoutMode,
        gap: f32,
        fill: [f32; 4],
        radius: f32,
    ) -> EntityId {
        let id = self.insert_demo_group(parent, name, bounds, mode, gap);
        let node = self.active_node_mut(id).unwrap();
        node.fill = fill;
        node.corner_radii = [radius; 4];
        if gap > 0.0
            && let Some(variable_id) = self
                .number_variables
                .iter()
                .find(|variable| (variable.value - gap).abs() < f32::EPSILON)
                .map(|variable| variable.id)
        {
            self.bind_node_variable(id, "gap", Some(variable_id));
        }
        id
    }

    fn finance_status_bar(&mut self, frame: EntityId, x: f32, style: EntityId, dark: bool) {
        let color = if dark {
            [0.02, 0.20, 0.08, 1.0]
        } else {
            [0.05, 0.07, 0.06, 1.0]
        };
        self.finance_text(
            frame,
            "Status bar",
            "9:41                              ▮▮▮  ◉  ▰",
            [x + 4.0, 102.0, 272.0, 20.0],
            style,
            color,
        );
        let island = self.finance_group(
            frame,
            "Dynamic island",
            [x + 96.0, 98.0, 92.0, 28.0],
            LayoutMode::Row,
            0.0,
            [0.0, 0.0, 0.0, 1.0],
            16.0,
        );
        self.active_node_mut(island).unwrap().locked = false;
    }

    fn finance_icon_asset(&mut self, name: &str, paths: &str) -> EntityId {
        let id = self.allocate_id();
        self.media_assets.push(MediaAsset { id, name: name.into(), kind: MediaAssetKind::Icon, mime_type: "image/svg+xml".into(), source: format!("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>{paths}</svg>"), width: 24, height: 24, tags: vec!["finance".into(), "navigation".into()] });
        id
    }

    fn finance_bottom_nav(&mut self, frame: EntityId, x: f32, assets: [EntityId; 5]) {
        let nav = self.finance_group(
            frame,
            "Bottom navigation · Auto layout",
            [x + 4.0, 692.0, 272.0, 48.0],
            LayoutMode::Row,
            25.0,
            [1.0, 1.0, 1.0, 0.96],
            18.0,
        );
        for (index, asset_id) in assets.into_iter().enumerate() {
            if let Some(id) = self.add_node_from_asset(asset_id, Some(nav)) {
                let node = self.active_node_mut(id).unwrap();
                node.name = format!("Navigation icon {}", index + 1);
                node.x = x + 14.0 + index as f32 * 52.0;
                node.y = 704.0;
                node.width = 22.0;
                node.height = 22.0;
                node.fill = if index == 2 {
                    [0.18, 0.55, 0.12, 1.0]
                } else {
                    [0.18, 0.22, 0.19, 1.0]
                };
            }
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
            variable_bindings: VariableBindings::default(),
            text_style_id: None,
            asset_id: None,
            image_fit: ImageFit::Cover,
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
        let node = self.active_node_mut(id).unwrap();
        node.asset_id = Some(asset_id);
        node.corner_radii = if node_kind == NodeKind::Image {
            [12.0; 4]
        } else {
            [0.0; 4]
        };
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
            number_variables: &self.number_variables,
            text_styles: &self.text_styles,
            media_assets: &self.media_assets,
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
            }
        }
        for color in &self.color_library {
            if !owned_ids.insert(color.id) {
                return Err(format!("Duplicate page or object ID {}", color.id));
            }
        }
        for variable in &self.number_variables {
            if !owned_ids.insert(variable.id) {
                return Err(format!("Duplicate page or object ID {}", variable.id));
            }
        }
        for style in &self.text_styles {
            if !owned_ids.insert(style.id) {
                return Err(format!("Duplicate page or object ID {}", style.id));
            }
        }
        for asset in &self.media_assets {
            if !owned_ids.insert(asset.id) {
                return Err(format!("Duplicate page or object ID {}", asset.id));
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
        variable_bindings: VariableBindings::default(),
        text_style_id: None,
        asset_id: None,
        image_fit: ImageFit::Cover,
    }
}
