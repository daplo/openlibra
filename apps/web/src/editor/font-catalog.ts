export const SYSTEM_FONTS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Menlo",
] as const;

export const GOOGLE_FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Merriweather",
  "Playfair Display",
  "Source Sans 3",
  "Roboto Mono",
] as const;

const googleFontSet = new Set<string>(GOOGLE_FONTS);
const requestedFonts = new Set<string>();

export function isGoogleFont(family: string) {
  return googleFontSet.has(family);
}

export function ensureGoogleFont(family: string) {
  if (!isGoogleFont(family) || requestedFonts.has(family)) return;
  requestedFonts.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.openLibraFont = family;
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replaceAll("%20", "+")}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  document.head.append(link);
}
