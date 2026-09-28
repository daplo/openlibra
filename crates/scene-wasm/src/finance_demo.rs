//! Editable starter artwork: real layout, shared styles and reusable components.
use crate::*;

type Color = [f32; 4];
const INK: Color = [0.055, 0.18, 0.14, 1.0];
const MUTED: Color = [0.38, 0.44, 0.41, 1.0];
const GREEN: Color = [0.06, 0.31, 0.22, 1.0];
const LIME: Color = [0.77, 0.95, 0.49, 1.0];
const PAPER: Color = [0.97, 0.98, 0.96, 1.0];
const WHITE: Color = [1.0; 4];
const CLEAR: Color = [0.0; 4];

impl Document {
    pub(crate) fn build_finance_mobile_demo(&mut self) {
        for (name, value) in [
            ("Forest", "#0F4F38"),
            ("Lime", "#C4F27D"),
            ("Ink", "#0E2E24"),
            ("Paper", "#F7FAF5"),
            ("Muted", "#617069"),
        ] {
            self.add_document_color(format!("Finance / {name}"), value.into());
        }
        for (name, value) in [
            ("Space / 8", 8.0),
            ("Space / 12", 12.0),
            ("Space / 16", 16.0),
            ("Space / 24", 24.0),
            ("Radius / Card", 20.0),
            ("Size / Mobile", 360.0),
        ] {
            self.add_number_variable(name.into(), value);
        }
        let hero = self.finance_text_style("Display / Hero", 38.0, 600, 1.1, TextAlign::Left);
        let balance =
            self.finance_text_style("Display / Balance", 34.0, 600, 1.18, TextAlign::Left);
        let title = self.finance_text_style("Title / Section", 22.0, 600, 1.25, TextAlign::Left);
        let body = self.finance_text_style("Body / Regular", 14.0, 400, 1.45, TextAlign::Left);
        let strong = self.finance_text_style("Body / Medium", 14.0, 600, 1.4, TextAlign::Left);
        let label = self.finance_text_style("Label / Small", 11.0, 500, 1.4, TextAlign::Left);
        let right = self.finance_text_style("Amount / Right", 14.0, 600, 1.4, TextAlign::Right);
        let center = self.finance_text_style("Label / Center", 11.0, 500, 1.4, TextAlign::Center);
        let home = self.finance_icon_asset(
            "Home",
            "<path d='m3 10 9-7 9 7v10H3Z'/><path d='M9 20v-7h6v7'/>",
        );
        let chart = self.finance_icon_asset("Analytics", "<path d='M5 20V12M12 20V4M19 20V8'/>");
        let scan = self.finance_icon_asset(
            "Scan",
            "<path d='M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10'/>",
        );
        let target = self.finance_icon_asset(
            "Goals",
            "<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='4'/><path d='m12 12 8-8'/>",
        );
        let user = self.finance_icon_asset(
            "Profile",
            "<circle cx='12' cy='8' r='4'/><path d='M4 21a8 8 0 0 1 16 0'/>",
        );
        let up = self.finance_icon_asset("Arrow up right", "<path d='M6 18 18 6M6 6h12v12'/>");
        let down = self.finance_icon_asset("Arrow down left", "<path d='M18 6 6 18M6 6v12h12'/>");
        let more = self.finance_icon_asset("More", "<circle cx='4' cy='12' r='1'/><circle cx='12' cy='12' r='1'/><circle cx='20' cy='12' r='1'/>");
        let card = self.finance_icon_asset(
            "Card",
            "<rect x='2' y='5' width='20' height='14' rx='3'/><path d='M2 10h20m-15 5h4'/>",
        );
        let globe = self.finance_icon_asset("Globe", "<circle cx='12' cy='12' r='9'/><ellipse cx='12' cy='12' rx='4' ry='9'/><path d='M3 12h18'/>");
        let shield = self.finance_icon_asset(
            "Shield",
            "<path d='m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z'/><path d='m8 12 3 3 5-6'/>",
        );
        let desk = self.finance_icon_asset(
            "Workspace",
            "<rect x='3' y='4' width='18' height='12' rx='2'/><path d='M12 16v4M7 20h10'/>",
        );
        let bag = self.finance_icon_asset(
            "Shopping bag",
            "<path d='M4 8h16l-1 13H5Z'/><path d='M8 8V6a4 4 0 0 1 8 0v2'/>",
        );
        let bell = self.finance_icon_asset(
            "Notifications",
            "<path d='M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4'/>",
        );
        let wifi = self.finance_icon_asset("Wi-Fi", "<path d='M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0m-8 4a3 3 0 0 1 4 0'/><circle cx='12' cy='20' r='.5'/>");
        let battery = self.finance_icon_asset(
            "Battery",
            "<rect x='2' y='7' width='17' height='10' rx='2'/><path d='M22 10v4M5 10h11v4H5Z'/>",
        );
        let arrow = self.finance_icon_asset("Arrow right", "<path d='M4 12h16m-6-6 6 6-6 6'/>");
        let leaf = self.finance_icon_asset(
            "Sprout",
            "<path d='M12 21v-9M12 16C4 16 3 10 3 6c7 0 9 4 9 10Zm0-4c0-6 4-9 9-9 0 6-3 9-9 9Z'/>",
        );

        let welcome = self.finance_frame("Finance · Welcome", 80.0, LIME);
        self.finance_status_bar(welcome, label, wifi, battery);
        let content = self.finance_container(
            welcome,
            "Welcome copy · Auto layout",
            312.0,
            644.0,
            LayoutMode::Column,
            24.0,
            CLEAR,
            0.0,
        );
        self.finance_position(content, 104.0, 154.0);
        let brand = self.finance_container(
            content,
            "Brand",
            312.0,
            36.0,
            LayoutMode::Row,
            10.0,
            CLEAR,
            0.0,
        );
        self.finance_icon(brand, leaf, 30.0, GREEN);
        self.finance_text(brand, "Brand name", "moss", 200.0, 32.0, title, INK);
        let art = self.finance_container(
            content,
            "Welcome artwork",
            312.0,
            210.0,
            LayoutMode::None,
            0.0,
            CLEAR,
            0.0,
        );
        let orbit = self.add_vector_shape(VectorGeometry::Ellipse, Some(art));
        self.set_node_bounds(orbit, 142.0, 164.0, 230.0, 190.0);
        self.active_node_mut(orbit).unwrap().fill = [0.87, 0.98, 0.71, 1.0];
        let preview = self.finance_container(
            art,
            "Savings preview",
            246.0,
            144.0,
            LayoutMode::Column,
            10.0,
            GREEN,
            22.0,
        );
        self.finance_position(preview, 130.0, 194.0);
        self.finance_padding(preview, 20.0);
        self.finance_text(
            preview,
            "Preview label",
            "A LITTLE TODAY. MORE TOMORROW.",
            206.0,
            16.0,
            label,
            LIME,
        );
        self.finance_text(
            preview,
            "Preview balance",
            "$8,420.00",
            206.0,
            42.0,
            balance,
            WHITE,
        );
        let preview_row = self.finance_container(
            preview,
            "Savings trend",
            206.0,
            20.0,
            LayoutMode::Row,
            8.0,
            CLEAR,
            0.0,
        );
        self.finance_icon(preview_row, up, 16.0, LIME);
        self.finance_text(
            preview_row,
            "Preview trend",
            "+12.4% this month",
            182.0,
            18.0,
            label,
            LIME,
        );
        self.finance_text(
            content,
            "Welcome headline",
            "Make money\nfeel simple.",
            312.0,
            90.0,
            hero,
            INK,
        );
        self.finance_text(
            content,
            "Welcome description",
            "Spend with clarity. Save for what matters.\nA little more freedom, every day.",
            312.0,
            44.0,
            body,
            INK,
        );
        let cta = self.finance_container(
            content,
            "Get started button",
            312.0,
            54.0,
            LayoutMode::Row,
            12.0,
            GREEN,
            27.0,
        );
        self.finance_padding(cta, 16.0);
        self.finance_fill_text(cta, "Get started label", "Get started", 22.0, strong, WHITE);
        self.finance_icon(cta, arrow, 20.0, WHITE);
        self.create_component(cta, "Button / Primary".into());
        self.finance_text(
            content,
            "Login prompt",
            "Already a member? Log in",
            312.0,
            20.0,
            center,
            INK,
        );

        let wallet = self.finance_frame("Finance · Wallet", 480.0, PAPER);
        self.finance_status_bar(wallet, label, wifi, battery);
        let content = self.finance_container(
            wallet,
            "Wallet content · Auto layout",
            312.0,
            604.0,
            LayoutMode::Column,
            16.0,
            CLEAR,
            0.0,
        );
        self.finance_position(content, 504.0, 154.0);
        self.finance_header(
            content,
            "Hi, Jonathan",
            "Let's make today count.",
            title,
            label,
            bell,
        );
        let summary = self.finance_container(
            content,
            "Wallet balance",
            312.0,
            138.0,
            LayoutMode::Column,
            8.0,
            GREEN,
            22.0,
        );
        self.finance_padding(summary, 20.0);
        self.finance_text(
            summary,
            "Balance label",
            "TOTAL BALANCE",
            272.0,
            16.0,
            label,
            LIME,
        );
        self.finance_text(
            summary,
            "Balance",
            "$17,298.92",
            272.0,
            42.0,
            balance,
            WHITE,
        );
        let trend = self.finance_container(
            summary,
            "Balance change",
            272.0,
            20.0,
            LayoutMode::Row,
            8.0,
            CLEAR,
            0.0,
        );
        self.finance_icon(trend, up, 16.0, LIME);
        self.finance_text(
            trend,
            "Balance trend",
            "+$1,240.00 this month",
            248.0,
            18.0,
            label,
            LIME,
        );
        let cards = self.finance_container(
            content,
            "Cards · Auto layout",
            312.0,
            54.0,
            LayoutMode::Row,
            12.0,
            CLEAR,
            0.0,
        );
        for (name, ending, color) in [
            ("Everyday", "7391", WHITE),
            ("Savings", "2048", [0.9, 0.94, 0.87, 1.0]),
        ] {
            let tile = self.finance_container(
                cards,
                &format!("Payment card / {name}"),
                150.0,
                54.0,
                LayoutMode::Row,
                10.0,
                color,
                14.0,
            );
            self.finance_padding(tile, 12.0);
            self.finance_icon(tile, card, 22.0, GREEN);
            let copy = self.finance_container(
                tile,
                "Card details",
                92.0,
                32.0,
                LayoutMode::Column,
                0.0,
                CLEAR,
                0.0,
            );
            self.finance_text(copy, "Card name", name, 92.0, 16.0, label, INK);
            self.finance_text(
                copy,
                "Card ending",
                &format!("•••• {ending}"),
                92.0,
                16.0,
                label,
                MUTED,
            );
        }
        let actions = self.finance_container(
            content,
            "Quick actions · Auto layout",
            312.0,
            48.0,
            LayoutMode::Row,
            12.0,
            CLEAR,
            0.0,
        );
        let action = self.finance_container(
            actions,
            "Send",
            96.0,
            48.0,
            LayoutMode::Row,
            6.0,
            WHITE,
            16.0,
        );
        self.finance_padding(action, 10.0);
        self.finance_icon(action, up, 18.0, GREEN);
        self.finance_fill_text(action, "Action label", "Send", 20.0, label, INK);
        let action_component = self
            .create_component(action, "Button / Quick action".into())
            .unwrap();
        for (name, asset) in [("Request", down), ("More", more)] {
            let instance = self.finance_instance(action_component, actions, name);
            self.finance_text_override(instance, "Action label", name);
            self.finance_asset_override(instance, asset);
        }
        let list = self.finance_container(
            content,
            "Recent activity · Auto layout",
            312.0,
            214.0,
            LayoutMode::Column,
            8.0,
            CLEAR,
            0.0,
        );
        self.finance_section_heading(list, "Recent activity", "View all", strong, label);
        let row = self.finance_transaction(
            list,
            "Dribbble",
            "Design subscription",
            "−$120.00",
            bag,
            strong,
            label,
            right,
        );
        let transaction_component = self
            .create_component(row, "Row / Transaction".into())
            .unwrap();
        for (name, detail, amount, asset) in [
            ("Wilson Mango", "Transfer · Today", "−$240.00", user),
            ("Abram Botosh", "Payment received", "+$450.00", down),
        ] {
            let instance = self.finance_instance(transaction_component, list, name);
            self.finance_text_override(instance, "Transaction name", name);
            self.finance_text_override(instance, "Transaction detail", detail);
            self.finance_text_override(instance, "Transaction amount", amount);
            self.finance_asset_override(instance, asset);
        }
        let nav = self.finance_navigation(wallet, [home, chart, scan, target, user]);
        let navigation = self
            .create_component(nav, "Navigation / Bottom bar".into())
            .unwrap();

        let analytics = self.finance_frame("Finance · Analytics", 880.0, PAPER);
        self.finance_status_bar(analytics, label, wifi, battery);
        let content = self.finance_container(
            analytics,
            "Analytics content · Auto layout",
            312.0,
            604.0,
            LayoutMode::Column,
            20.0,
            CLEAR,
            0.0,
        );
        self.finance_position(content, 904.0, 154.0);
        self.finance_header(
            content,
            "Your spending",
            "A clearer picture of your money.",
            title,
            label,
            more,
        );
        let spending = self.finance_container(
            content,
            "Spending summary · Auto layout",
            312.0,
            102.0,
            LayoutMode::Column,
            8.0,
            WHITE,
            20.0,
        );
        self.finance_padding(spending, 16.0);
        self.finance_text(
            spending,
            "Spending label",
            "SPENT THIS MONTH",
            280.0,
            16.0,
            label,
            MUTED,
        );
        let value = self.finance_container(
            spending,
            "Spending value row",
            280.0,
            42.0,
            LayoutMode::Row,
            8.0,
            CLEAR,
            0.0,
        );
        self.finance_fill_text(value, "Spending value", "$2,082.12", 40.0, balance, INK);
        self.finance_icon(value, chart, 28.0, GREEN);
        self.create_component(spending, "Card / Spending summary".into());
        let chart_card = self.finance_container(
            content,
            "Monthly spending chart",
            312.0,
            212.0,
            LayoutMode::Column,
            12.0,
            WHITE,
            20.0,
        );
        self.finance_padding(chart_card, 16.0);
        self.finance_section_heading(chart_card, "Monthly overview", "2024", strong, label);
        let bars = self.finance_container(
            chart_card,
            "Monthly bars · Auto layout",
            280.0,
            130.0,
            LayoutMode::Row,
            8.0,
            CLEAR,
            0.0,
        );
        for (month, height) in [
            ("Feb", 44.0),
            ("Mar", 62.0),
            ("Apr", 52.0),
            ("May", 90.0),
            ("Jun", 74.0),
            ("Jul", 60.0),
        ] {
            let column = self.finance_container(
                bars,
                &format!("Chart / {month}"),
                40.0,
                130.0,
                LayoutMode::Column,
                8.0,
                CLEAR,
                0.0,
            );
            self.active_node_mut(column).unwrap().layout_align = LayoutAlign::Center;
            self.active_node_mut(column).unwrap().layout_justify = LayoutAlign::End;
            self.finance_container(
                column,
                "Spending bar",
                26.0,
                height,
                LayoutMode::None,
                0.0,
                if month == "Jul" { GREEN } else { LIME },
                6.0,
            );
            self.finance_text(column, "Month", month, 40.0, 18.0, center, MUTED);
        }
        let categories = self.finance_container(
            content,
            "Expense categories · Auto layout",
            312.0,
            164.0,
            LayoutMode::Column,
            8.0,
            CLEAR,
            0.0,
        );
        self.finance_section_heading(categories, "Top categories", "This month", strong, label);
        for (name, value, icon) in [
            ("Shopping", "$820.00", bag),
            ("Food & groceries", "$462.12", leaf),
            ("Transport", "$350.00", globe),
        ] {
            let row = self.finance_container(
                categories,
                name,
                312.0,
                36.0,
                LayoutMode::Row,
                10.0,
                CLEAR,
                0.0,
            );
            self.finance_icon(row, icon, 20.0, GREEN);
            self.finance_fill_text(row, "Category name", name, 22.0, body, INK);
            self.finance_text(row, "Category amount", value, 86.0, 22.0, right, INK);
        }
        let nav = self.finance_instance(navigation, analytics, "Bottom navigation · Auto layout");
        self.finance_position(nav, 904.0, 784.0);

        let goals = self.finance_frame("Finance · Goals", 1280.0, PAPER);
        self.finance_status_bar(goals, label, wifi, battery);
        let content = self.finance_container(
            goals,
            "Goals content · Auto layout",
            312.0,
            604.0,
            LayoutMode::Column,
            20.0,
            CLEAR,
            0.0,
        );
        self.finance_position(content, 1304.0, 154.0);
        self.finance_header(
            content,
            "Your goals",
            "Small steps. Meaningful progress.",
            title,
            label,
            target,
        );
        let overview = self.finance_container(
            content,
            "Savings overview · Auto layout",
            312.0,
            138.0,
            LayoutMode::Column,
            8.0,
            GREEN,
            22.0,
        );
        self.finance_padding(overview, 20.0);
        self.finance_text(
            overview,
            "Saved label",
            "TOTAL SAVED",
            272.0,
            16.0,
            label,
            LIME,
        );
        self.finance_text(
            overview,
            "Saved value",
            "$8,420.00",
            272.0,
            42.0,
            balance,
            WHITE,
        );
        let trend = self.finance_container(
            overview,
            "Savings trend",
            272.0,
            20.0,
            LayoutMode::Row,
            8.0,
            CLEAR,
            0.0,
        );
        self.finance_icon(trend, up, 16.0, LIME);
        self.finance_text(
            trend,
            "Saved trend",
            "+12.4% this month",
            248.0,
            18.0,
            label,
            LIME,
        );
        let list = self.finance_container(
            content,
            "Goal cards · Auto layout",
            312.0,
            318.0,
            LayoutMode::Column,
            12.0,
            CLEAR,
            0.0,
        );
        let mut goal_component = None;
        for (name, amount, percentage, fraction, asset, variant) in [
            (
                "Japan trip",
                "$3,240 of $5,000",
                "65%",
                0.65,
                globe,
                "Travel",
            ),
            (
                "Emergency fund",
                "$4,180 of $8,000",
                "52%",
                0.52,
                shield,
                "Safety",
            ),
            (
                "New workspace",
                "$1,000 of $2,500",
                "40%",
                0.4,
                desk,
                "Workspace",
            ),
        ] {
            let tile = self.finance_container(
                list,
                &format!("Goal card / {name}"),
                312.0,
                98.0,
                LayoutMode::Column,
                12.0,
                WHITE,
                18.0,
            );
            self.finance_padding(tile, 16.0);
            let row = self.finance_container(
                tile,
                "Goal details",
                280.0,
                36.0,
                LayoutMode::Row,
                12.0,
                CLEAR,
                0.0,
            );
            self.finance_icon(row, asset, 28.0, GREEN);
            let copy = self.finance_container(
                row,
                "Goal copy",
                188.0,
                36.0,
                LayoutMode::Column,
                0.0,
                CLEAR,
                0.0,
            );
            self.finance_text(copy, "Goal name", name, 188.0, 20.0, strong, INK);
            self.finance_text(copy, "Goal amount", amount, 188.0, 16.0, label, MUTED);
            self.finance_text(row, "Goal percentage", percentage, 40.0, 20.0, right, GREEN);
            let track = self.finance_container(
                tile,
                "Progress track",
                280.0,
                6.0,
                LayoutMode::Row,
                0.0,
                [0.9, 0.93, 0.89, 1.0],
                3.0,
            );
            self.finance_container(
                track,
                "Progress fill",
                280.0 * fraction,
                6.0,
                LayoutMode::None,
                0.0,
                GREEN,
                3.0,
            );
            if let Some(component) = goal_component {
                self.add_component_variant(component, tile, variant.into());
            } else {
                goal_component = self.create_component(tile, "Card / Goal progress".into());
            }
        }
        let nav = self.finance_instance(navigation, goals, "Bottom navigation · Auto layout");
        self.finance_position(nav, 1304.0, 784.0);

        // Resolve nested layout bottom-up, then top-down; repeat for fill-width
        // children whose parent width has just changed. No positioning via spaces.
        for _ in 0..3 {
            let ids: Vec<_> = self
                .active_page()
                .nodes
                .iter()
                .filter(|n| n.layout_mode != LayoutMode::None)
                .map(|n| n.id)
                .collect();
            for id in ids.iter().rev().chain(ids.iter()) {
                self.relayout_container(*id);
            }
        }
        self.sync_component_instances();
    }

