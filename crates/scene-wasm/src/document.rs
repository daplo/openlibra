use crate::*;
use std::collections::HashSet;
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
                description: "Sample mobile and desktop interface composition.".into(),
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
            components: &self.components,
        }
    }
}
