import type { CSSProperties, ReactNode } from "react";

export function EditorWorkspace({
  hidden,
  leftPanelWidth,
  rightPanelWidth,
  children,
}: {
  hidden: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-hidden={hidden}
      className={`workspace ${hidden ? "workspace-hidden" : ""}`}
      style={
        {
          "--left-panel-width": `${leftPanelWidth}px`,
          "--right-panel-width": `${rightPanelWidth}px`,
        } as CSSProperties
      }
    >
      {children}
    </section>
  );
}
