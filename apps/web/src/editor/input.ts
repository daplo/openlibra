import type { CanvasTool } from "../renderer";

export type CanvasInputTarget = {
  resizeHandleFromClient: (clientX: number, clientY: number) => unknown;
  pointerDown: (input: PointerInput) => void;
  pointerMove: (input: PointerInput) => void;
  pointerEnd: () => void;
  wheel: (input: WheelInput) => void;
};

export type EditorInputHandlers = {
  selectCanvasPoint: (
    clientX: number,
    clientY: number,
    additive: boolean,
  ) => void;
  setMode: (mode: "design" | "developer" | "review") => void;
  setTool: (tool: CanvasTool) => void;
  getTool: () => CanvasTool;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  zoomToFit: () => void;
  toggleRulers: () => void;
  deleteSelection: () => void;
  undo: () => void;
  redo: () => void;
  nudgeSelection: (dx: number, dy: number) => void;
};

type PointerInput = {
  clientX: number;
  clientY: number;
  button: number;
};

type WheelInput = {
  clientX: number;
  clientY: number;
  deltaY: number;
};

export class EditorInputController {
  private readonly abortController = new AbortController();
  private toolBeforeSpace?: CanvasTool;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly canvasTarget: CanvasInputTarget,
    private handlers: EditorInputHandlers,
  ) {
    this.attach();
  }

  setHandlers(handlers: EditorInputHandlers) {
    this.handlers = handlers;
  }

  dispose() {
    this.abortController.abort();
  }

  private attach() {
    const signal = this.abortController.signal;
    this.canvas.addEventListener("pointerdown", this.onPointerDown, { signal });
    this.canvas.addEventListener("pointermove", this.onPointerMove, { signal });
    this.canvas.addEventListener("pointerup", this.onPointerEnd, { signal });
    this.canvas.addEventListener("pointercancel", this.onPointerEnd, {
      signal,
    });
    this.canvas.addEventListener("wheel", this.onWheel, {
      passive: false,
      signal,
    });
    window.addEventListener("keydown", this.onKeyDown, { signal });
    window.addEventListener("keyup", this.onKeyUp, { signal });
  }

  private onPointerDown = (event: PointerEvent) => {
    if (
      event.button === 0 &&
      !this.canvasTarget.resizeHandleFromClient(event.clientX, event.clientY)
    )
      this.handlers.selectCanvasPoint(
        event.clientX,
        event.clientY,
        event.shiftKey || event.metaKey || event.ctrlKey,
      );
    this.canvasTarget.pointerDown(event);
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    this.canvasTarget.pointerMove(event);
  };

  private onPointerEnd = () => {
    this.canvasTarget.pointerEnd();
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.canvasTarget.wheel(event);
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === "v") this.handlers.setTool("select");
    if (key === "h") this.handlers.setTool("hand");
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      this.toolBeforeSpace = this.handlers.getTool();
      this.handlers.setTool("hand");
      return;
    }
    if (event.key === "1") this.handlers.setMode("design");
    if (event.key === "2") this.handlers.setMode("developer");
    if (event.key === "3") this.handlers.setMode("review");
    if (event.key === "+" || event.key === "=") this.handlers.zoomIn();
    if (event.key === "-") this.handlers.zoomOut();
    if (event.key === "0") this.handlers.resetView();
    if (key === "f") this.handlers.zoomToFit();
    if (event.shiftKey && key === "r") {
      event.preventDefault();
      this.handlers.toggleRulers();
    }
    if (event.key === "Delete" || event.key === "Backspace")
      this.handlers.deleteSelection();
    if ((event.metaKey || event.ctrlKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) this.handlers.redo();
      else this.handlers.undo();
    }
    const distance = event.shiftKey ? 10 : 1;
    const nudges: Record<string, [number, number]> = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    };
    const nudge = nudges[event.key];
    if (nudge) {
      event.preventDefault();
      this.handlers.nudgeSelection(...nudge);
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space" && this.toolBeforeSpace) {
      this.handlers.setTool(this.toolBeforeSpace);
      this.toolBeforeSpace = undefined;
    }
  };
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
