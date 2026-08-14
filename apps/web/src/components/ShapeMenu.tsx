import { Circle, Hexagon, Minus, Star } from "lucide-react";

export type VectorShape = "ellipse" | "line" | "polygon" | "star";

const SHAPES: Array<{
  id: VectorShape;
  name: string;
  icon: typeof Circle;
}> = [
  { id: "ellipse", name: "Ellipse", icon: Circle },
  { id: "line", name: "Line", icon: Minus },
  { id: "polygon", name: "Polygon", icon: Hexagon },
  { id: "star", name: "Star", icon: Star },
];

export function ShapeMenu({
  onChoose,
  onClose,
}: {
  onChoose: (shape: VectorShape) => void;
  onClose: () => void;
}) {
  return (
    <div className="shape-menu" role="dialog" aria-label="Shape tools">
      <div className="shape-menu-header">
        <strong>Shape tool</strong>
        <button type="button" onClick={onClose} aria-label="Close shape tools">
          ×
        </button>
      </div>
      <div className="shape-menu-grid">
        {SHAPES.map(({ id, name, icon: Icon }) => (
          <button
            type="button"
            key={id}
            onClick={() => onChoose(id)}
            aria-label={name}
          >
            <Icon aria-hidden="true" />
            <span>{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
