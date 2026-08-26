import type { PointerEvent as ReactPointerEvent } from "react";

export function PanelResizeHandle({
  side,
  width,
  onChange,
}: {
  side: "left" | "right";
  width: number;
  onChange: (width: number) => void;
}) {
  const clamp = (value: number) => Math.min(420, Math.max(190, value));
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = width;
    const move = (moveEvent: PointerEvent) =>
      onChange(
        clamp(
          originWidth +
            (side === "left"
              ? moveEvent.clientX - originX
              : originX - moveEvent.clientX),
        ),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  return (
    <button
      type="button"
      className={`panel-resize-handle ${side}`}
      aria-label={`Resize ${side} sidebar`}
      title={`Resize ${side} sidebar`}
      onPointerDown={beginResize}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const direction = event.key === "ArrowRight" ? 1 : -1;
        onChange(clamp(width + direction * (side === "left" ? 10 : -10)));
      }}
    />
  );
}
