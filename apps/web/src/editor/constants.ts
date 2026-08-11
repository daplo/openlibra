import type { RenderStats } from "../renderer";
import type { Mode } from "./types";

export const MODES: { id: Mode; label: string; shortcut: string }[] = [
  { id: "design", label: "Design", shortcut: "1" },
  { id: "developer", label: "Developer", shortcut: "2" },
  { id: "review", label: "Review", shortcut: "3" },
];

export const ARTBOARD_PRESETS = [
  { category: "Mobile", name: "Mobile compact", width: 375, height: 812 },
  { category: "Mobile", name: "Mobile standard", width: 390, height: 844 },
  { category: "Mobile", name: "Mobile large", width: 430, height: 932 },
  { category: "Tablet", name: "Tablet portrait", width: 768, height: 1024 },
  { category: "Tablet", name: "Tablet landscape", width: 1024, height: 768 },
  { category: "Desktop", name: "Laptop", width: 1280, height: 800 },
  { category: "Desktop", name: "Desktop", width: 1440, height: 900 },
  { category: "Desktop", name: "Full HD", width: 1920, height: 1080 },
  { category: "Presentation", name: "Slide 16:9", width: 1920, height: 1080 },
] as const;

export const EMPTY_STATS: RenderStats = {
  fps: 0,
  frameMs: 0,
  sceneBuildMs: 0,
  uploadMs: 0,
  objects: 0,
  visibleObjects: 0,
  zoom: 1,
};
