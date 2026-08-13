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
  toggleGrid: () => void;
  newDocument: () => void;
  openDocument: () => void;
  saveDocument: () => void;
  deleteSelection: () => void;
  undo: () => void;
  redo: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  nudgeSelection: (dx: number, dy: number) => void;
  beginTextEdit: (clientX: number, clientY: number) => void;
};

type PointerInput = {
  clientX: number;
  clientY: number;
  button: number;
  additive?: boolean;
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
    this.canvas.addEventListener("dblclick", this.onDoubleClick, { signal });
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
    this.canvasTarget.pointerDown({
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
    });
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    this.canvasTarget.pointerMove(event);
  };

  private onDoubleClick = (event: MouseEvent) => {
    this.handlers.beginTextEdit(event.clientX, event.clientY);
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
    if ((event.metaKey || event.ctrlKey) && key === "n") {
      event.preventDefault();
      this.handlers.newDocument();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === "o") {
      event.preventDefault();
      this.handlers.openDocument();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && key === "s") {
      event.preventDefault();
      this.handlers.saveDocument();
      return;
    }
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
    if (event.shiftKey && key === "g") {
      event.preventDefault();
      this.handlers.toggleGrid();
    }
    if (event.key === "Delete" || event.key === "Backspace")
      this.handlers.deleteSelection();
    if ((event.metaKey || event.ctrlKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) this.handlers.redo();
      else this.handlers.undo();
    }
    if ((event.metaKey || event.ctrlKey) && key === "c") {
      event.preventDefault();
      this.handlers.copySelection();
    }
    if ((event.metaKey || event.ctrlKey) && key === "v") {
      event.preventDefault();
      this.handlers.pasteSelection();
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
