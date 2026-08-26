use crate::*;
impl Document {
    pub(crate) fn build_finance_mobile_demo(&mut self) {
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
        let send_icon = self.finance_icon_asset(
            "Send",
            "<path d='M21 3 9 15'/><path d='m21 3-7 18-5-6-6-2Z'/>",
        );
        let target_icon = self.finance_icon_asset(
            "Target",
            "<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='4'/><path d='M12 3v3M21 12h-3'/>",
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
        for (index, text) in ["Send", "Request", "More"].iter().enumerate() {
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
            if index < 2
                && let Some(icon) = self.add_node_from_asset(send_icon, Some(action))
            {
                let node = self.active_node_mut(icon).unwrap();
                node.name = format!("{text} icon");
                node.x = x + 12.0;
                node.y = 388.0;
                node.width = 16.0;
                node.height = 16.0;
                node.rotation = if index == 1 { 180.0 } else { 0.0 };
                node.fill = if index == 0 {
                    [1.0; 4]
                } else {
                    [0.02, 0.25, 0.08, 1.0]
                };
            }
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

        let goals = self.finance_frame("Finance · Goals", 1160.0, [0.97, 0.98, 0.96, 1.0]);
        self.finance_status_bar(goals, 1184.0, label, false);
        let goals_header = self.finance_group(
            goals,
            "Goals header · Auto layout",
            [1188.0, 146.0, 272.0, 62.0],
            LayoutMode::Column,
            5.0,
            [0.0; 4],
            0.0,
        );
        self.finance_text(
            goals_header,
            "Goals title",
            "Your goals",
            [1188.0, 146.0, 210.0, 30.0],
            title,
            [0.04, 0.15, 0.08, 1.0],
        );
        self.finance_text(
            goals_header,
            "Goals subtitle",
            "Small steps, meaningful progress.",
            [1188.0, 180.0, 250.0, 18.0],
            label,
            [0.42, 0.48, 0.43, 1.0],
        );
        let overview = self.finance_group(
            goals,
            "Savings overview · Auto layout",
            [1188.0, 224.0, 272.0, 126.0],
            LayoutMode::Column,
            8.0,
            [0.04, 0.25, 0.11, 1.0],
            22.0,
        );
        self.finance_text(
            overview,
            "Saved label",
            "TOTAL SAVED",
            [1206.0, 244.0, 160.0, 16.0],
            label,
            [0.66, 0.91, 0.72, 1.0],
        );
        self.finance_text(
            overview,
            "Saved value",
            "$8,420",
            [1206.0, 270.0, 180.0, 38.0],
            display,
            [1.0, 1.0, 1.0, 1.0],
        );
        self.finance_text(
            overview,
            "Saved trend",
            "+12.4% this month                 ↗",
            [1206.0, 318.0, 232.0, 18.0],
            label,
            [0.70, 0.96, 0.48, 1.0],
        );
        let goals_list = self.finance_group(
            goals,
            "Goal cards · Auto layout",
            [1188.0, 374.0, 272.0, 230.0],
            LayoutMode::Column,
            12.0,
            [0.0; 4],
            0.0,
        );
        let mut first_goal = None;
        for (index, (name, amount, progress, color)) in [
            (
                "Japan trip",
                "$3,240 of $5,000",
                "██████░░  65%",
                [0.72, 0.94, 0.42, 1.0],
            ),
            (
                "Emergency fund",
                "$4,180 of $8,000",
                "████░░░░  52%",
                [0.73, 0.68, 0.98, 1.0],
            ),
            (
                "New workspace",
                "$1,000 of $2,500",
                "███░░░░░  40%",
                [1.0, 0.72, 0.42, 1.0],
            ),
        ]
        .iter()
        .enumerate()
        {
            let y = 374.0 + index as f32 * 76.0;
            let card = self.finance_group(
                goals_list,
                &format!("Goal card / {name}"),
                [1188.0, y, 272.0, 64.0],
                LayoutMode::Row,
                10.0,
                [1.0, 1.0, 1.0, 1.0],
                16.0,
            );
            self.style_demo_shape(card, 16.0, [0.88, 0.90, 0.87, 1.0], 1.0, true);
            if let Some(icon) = self.add_node_from_asset(target_icon, Some(card)) {
                let node = self.active_node_mut(icon).unwrap();
                node.x = 1202.0;
                node.y = y + 18.0;
                node.width = 24.0;
                node.height = 24.0;
                node.fill = *color;
            }
            self.finance_text(
                card,
                "Goal name",
                name,
                [1238.0, y + 10.0, 130.0, 18.0],
                body,
                [0.04, 0.10, 0.06, 1.0],
            );
            self.finance_text(
                card,
                "Goal progress",
                &format!("{amount}   {progress}"),
                [1238.0, y + 34.0, 206.0, 18.0],
                label,
                [0.38, 0.43, 0.39, 1.0],
            );
            first_goal.get_or_insert(card);
        }
        self.finance_bottom_nav(
            goals,
            1184.0,
            [home_icon, chart_icon, scan_icon, card_icon, user_icon],
        );

        self.create_component(cta, "Button / Primary".into());
        self.create_component(spending, "Card / Spending summary".into());
        if let Some(goal) = first_goal {
            self.create_component(goal, "Card / Goal progress".into());
        }
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
}
