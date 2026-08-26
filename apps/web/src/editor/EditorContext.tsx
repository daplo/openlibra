/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import type { DocumentReadModel, NodeSummary } from "./types";
import type { EditorInputController } from "./input";
import type { CanvasTool, ColorTheme, OpenLibraRenderer } from "../renderer";
import type { DocumentEngine } from "../wasm/open_libra_scene_wasm";

export type EditorInfrastructure = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  rendererRef: RefObject<OpenLibraRenderer | undefined>;
  engineRef: RefObject<DocumentEngine | undefined>;
  selectedNodeIdsRef: RefObject<string[]>;
  copiedNodeIdsRef: RefObject<string[]>;
  inputControllerRef: RefObject<EditorInputController | undefined>;
  canvasToolRef: RefObject<CanvasTool>;
  themeRef: RefObject<ColorTheme>;
  pendingSceneFrameRef: RefObject<number | undefined>;
  documentModelRef: RefObject<DocumentReadModel | undefined>;
  nodesByIdRef: RefObject<Map<string, NodeSummary>>;
  isolationRootIdRef: RefObject<string | undefined>;
};

const EditorContext = createContext<EditorInfrastructure | undefined>(
  undefined,
);

export function EditorProvider({ children }: { children: ReactNode }) {
  const value: EditorInfrastructure = {
    canvasRef: useRef<HTMLCanvasElement>(null),
    rendererRef: useRef<OpenLibraRenderer>(undefined),
    engineRef: useRef<DocumentEngine>(undefined),
    selectedNodeIdsRef: useRef<string[]>([]),
    copiedNodeIdsRef: useRef<string[]>([]),
    inputControllerRef: useRef<EditorInputController>(undefined),
    canvasToolRef: useRef<CanvasTool>("select"),
    themeRef: useRef<ColorTheme>("dark"),
    pendingSceneFrameRef: useRef<number>(undefined),
    documentModelRef: useRef<DocumentReadModel>(undefined),
    nodesByIdRef: useRef(new Map<string, NodeSummary>()),
    isolationRootIdRef: useRef<string>(undefined),
  };

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditorInfrastructure() {
  const context = useContext(EditorContext);
  if (!context)
    throw new Error(
      "useEditorInfrastructure must be used within EditorProvider",
    );
  return context;
}
