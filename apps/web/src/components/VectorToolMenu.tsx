import { PenTool, Scissors, Spline } from "lucide-react";
import type { CanvasTool } from "../renderer";

const VECTOR_TOOLS: Array<{
  id: Extract<CanvasTool, "direct" | "pen" | "knife">;
  name: string;
  shortcut: string;
  description: string;
  icon: typeof PenTool;
}> = [
  {
    id: "direct",
    name: "Edit points",
    shortcut: "A",
    description: "Edit anchors and Bézier handles",
    icon: Spline,
  },
  {
    id: "pen",
    name: "Pen",
    shortcut: "P",
    description: "Draw open and closed paths",
    icon: PenTool,
  },
  {
    id: "knife",
    name: "Knife",
    shortcut: "K",
    description: "Cut across a selected vector",
    icon: Scissors,
  },
];

export function VectorToolMenu({
  activeTool,
  knifeEnabled,
  onChoose,
  onClose,
}: {
  activeTool: CanvasTool;
  knifeEnabled: boolean;
  onChoose: (tool: "direct" | "pen" | "knife") => void;
  onClose: () => void;
}) {
  return (
    <div className="vector-tool-menu" role="dialog" aria-label="Vector tools">
      <div className="shape-menu-header">
        <strong>Vector tools</strong>
        <button type="button" onClick={onClose} aria-label="Close vector tools">
          ×
        </button>
      </div>
      <div className="vector-tool-list">
        {VECTOR_TOOLS.map(({ id, name, shortcut, description, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={activeTool === id ? "active" : undefined}
            disabled={id === "knife" && !knifeEnabled}
            onClick={() => onChoose(id)}
            aria-label={`${name} (${shortcut})`}
          >
            <Icon aria-hidden="true" />
            <span>
              <strong>{name}</strong>
              <small>{description}</small>
            </span>
            <kbd>{shortcut}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