    fn finance_text_style(
        &mut self,
        name: &str,
        size: f32,
        weight: u16,
        line: f32,
        align: TextAlign,
    ) -> EntityId {
        let text = TextStyle {
            font_family: "Inter".into(),
            font_size: size,
            font_weight: weight,
            line_height: line,
            horizontal_align: align,
            vertical_align: if size <= 14.0 {
                TextVerticalAlign::Middle
            } else {
                TextVerticalAlign::Top
            },
            sizing: TextSizing::Fixed,
            ..TextStyle::default()
        };
        self.add_text_style(name.into(), TypographyStyle::from(&text))
    }
    fn finance_frame(&mut self, name: &str, x: f32, color: Color) -> EntityId {
        let id = self.insert_node(name, NodeKind::Frame, None, [x, 80.0, 360.0, 780.0], color);
        let node = self.active_node_mut(id).unwrap();
        node.corner_radii = [36.0; 4];
        node.stroke = [0.8, 0.85, 0.8, 1.0];
        node.stroke_width = 1.0;
        node.shadows.push(Shadow {
            id: Uuid::now_v7(),
            kind: ShadowKind::Outer,
            color: [0.02, 0.08, 0.05, 0.12],
            offset_x: 0.0,
            offset_y: 8.0,
            blur: 24.0,
            spread: -4.0,
            enabled: true,
        });
        let width = self
            .number_variables
            .iter()
            .find(|v| v.name == "Size / Mobile")
            .unwrap()
            .id;
        self.bind_node_variable(id, "width", Some(width));
        id
    }
    #[allow(clippy::too_many_arguments)]
    fn finance_container(
        &mut self,
        parent: EntityId,
        name: &str,
        width: f32,
        height: f32,
        mode: LayoutMode,
        gap: f32,
        fill: Color,
        radius: f32,
    ) -> EntityId {
        let parent_node = self.active_node(parent).unwrap();
        let id = self.insert_node(
            name,
            NodeKind::Group,
            Some(parent),
            [parent_node.x, parent_node.y, width, height],
            fill,
        );
        let node = self.active_node_mut(id).unwrap();
        node.corner_radii = [radius; 4];
        node.layout_mode = mode;
        node.layout_gap = gap;
        node.layout_align = if mode == LayoutMode::Row {
            LayoutAlign::Center
        } else {
            LayoutAlign::Start
        };
        if gap > 0.0
            && let Some(v) = self
                .number_variables
                .iter()
                .find(|v| v.name.starts_with("Space /") && v.value == gap)
                .map(|v| v.id)
        {
            self.active_node_mut(id).unwrap().variable_bindings.gap = Some(v);
        }
        id
    }
    fn finance_padding(&mut self, id: EntityId, padding: f32) {
        let variable = self
            .number_variables
            .iter()
            .find(|v| v.name.starts_with("Space /") && v.value == padding)
            .map(|v| v.id);
        let node = self.active_node_mut(id).unwrap();
        node.layout_padding = [padding; 4];
        node.variable_bindings.padding = [variable; 4];
    }
    fn finance_position(&mut self, id: EntityId, x: f32, y: f32) {
        let old = self.active_node(id).unwrap().clone();
        let ids = self.descendant_ids_including(id);
        for node in &mut self.active_page_mut().nodes {
            if ids.contains(&node.id) {
                node.x += x - old.x;
                node.y += y - old.y;
            }
        }
    }
    #[allow(clippy::too_many_arguments)]
    fn finance_text(
        &mut self,
        parent: EntityId,
        name: &str,
        content: &str,
        width: f32,
        height: f32,
        style: EntityId,
        color: Color,
    ) -> EntityId {
        let p = self.active_node(parent).unwrap();
        let id = self.insert_node(
            name,
            NodeKind::Text,
            Some(parent),
            [p.x, p.y, width, height],
            color,
        );
        self.active_node_mut(id).unwrap().text = Some(TextStyle {
            content: content.into(),
            sizing: TextSizing::Fixed,
            ..TextStyle::default()
        });
        self.bind_node_text_style(id, Some(style));
        id
    }
    fn finance_fill_text(
        &mut self,
        parent: EntityId,
        name: &str,
        content: &str,
        height: f32,
        style: EntityId,
        color: Color,
    ) -> EntityId {
        let id = self.finance_text(parent, name, content, 160.0, height, style, color);
        self.active_node_mut(id).unwrap().width_sizing = LayoutSizing::Fill;
        id
    }
    fn finance_icon_asset(&mut self, name: &str, paths: &str) -> EntityId {
        let id = self.allocate_id();
        self.media_assets.push(MediaAsset{id,name:name.into(),kind:MediaAssetKind::Icon,mime_type:"image/svg+xml".into(),source:format!("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>{paths}</svg>"),width:24,height:24,tags:vec!["finance".into()]});
        id
    }
    fn finance_icon(
        &mut self,
        parent: EntityId,
        asset: EntityId,
        size: f32,
        color: Color,
    ) -> EntityId {
        let id = self.add_node_from_asset(asset, Some(parent)).unwrap();
        let node = self.active_node_mut(id).unwrap();
        node.width = size;
        node.height = size;
        node.fill = color;
        id
    }
    fn finance_status_bar(
        &mut self,
        frame: EntityId,
        label: EntityId,
        wifi: EntityId,
        battery: EntityId,
    ) {
        let x = self.active_node(frame).unwrap().x;
        let time = self.finance_text(frame, "Status bar", "9:41", 44.0, 18.0, label, INK);
        self.finance_position(time, x + 26.0, 102.0);
        let island = self.finance_container(
            frame,
            "Dynamic island",
            92.0,
            26.0,
            LayoutMode::None,
            0.0,
            INK,
            13.0,
        );
        self.finance_position(island, x + 134.0, 96.0);
        let row = self.finance_container(
            frame,
            "Status icons · Auto layout",
            44.0,
            20.0,
            LayoutMode::Row,
            8.0,
            CLEAR,
            0.0,
        );
        self.finance_position(row, x + 288.0, 100.0);
        self.finance_icon(row, wifi, 16.0, INK);
        self.finance_icon(row, battery, 20.0, INK);
    }
    fn finance_header(
        &mut self,
        parent: EntityId,
        heading: &str,
        subtitle: &str,
        title: EntityId,
        label: EntityId,
        asset: EntityId,
    ) {
        let row = self.finance_container(
            parent,
            "Screen header",
            312.0,
            52.0,
            LayoutMode::Row,
            12.0,
            CLEAR,
            0.0,
        );
        let copy = self.finance_container(
            row,
            "Header copy",
            260.0,
            52.0,
            LayoutMode::Column,
            4.0,
            CLEAR,
            0.0,
        );
        self.finance_text(
            copy,
            if heading == "Hi, Jonathan" {
                "Greeting"
            } else {
                "Screen title"
            },
            heading,
            260.0,
            28.0,
            title,
            INK,
        );
        self.finance_text(
            copy,
            if heading == "Hi, Jonathan" {
                "Greeting subtitle"
            } else {
                "Screen subtitle"
            },
            subtitle,
            260.0,
            18.0,
            label,
            MUTED,
        );
        let button = self.finance_container(
            row,
            "Header action",
            40.0,
            40.0,
            LayoutMode::Row,
            0.0,
            WHITE,
            20.0,
        );
        self.finance_padding(button, 10.0);
        self.finance_icon(button, asset, 20.0, GREEN);
    }
    fn finance_section_heading(
        &mut self,
        parent: EntityId,
        heading: &str,
        trailing: &str,
        strong: EntityId,
        label: EntityId,
    ) {
        let width = self.active_node(parent).unwrap().width
            - self.active_node(parent).unwrap().layout_padding[1]
            - self.active_node(parent).unwrap().layout_padding[3];
        let row = self.finance_container(
            parent,
            "Section heading",
            width,
            24.0,
            LayoutMode::Row,
            8.0,
            CLEAR,
            0.0,
        );
        self.finance_fill_text(row, "Section title", heading, 22.0, strong, INK);
        self.finance_text(row, "Section link", trailing, 70.0, 18.0, label, MUTED);
    }
    #[allow(clippy::too_many_arguments)]
    fn finance_transaction(
        &mut self,
        parent: EntityId,
        name: &str,
        detail: &str,
        amount: &str,
        asset: EntityId,
        strong: EntityId,
        label: EntityId,
        right: EntityId,
    ) -> EntityId {
        let row = self.finance_container(
            parent,
            "Transaction row",
            312.0,
            54.0,
            LayoutMode::Row,
            12.0,
            CLEAR,
            0.0,
        );
        let icon = self.finance_container(
            row,
            "Transaction icon",
            40.0,
            40.0,
            LayoutMode::Row,
            0.0,
            WHITE,
            14.0,
        );
        self.finance_padding(icon, 10.0);
        self.finance_icon(icon, asset, 20.0, GREEN);
        let copy = self.finance_container(
            row,
            "Transaction copy",
            160.0,
            38.0,
            LayoutMode::Column,
            2.0,
            CLEAR,
            0.0,
        );
        self.active_node_mut(copy).unwrap().width_sizing = LayoutSizing::Fill;
        self.finance_text(copy, "Transaction name", name, 160.0, 20.0, strong, INK);
        self.finance_text(
            copy,
            "Transaction detail",
            detail,
            160.0,
            16.0,
            label,
            MUTED,
        );
        self.finance_text(row, "Transaction amount", amount, 88.0, 22.0, right, INK);
        row
    }
    fn finance_navigation(&mut self, parent: EntityId, assets: [EntityId; 5]) -> EntityId {
        let x = self.active_node(parent).unwrap().x;
        let nav = self.finance_container(
            parent,
            "Bottom navigation · Auto layout",
            312.0,
            56.0,
            LayoutMode::Row,
            18.0,
            WHITE,
            28.0,
        );
        self.finance_padding(nav, 12.0);
        self.finance_position(nav, x + 24.0, 784.0);
        for (i, asset) in assets.into_iter().enumerate() {
            let item = self.finance_container(
                nav,
                "Navigation item",
                43.0,
                32.0,
                LayoutMode::Row,
                0.0,
                if i == 2 { GREEN } else { CLEAR },
                16.0,
            );
            self.active_node_mut(item).unwrap().layout_justify = LayoutAlign::Center;
            self.finance_icon(item, asset, 20.0, if i == 2 { LIME } else { INK });
        }
        nav
    }
    fn finance_instance(&mut self, component: EntityId, parent: EntityId, name: &str) -> EntityId {
        let variant = self
            .components
            .iter()
            .find(|c| c.id == component)
            .unwrap()
            .variants[0]
            .id;
        let id = self
            .create_component_instance(component, variant, Some(parent))
            .unwrap();
        self.active_node_mut(id).unwrap().name = name.into();
        id
    }
    fn finance_text_override(&mut self, instance: EntityId, name: &str, content: &str) {
        let id = self
            .active_page()
            .nodes
            .iter()
            .find(|n| n.instance_root_id == Some(instance) && n.name == name)
            .unwrap()
            .id;
        let mut text = self.active_node(id).unwrap().text.clone().unwrap();
        text.content = content.into();
        self.set_node_text(id, text);
    }
    fn finance_asset_override(&mut self, instance: EntityId, asset: EntityId) {
        let id = self
            .active_page()
            .nodes
            .iter()
            .find(|n| n.instance_root_id == Some(instance) && n.asset_id.is_some())
            .unwrap()
            .id;
        self.set_node_asset(id, asset);
    }
}
