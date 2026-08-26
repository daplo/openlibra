import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createProjectPreview,
  getRecentDocument,
  listArchivedDocuments,
  listRecoverySnapshots,
  listRecentDocuments,
  removeRecentDocument,
  setLastDocumentId,
  storeRecentDocument,
  storeRecoverySnapshot,
  type RecentDocument,
} from "./recent-documents";
import {
  OPEN_LIBRA_PROJECT_MIME,
  parseProject,
  serializeProject,
} from "./project-format";
import type { DocumentReadModel } from "./types";
import type { VectorPointSelection } from "../components/VectorPointOverlay";
import { DocumentEngine } from "../wasm/open_libra_scene_wasm";
import { useEditorInfrastructure } from "./EditorContext";

type UseDocumentLifecycleOptions = {
  documentModel: DocumentReadModel;
  refreshDocument: (selection?: string[]) => void;
  flushPendingSceneRefresh: () => void;
  setIsolationRootId: Dispatch<SetStateAction<string | undefined>>;
  setEditingTextId: Dispatch<SetStateAction<string | undefined>>;
  setEditingVectorId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedVectorPoint: Dispatch<
    SetStateAction<VectorPointSelection | undefined>
  >;
  setLibraryOpen: Dispatch<SetStateAction<boolean>>;
  setLibraryComponentId: Dispatch<SetStateAction<string | undefined>>;
  setError: Dispatch<SetStateAction<string | undefined>>;
};

