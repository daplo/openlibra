import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  Check,
  ChevronRight,
  FileArchive,
  FilePlus2,
  FolderClock,
  FolderOpen,
  Moon,
  Redo2,
  Save,
  Sun,
  Undo2,
} from "lucide-react";
import { MODES } from "../editor/constants";
import { autosaveLabel } from "../editor/app-utils";
import type { RecentDocument } from "../editor/recent-documents";
import type { Mode } from "../editor/types";
import type { ColorTheme } from "../renderer";

type EditorTopbarProps = {
  documentName: string;
  isDocumentDirty: boolean;
  autosaveState: "idle" | "saving" | "saved" | "error";
  recentDocuments: RecentDocument[];
  currentRecentDocumentId?: string;
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  libraryOpen: boolean;
  setLibraryOpen: Dispatch<SetStateAction<boolean>>;
  setLibraryComponentId: Dispatch<SetStateAction<string | undefined>>;
  setLibrarySection: Dispatch<SetStateAction<"projects" | "components">>;
  theme: ColorTheme;
  setTheme: Dispatch<SetStateAction<ColorTheme>>;
  historyState: { canUndo: boolean; canRedo: boolean };
  rulersVisible: boolean;
  setRulersVisible: Dispatch<SetStateAction<boolean>>;
  gridVisible: boolean;
  setGridVisible: Dispatch<SetStateAction<boolean>>;
  toolbarPosition: "top" | "bottom";
  setToolbarPosition: Dispatch<SetStateAction<"top" | "bottom">>;
  newDocument: () => void | Promise<void>;
  requestOpenDocument: () => Promise<boolean>;
  saveDocument: () => void;
  openDocument: (file: File) => void | Promise<void>;
  importFigma: (file: File) => void | Promise<void>;
  openRecentDocument: (document: RecentDocument) => void | Promise<void>;
  undo: () => void;
  redo: () => void;
};

