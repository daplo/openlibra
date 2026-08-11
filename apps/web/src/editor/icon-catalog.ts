export type IconDefinition = {
  name: string;
  tags: string[];
  svg: string;
};

const icon = (name: string, tags: string[], paths: string): IconDefinition => ({
  name,
  tags,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
});

export const ICON_LIBRARY: IconDefinition[] = [
  icon(
    "Home",
    ["house", "navigation"],
    '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-6h6v6"/>',
  ),
  icon(
    "Search",
    ["find", "magnifier"],
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  ),
  icon(
    "Heart",
    ["favorite", "like"],
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
  ),
  icon(
    "Map pin",
    ["location", "place"],
    '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  ),
  icon(
    "Bell",
    ["notification", "alert"],
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  ),
  icon(
    "User",
    ["profile", "person"],
    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ),
  icon(
    "Settings",
    ["gear", "preferences"],
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  ),
  icon(
    "Star",
    ["favorite", "rating"],
    '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2l-5-4.9 6.9-1Z"/>',
  ),
  icon("Plus", ["add", "create"], '<path d="M12 5v14M5 12h14"/>'),
  icon(
    "Menu",
    ["navigation", "hamburger"],
    '<path d="M4 6h16M4 12h16M4 18h16"/>',
  ),
  icon(
    "Arrow right",
    ["next", "direction"],
    '<path d="M5 12h14M13 6l6 6-6 6"/>',
  ),
  icon(
    "Message",
    ["chat", "comment"],
    '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
  ),
];