export function useDocumentLifecycle({
  documentModel,
  refreshDocument,
  flushPendingSceneRefresh,
  setIsolationRootId,
  setEditingTextId,
  setEditingVectorId,
  setSelectedVectorPoint,
  setLibraryOpen,
  setLibraryComponentId,
  setError,
}: UseDocumentLifecycleOptions) {
  const { engineRef, rendererRef, copiedNodeIdsRef } =
    useEditorInfrastructure();
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const [archivedDocuments, setArchivedDocuments] = useState<RecentDocument[]>(
    [],
  );
  const [currentRecentDocumentId, setCurrentRecentDocumentId] =
    useState<string>();
  const [documentName, setDocumentName] = useState("Engine study.libra");
  const [isDocumentDirty, setIsDocumentDirty] = useState(false);
  const savedDocumentJsonRef = useRef<string>(undefined);
  const lastRecoverySnapshotAtRef = useRef(new Map<string, number>());
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  function replaceDocumentEngine(
    engine: DocumentEngine,
    name: string,
    recentDocumentId?: string,
  ) {
    flushPendingSceneRefresh();
    const previous = engineRef.current;
    engineRef.current = engine;
    savedDocumentJsonRef.current = engine.document_json();
    setDocumentName(name);
    setCurrentRecentDocumentId(recentDocumentId);
    setLastDocumentId(recentDocumentId);
    setAutosaveState("saved");
    setIsDocumentDirty(false);
    setIsolationRootId(undefined);
    setEditingTextId(undefined);
    setEditingVectorId(undefined);
    setSelectedVectorPoint(undefined);
    setLibraryOpen(false);
    setLibraryComponentId(undefined);
    copiedNodeIdsRef.current = [];
    setError(undefined);
    refreshDocument([]);
    rendererRef.current?.resetView();
    previous?.free();
  }

  async function preserveCurrentDocument() {
    const engine = engineRef.current;
    if (!engine) return true;
    const id = currentRecentDocumentId ?? crypto.randomUUID();
    const stored = await rememberDocument(engine, documentName, id);
    return (
      stored ||
      window.confirm(
        "This document could not be stored locally. Continue and discard it?",
      )
    );
  }

  async function newDocument() {
    if (!(await preserveCurrentDocument())) return;
    const id = crypto.randomUUID();
    const name = nextUntitledDocumentName();
    const engine = DocumentEngine.new_blank();
    replaceDocumentEngine(engine, name, id);
    void rememberDocument(engine, name, id);
  }

  async function requestOpenDocument() {
    return preserveCurrentDocument();
  }

  async function openDocument(file: File) {
    if (file.size > 250 * 1024 * 1024) {
      setError("Open Libra documents must be 250 MB or smaller.");
      return;
    }
    try {
      const engine = DocumentEngine.load_json(parseProject(await file.text()));
      const recentDocumentId = crypto.randomUUID();
      replaceDocumentEngine(engine, file.name, recentDocumentId);
      void rememberDocument(engine, file.name, recentDocumentId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not open document: ${String(cause)}`,
      );
    }
  }

  function saveDocument() {
    const engine = engineRef.current;
    if (!engine) return;
    const json = engine.document_json();
    const blob = new Blob([serializeProject(json)], {
      type: OPEN_LIBRA_PROJECT_MIME,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = /\.(libra|olibra|json)$/i.test(documentName)
      ? documentName
      : `${documentName}.libra`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    savedDocumentJsonRef.current = json;
    setIsDocumentDirty(false);
    void rememberDocument(
      engine,
      documentName,
      currentRecentDocumentId ?? crypto.randomUUID(),
    );
  }

  async function refreshRecentDocuments() {
    try {
      const [recent, archived] = await Promise.all([
        listRecentDocuments(),
        listArchivedDocuments(),
      ]);
      setRecentDocuments(recent);
      setArchivedDocuments(archived);
    } catch {
      // IndexedDB may be unavailable in hardened/private browser contexts.
      setRecentDocuments([]);
      setArchivedDocuments([]);
    }
  }

  async function rememberDocument(
    engine: DocumentEngine,
    name: string,
    id: string,
  ) {
    const json = engine.document_json();
    const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
    try {
      const existing = await getRecentDocument(id);
      if (engineRef.current !== engine) return false;
      await storeRecentDocument({
        id,
        name,
        json,
        updatedAt: Date.now(),
        pageCount: model.pages.length,
        objectCount: model.nodes.length,
        preview:
          !existing || existing.coverPageId === model.active_page_id
            ? createProjectPreview(model)
            : existing.preview,
        pages: model.pages,
        coverPageId: existing?.coverPageId ?? model.active_page_id,
        archivedAt: existing?.archivedAt,
      });
      if (engineRef.current === engine) {
        setCurrentRecentDocumentId(id);
        setLastDocumentId(id);
      }
      await refreshRecentDocuments();
      return true;
    } catch {
      setError(
        "The document is available, but its recent-project preview could not be stored.",
      );
      return false;
    }
  }

  async function autosaveDocument() {
    const engine = engineRef.current;
    if (!engine) return;
    const id = currentRecentDocumentId ?? crypto.randomUUID();
    const name = documentName;
    const snapshotJson = engine.document_json();
    setAutosaveState("saving");
    const stored = await rememberDocument(engine, name, id);
    if (engineRef.current !== engine) return;
    if (!stored) {
      setAutosaveState("error");
      return;
    }
    const now = Date.now();
    const lastSnapshotAt = lastRecoverySnapshotAtRef.current.get(id) ?? 0;
    if (now - lastSnapshotAt >= 5 * 60 * 1000) {
      try {
        await storeRecoverySnapshot({
          id: crypto.randomUUID(),
          documentId: id,
          name,
          json: snapshotJson,
          createdAt: now,
        });
        lastRecoverySnapshotAtRef.current.set(id, now);
      } catch {
        // The primary autosave succeeded, so snapshot failure is non-fatal.
      }
    }
    if (engineRef.current !== engine) return;
    setAutosaveState("saved");
  }

  function nextUntitledDocumentName() {
    const names = new Set([
      documentName,
      ...recentDocuments.map((document) => document.name),
    ]);
    let number = 1;
    while (
      names.has(number === 1 ? "Untitled.libra" : `Untitled ${number}.libra`)
    )
      number += 1;
    return number === 1 ? "Untitled.libra" : `Untitled ${number}.libra`;
  }

  async function openRecentDocument(document: RecentDocument) {
    if (document.id === currentRecentDocumentId) {
      setLibraryOpen(false);
      return;
    }
    if (!(await preserveCurrentDocument())) return;
    try {
      const engine = DocumentEngine.load_json(document.json);
      replaceDocumentEngine(engine, document.name, document.id);
      void touchRecentDocument(document);
      setLibraryOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not open recent document: ${String(cause)}`,
      );
    }
  }

  async function touchRecentDocument(document: RecentDocument) {
    try {
      await storeRecentDocument({ ...document, updatedAt: Date.now() });
      await refreshRecentDocuments();
    } catch {
      // Opening the stored project succeeded; a recency update is optional.
    }
  }

  async function removeRecentProject(id: string) {
    try {
      await removeRecentDocument(id);
      if (currentRecentDocumentId === id) {
        setCurrentRecentDocumentId(undefined);
        setLastDocumentId(undefined);
      }
      await refreshRecentDocuments();
    } catch {
      setError("Could not remove the project from recent documents.");
    }
  }

  async function renameRecentProject(document: RecentDocument) {
    const name = window.prompt("Project name", document.name)?.trim();
    if (!name || name === document.name) return;
    const renamed = { ...document, name, updatedAt: Date.now() };
    await storeRecentDocument(renamed);
    if (currentRecentDocumentId === document.id) setDocumentName(name);
    await refreshRecentDocuments();
  }

  async function duplicateRecentProject(document: RecentDocument) {
    const stem = document.name.replace(/\.(libra|olibra|json)$/i, "");
    const copy: RecentDocument = {
      ...document,
      id: crypto.randomUUID(),
      name: `${stem} copy.libra`,
      updatedAt: Date.now(),
      archivedAt: undefined,
    };
    await storeRecentDocument(copy);
    await refreshRecentDocuments();
  }

  async function archiveRecentProject(document: RecentDocument) {
    if (currentRecentDocumentId === document.id) {
      const currentEngine = engineRef.current;
      if (
        currentEngine &&
        !(await rememberDocument(currentEngine, documentName, document.id))
      )
        return;
      const currentDocument =
        (await getRecentDocument(document.id)) ?? document;
      await storeRecentDocument({
        ...currentDocument,
        archivedAt: Date.now(),
      });
      const id = crypto.randomUUID();
      const name = nextUntitledDocumentName();
      const engine = DocumentEngine.new_blank();
      replaceDocumentEngine(engine, name, id);
      await rememberDocument(engine, name, id);
    } else {
      await storeRecentDocument({ ...document, archivedAt: Date.now() });
    }
    await refreshRecentDocuments();
  }

  async function restoreRecentProject(document: RecentDocument) {
    await storeRecentDocument({
      ...document,
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
    await refreshRecentDocuments();
  }

  async function setProjectCover(document: RecentDocument, pageId: string) {
    let engine: DocumentEngine | undefined;
    try {
      engine = DocumentEngine.load_json(document.json);
      if (!engine.set_active_page(pageId)) return;
      const model = JSON.parse(engine.read_model_json()) as DocumentReadModel;
      await storeRecentDocument({
        ...document,
        coverPageId: pageId,
        preview: createProjectPreview(model),
      });
      await refreshRecentDocuments();
    } catch {
      setError("Could not generate the selected project cover.");
    } finally {
      engine?.free();
    }
  }

  async function recoverRecentProject(document: RecentDocument) {
    try {
      const snapshots = await listRecoverySnapshots(document.id);
      if (snapshots.length === 0) {
        setError("No recovery snapshots are available for this project yet.");
        return;
      }
      const choices = snapshots
        .map(
          (snapshot, index) =>
            `${index + 1}. ${new Date(snapshot.createdAt).toLocaleString()}`,
        )
        .join("\n");
      const choice = window.prompt(
        `Choose a recovery snapshot (1-${snapshots.length}):\n${choices}`,
        "1",
      );
      if (!choice) return;
      const snapshot = snapshots[Number.parseInt(choice, 10) - 1];
      if (!snapshot) {
        setError("That recovery snapshot does not exist.");
        return;
      }
      if (!(await preserveCurrentDocument())) return;
      const engine = DocumentEngine.load_json(snapshot.json);
      replaceDocumentEngine(engine, document.name, document.id);
      setLibraryOpen(false);
      setIsDocumentDirty(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    void refreshRecentDocuments();
  }, []);

  useEffect(() => {
    if (!isDocumentDirty || !engineRef.current) return;
    const timeout = window.setTimeout(() => void autosaveDocument(), 800);
    return () => window.clearTimeout(timeout);
    // documentModel changes after every committed engine mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentModel, isDocumentDirty, documentName, currentRecentDocumentId]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDocumentDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDocumentDirty]);

  return {
    recentDocuments,
    archivedDocuments,
    currentRecentDocumentId,
    setCurrentRecentDocumentId,
    documentName,
    setDocumentName,
    isDocumentDirty,
    setIsDocumentDirty,
    savedDocumentJsonRef,
    autosaveState,
    setAutosaveState,
    newDocument,
    requestOpenDocument,
    openDocument,
    saveDocument,
    rememberDocument,
    openRecentDocument,
    removeRecentProject,
    renameRecentProject,
    duplicateRecentProject,
    archiveRecentProject,
    restoreRecentProject,
    setProjectCover,
    recoverRecentProject,
  };
}