export function EditorTopbar({
  documentName,
  isDocumentDirty,
  autosaveState,
  recentDocuments,
  currentRecentDocumentId,
  mode,
  setMode,
  libraryOpen,
  setLibraryOpen,
  setLibraryComponentId,
  setLibrarySection,
  theme,
  setTheme,
  historyState,
  rulersVisible,
  setRulersVisible,
  gridVisible,
  setGridVisible,
  toolbarPosition,
  setToolbarPosition,
  newDocument,
  requestOpenDocument,
  saveDocument,
  openDocument,
  importFigma,
  openRecentDocument,
  undo,
  redo,
}: EditorTopbarProps) {
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const documentSwitcherRef = useRef<HTMLDivElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const figmaFileInputRef = useRef<HTMLInputElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [documentSwitcherOpen, setDocumentSwitcherOpen] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  useDismissMenu(fileMenuRef, fileMenuOpen, setFileMenuOpen);
  useDismissMenu(
    documentSwitcherRef,
    documentSwitcherOpen,
    setDocumentSwitcherOpen,
  );
  useDismissMenu(editMenuRef, editMenuOpen, setEditMenuOpen);
  useDismissMenu(viewMenuRef, viewMenuOpen, setViewMenuOpen);

  const requestDocumentOpen = async () => {
    setFileMenuOpen(false);
    setDocumentSwitcherOpen(false);
    if (await requestOpenDocument()) documentFileInputRef.current?.click();
  };
  const createDocument = () => {
    setFileMenuOpen(false);
    setDocumentSwitcherOpen(false);
    void newDocument();
  };
  const saveCurrentDocument = () => {
    setFileMenuOpen(false);
    saveDocument();
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark">OL</span>
        <strong>Open Libra</strong>
        <div className="document-switcher" ref={documentSwitcherRef}>
          <button
            type="button"
            className={`file-name ${documentSwitcherOpen ? "active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={documentSwitcherOpen}
            onClick={() => {
              setFileMenuOpen(false);
              setDocumentSwitcherOpen((open) => !open);
            }}
          >
            {documentName}
            {isDocumentDirty ? " •" : ""}
            <span
              className={`autosave-indicator ${autosaveState}`}
              title={autosaveLabel(autosaveState, isDocumentDirty)}
            />
            <ChevronRight aria-hidden="true" />
          </button>
          {documentSwitcherOpen && (
            <div className="document-switcher-menu" role="menu">
              <div className="document-switcher-heading">Documents</div>
              <button
                type="button"
                className="document-switcher-item current"
                role="menuitem"
                onClick={() => setDocumentSwitcherOpen(false)}
              >
                <Check aria-hidden="true" />
                <span>
                  <strong>{documentName}</strong>
                  <small>{autosaveLabel(autosaveState, isDocumentDirty)}</small>
                </span>
              </button>
              {recentDocuments
                .filter((document) => document.id !== currentRecentDocumentId)
                .slice(0, 6)
                .map((document) => (
                  <button
                    type="button"
                    className="document-switcher-item"
                    role="menuitem"
                    key={document.id}
                    onClick={() => {
                      setDocumentSwitcherOpen(false);
                      void openRecentDocument(document);
                    }}
                  >
                    <span className="document-switcher-dot" />
                    <span>
                      <strong>{document.name}</strong>
                      <small>
                        {document.pageCount} page
                        {document.pageCount === 1 ? "" : "s"} ·{" "}
                        {document.objectCount.toLocaleString()} objects
                      </small>
                    </span>
                  </button>
                ))}
              <div className="document-switcher-actions">
                <button type="button" role="menuitem" onClick={createDocument}>
                  <FilePlus2 aria-hidden="true" /> New
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void requestDocumentOpen()}
                >
                  <FolderOpen aria-hidden="true" /> Open…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setDocumentSwitcherOpen(false);
                    setLibraryComponentId(undefined);
                    setLibrarySection("projects");
                    setLibraryOpen(true);
                  }}
                >
                  <FolderClock aria-hidden="true" /> View all
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="menu-anchor" ref={fileMenuRef}>
          <button
            type="button"
            className={`menu-trigger ${fileMenuOpen ? "active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={fileMenuOpen}
            onClick={() => {
              setEditMenuOpen(false);
              setViewMenuOpen(false);
              setFileMenuOpen((open) => !open);
            }}
          >
            File
          </button>
          {fileMenuOpen && (
            <div className="edit-menu file-menu" role="menu">
              <button type="button" role="menuitem" onClick={createDocument}>
                <FilePlus2 />
                <span>New document</span>
                <kbd>⌘N</kbd>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void requestDocumentOpen()}
              >
                <FolderOpen />
                <span>Open…</span>
                <kbd>⌘O</kbd>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={saveCurrentDocument}
              >
                <Save />
                <span>Save</span>
                <kbd>⌘S</kbd>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  setLibraryComponentId(undefined);
                  setLibrarySection("projects");
                  setLibraryOpen(true);
                }}
              >
                <FolderClock />
                <span>Recent projects…</span>
                <kbd />
              </button>
              <div className="menu-section-label">Import</div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  figmaFileInputRef.current?.click();
                }}
              >
                <FileArchive />
                <span>Import Figma file…</span>
                <kbd>.fig</kbd>
              </button>
            </div>
          )}
          <input
            ref={documentFileInputRef}
            className="hidden-file-input"
            data-testid="open-document-input"
            type="file"
            accept=".libra,.olibra,.json,application/json,application/vnd.openlibra.project+json,application/vnd.openlibra+json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void openDocument(file);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={figmaFileInputRef}
            className="hidden-file-input"
            data-testid="file-menu-figma-upload"
            type="file"
            accept=".fig,application/octet-stream"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFigma(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
        <div className="menu-anchor" ref={editMenuRef}>
          <button
            type="button"
            className={`menu-trigger ${editMenuOpen ? "active" : ""}`}
            onClick={() => {
              setFileMenuOpen(false);
              setViewMenuOpen(false);
              setEditMenuOpen((open) => !open);
            }}
          >
            Edit
          </button>
          {editMenuOpen && (
            <div className="edit-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={!historyState.canUndo}
                onClick={() => {
                  undo();
                  setEditMenuOpen(false);
                }}
              >
                <Undo2 />
                <span>Undo</span>
                <kbd>⌘Z</kbd>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!historyState.canRedo}
                onClick={() => {
                  redo();
                  setEditMenuOpen(false);
                }}
              >
                <Redo2 />
                <span>Redo</span>
                <kbd>⇧⌘Z</kbd>
              </button>
            </div>
          )}
        </div>
        <div className="menu-anchor" ref={viewMenuRef}>
          <button
            type="button"
            className={`menu-trigger ${viewMenuOpen ? "active" : ""}`}
            onClick={() => {
              setFileMenuOpen(false);
              setEditMenuOpen(false);
              setViewMenuOpen((open) => !open);
            }}
          >
            View
          </button>
          {viewMenuOpen && (
            <div className="edit-menu view-menu" role="menu">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={rulersVisible}
                onClick={() => setRulersVisible((visible) => !visible)}
              >
                <span className="menu-check">{rulersVisible ? "✓" : ""}</span>
                <span>Show rulers</span>
                <kbd>⇧R</kbd>
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={gridVisible}
                onClick={() => setGridVisible((visible) => !visible)}
              >
                <span className="menu-check">{gridVisible ? "✓" : ""}</span>
                <span>Show grid</span>
                <kbd>⇧G</kbd>
              </button>
              <div className="menu-section-label">Toolbar</div>
              {(["top", "bottom"] as const).map((position) => (
                <button
                  type="button"
                  key={position}
                  role="menuitemradio"
                  aria-checked={toolbarPosition === position}
                  onClick={() => setToolbarPosition(position)}
                >
                  <span className="menu-check">
                    {toolbarPosition === position ? "●" : ""}
                  </span>
                  <span>{position === "top" ? "Top" : "Bottom"}</span>
                  <span />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <nav className="mode-switcher" aria-label="Editor mode">
        {MODES.map((item) => (
          <button
            type="button"
            key={item.id}
            className={mode === item.id ? "active" : ""}
            onClick={() => setMode(item.id)}
            title={`${item.label} mode (${item.shortcut})`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="topbar-actions">
        <button
          type="button"
          className={`library-trigger ${libraryOpen ? "active" : ""}`}
          onClick={() => {
            setLibraryComponentId(undefined);
            setLibrarySection("projects");
            setLibraryOpen((open) => !open);
          }}
        >
          Library
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={() =>
            setTheme((current) => (current === "dark" ? "light" : "dark"))
          }
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <button type="button" className="share-button">
          Share
        </button>
      </div>
    </header>
  );
}

function useDismissMenu(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target))
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open, ref, setOpen]);
}
