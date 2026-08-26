import type { ReactNode } from "react";
import { PanelResizeHandle } from "./PanelResizeHandle";

export function RightInspector({
  width,
  onWidthChange,
  children,
}: {
  width: number;
  onWidthChange: (width: number) => void;
  children: ReactNode;
}) {
  return (
    <aside className="right-panel">
      <PanelResizeHandle side="right" width={width} onChange={onWidthChange} />
      {children}
    </aside>
  );
}
