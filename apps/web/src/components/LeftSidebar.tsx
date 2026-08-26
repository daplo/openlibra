import type { ReactNode } from "react";
import { PanelResizeHandle } from "./PanelResizeHandle";

export function LeftSidebar({
  width,
  onWidthChange,
  children,
}: {
  width: number;
  onWidthChange: (width: number) => void;
  children: ReactNode;
}) {
  return (
    <aside className="left-panel">
      {children}
      <PanelResizeHandle side="left" width={width} onChange={onWidthChange} />
    </aside>
  );
}
