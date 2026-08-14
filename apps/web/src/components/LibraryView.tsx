import {
  Archive,
  ArrowLeft,
  Component,
  Copy,
  CopyPlus,
  FilePlus2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type {
  ComponentDefinition,
  DocumentReadModel,
  NodeSummary,
} from "../editor/types";
import { rgbaToHex } from "../editor/model-utils";
import type {
  ProjectPreview,
  RecentDocument,
} from "../editor/recent-documents";

export function LibraryView({
  model,
  focusedComponentId,
  section,
  recentDocuments,
  archivedDocuments,
  currentRecentDocumentId,
  onBack,
  onSectionChange,
  onNewDocument,
  onOpenRecent,
  onRemoveRecent,
  onRenameRecent,
  onDuplicateRecent,
  onArchiveRecent,
  onRestoreRecent,
  onSetProjectCover,
  onRecoverRecent,
  onInsert,
  onEditMain,
  onAddVariant,
}: {
  model: DocumentReadModel;
  focusedComponentId?: string;
  section: "projects" | "components";
  recentDocuments: RecentDocument[];
  archivedDocuments: RecentDocument[];
  currentRecentDocumentId?: string;
  onBack: () => void;
  onSectionChange: (section: "projects" | "components") => void;
  onNewDocument: () => void;
  onOpenRecent: (document: RecentDocument) => void;
  onRemoveRecent: (id: string) => void;
  onRenameRecent: (document: RecentDocument) => void;
  onDuplicateRecent: (document: RecentDocument) => void;
  onArchiveRecent: (document: RecentDocument) => void;
  onRestoreRecent: (document: RecentDocument) => void;
  onSetProjectCover: (document: RecentDocument, pageId: string) => void;
  onRecoverRecent: (document: RecentDocument) => void;
  onInsert: (componentId: string, variantId: string) => void;
  onEditMain: (sourceRootId: string) => void;
  onAddVariant: (
    componentId: string,
    sourceVariantId: string,
    name: string,
  ) => void;
}) {
  const activeSection = focusedComponentId ? "components" : section;
  const components = focusedComponentId
    ? model.components.filter(
        (component) => component.id === focusedComponentId,
      )
    : model.components;
  return (
    <section className="library-view" data-testid="component-library-view">
      <header className="library-view-header">
        <button type="button" className="library-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Editor
        </button>
        <div>
          <span className="eyebrow">Library</span>
          <h1>
            {activeSection === "projects" ? "Recent projects" : "Components"}
          </h1>
          <p>
            {activeSection === "projects"
              ? "Continue working from a recent local project."
              : "Reusable definitions, variants, and live previews."}
          </p>
        </div>
      </header>
      {!focusedComponentId && (
        <nav className="library-tabs" aria-label="Library sections">
          <button
            type="button"
            className={activeSection === "projects" ? "active" : ""}
            onClick={() => onSectionChange("projects")}
          >
            Projects
          </button>
          <button
            type="button"
            className={activeSection === "components" ? "active" : ""}
            onClick={() => onSectionChange("components")}
          >
            Components
          </button>
        </nav>
      )}
      {activeSection === "projects" ? (
        <ProjectLibrary
          documents={recentDocuments}
          archivedDocuments={archivedDocuments}
          currentDocumentId={currentRecentDocumentId}
          onNewDocument={onNewDocument}
          onOpen={onOpenRecent}
          onRemove={onRemoveRecent}
          onRename={onRenameRecent}
          onDuplicate={onDuplicateRecent}
          onArchive={onArchiveRecent}
          onRestore={onRestoreRecent}
          onSetCover={onSetProjectCover}
          onRecover={onRecoverRecent}
        />
      ) : components.length === 0 ? (
        <div className="library-empty">
          <Component aria-hidden="true" />
          <strong>No components yet</strong>
          <span>Create one from a selected frame or group.</span>
        </div>
      ) : (
        <div className="component-library-grid">
          {components.map((component) => (
            <ComponentLibraryCard
              key={component.id}
              component={component}
              nodes={model.nodes}
              onInsert={onInsert}
              onEditMain={onEditMain}
              onAddVariant={onAddVariant}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectLibrary({
  documents,
  archivedDocuments,
  currentDocumentId,
  onNewDocument,
  onOpen,
  onRemove,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onSetCover,
  onRecover,
}: {
  documents: RecentDocument[];
  archivedDocuments: RecentDocument[];
  currentDocumentId?: string;
  onNewDocument: () => void;
  onOpen: (document: RecentDocument) => void;
  onRemove: (id: string) => void;
  onRename: (document: RecentDocument) => void;
  onDuplicate: (document: RecentDocument) => void;
  onArchive: (document: RecentDocument) => void;
  onRestore: (document: RecentDocument) => void;
  onSetCover: (document: RecentDocument, pageId: string) => void;
  onRecover: (document: RecentDocument) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const visibleDocuments = showArchived ? archivedDocuments : documents;
  return (
    <div className="project-library" data-testid="project-library-view">
      <div className="project-library-toolbar">
        <button
          type="button"
          className={!showArchived ? "active" : ""}
          onClick={() => setShowArchived(false)}
        >
          Recent
        </button>
        <button
          type="button"
          className={showArchived ? "active" : ""}
          onClick={() => setShowArchived(true)}
        >
          Archived ({archivedDocuments.length})
        </button>
      </div>
      <div className="project-library-grid">
        {!showArchived && (
          <button
            type="button"
            className="project-new-card"
            onClick={onNewDocument}
          >
            <FilePlus2 aria-hidden="true" />
            <strong>New document</strong>
            <span>Start with an empty page</span>
          </button>
        )}
        {visibleDocuments.map((document) => (
          <article
            className={`project-card ${document.id === currentDocumentId ? "current" : ""}`}
            data-testid={`recent-project-${document.id}`}
            key={document.id}
          >
            <button
              type="button"
              className="project-card-open"
              onClick={() => onOpen(document)}
            >
              <ProjectPreviewImage preview={document.preview} />
              <span className="project-card-copy">
                <strong>{document.name}</strong>
                <small>
                  {document.pageCount} page{document.pageCount === 1 ? "" : "s"}{" "}
                  · {document.objectCount.toLocaleString()} objects
                </small>
                <small>{formatRecentDate(document.updatedAt)}</small>
              </span>
            </button>
            <button
              type="button"
              className="project-card-remove"
              aria-label={`Remove ${document.name} from recent projects`}
              title="Remove from recent projects"
              onClick={() => onRemove(document.id)}
            >
              <Trash2 aria-hidden="true" />
            </button>
            <div className="project-card-actions">
              {showArchived ? (
                <button
                  type="button"
                  onClick={() => onRestore(document)}
                  title="Restore project"
                >
                  <RotateCcw aria-hidden="true" /> Restore
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => onRename(document)}>
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicate(document)}
                    title="Duplicate project"
                  >
                    <Copy aria-hidden="true" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => onArchive(document)}
                    title="Archive project"
                  >
                    <Archive aria-hidden="true" /> Archive
                  </button>
                  <button
                    type="button"
                    onClick={() => onRecover(document)}
                    title="Recovery history"
                  >
                    <RotateCcw aria-hidden="true" /> Recover
                  </button>
                  {(document.pages?.length ?? 0) > 1 && (
                    <select
                      aria-label={`Cover page for ${document.name}`}
                      value={document.coverPageId ?? document.pages?.[0]?.id}
                      onChange={(event) =>
                        onSetCover(document, event.target.value)
                      }
                    >
                      {document.pages?.map((page) => (
                        <option key={page.id} value={page.id}>
                          Cover: {page.name}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        {showArchived && visibleDocuments.length === 0 && (
          <div className="library-empty project-archive-empty">
            <Archive aria-hidden="true" />
            <strong>No archived projects</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectPreviewImage({ preview }: { preview: ProjectPreview }) {
  const scale = Math.min(
    1,
    280 / preview.bounds.width,
    160 / preview.bounds.height,
  );
  return (
    <span className="project-preview">
      <span
        className="project-preview-scene"
        style={{
          width: preview.bounds.width * scale,
          height: preview.bounds.height * scale,
        }}
      >
        {preview.nodes.map((node) => (
          <span
            className={`project-preview-node ${node.kind}`}
            key={node.id}
            style={{
              left: (node.x - preview.bounds.x) * scale,
              top: (node.y - preview.bounds.y) * scale,
              width: Math.max(1, node.width * scale),
              height: Math.max(1, node.height * scale),
              borderRadius: node.corner_radii[0] * scale,
              background: rgba(node.fill),
              fontSize: Math.max(4, 10 * scale),
            }}
          >
            {node.kind === "text" ? node.text : ""}
          </span>
        ))}
      </span>
    </span>
  );
}

function rgba(color: number[]) {
  const [red = 0, green = 0, blue = 0, alpha = 1] = color;
  return `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${alpha})`;
}

function formatRecentDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function ComponentLibraryCard({
  component,
  nodes,
  onInsert,
  onEditMain,
  onAddVariant,
}: {
  component: ComponentDefinition;
  nodes: NodeSummary[];
  onInsert: (componentId: string, variantId: string) => void;
  onEditMain: (sourceRootId: string) => void;
  onAddVariant: (
    componentId: string,
    sourceVariantId: string,
    name: string,
  ) => void;
}) {
  return (
    <article
      className="component-library-card"
      id={`component-${component.id}`}
    >
      <div className="component-library-title">
        <Component aria-hidden="true" />
        <div>
          <h2>{component.name}</h2>
          <span>{component.variants.length} variant(s)</span>
        </div>
        <button
          type="button"
          className="component-edit-main"
          onClick={() => onEditMain(component.variants[0].source_root_id)}
        >
          <Pencil aria-hidden="true" />
          Edit main
        </button>
        <button
          type="button"
          className="component-add-variant"
          onClick={() => {
            const source = component.variants.at(-1)!;
            onAddVariant(
              component.id,
              source.id,
              `Variant ${component.variants.length + 1}`,
            );
          }}
        >
          <CopyPlus aria-hidden="true" />
          Add variant
        </button>
      </div>
      <div className="component-variant-grid">
        {component.variants.map((variant) => {
          const root = nodes.find((node) => node.id === variant.source_root_id);
          return (
            <section className="component-variant-card" key={variant.id}>
              <div className="component-preview">
                {root && <ComponentPreview root={root} nodes={nodes} />}
              </div>
              <footer>
                <span>{variant.name}</span>
                <button
                  type="button"
                  aria-label={`Edit ${component.name} ${variant.name}`}
                  title="Edit variant in isolation"
                  onClick={() => onEditMain(variant.source_root_id)}
                >
                  <Pencil aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Insert ${component.name} ${variant.name}`}
                  title="Insert instance"
                  onClick={() => onInsert(component.id, variant.id)}
                >
                  <Plus aria-hidden="true" />
                </button>
              </footer>
            </section>
          );
        })}
      </div>
    </article>
  );
}

function ComponentPreview({
  root,
  nodes,
}: {
  root: NodeSummary;
  nodes: NodeSummary[];
}) {
  const descendants = nodes.filter((node) =>
    isDescendant(node, root.id, nodes),
  );
  const scale = Math.min(1, 240 / root.width, 150 / root.height);
  return (
    <div
      className="component-preview-root"
      style={{ width: root.width * scale, height: root.height * scale }}
    >
      {[root, ...descendants].map((node) => (
        <div
          key={node.id}
          className={`component-preview-node ${node.kind}`}
          style={{
            left: (node.x - root.x) * scale,
            top: (node.y - root.y) * scale,
            width: node.width * scale,
            height: node.height * scale,
            borderRadius: node.corner_radii[0] * scale,
            background:
              node.kind === "text" || node.kind === "icon"
                ? "transparent"
                : rgbaToHex(node.fill),
            color: rgbaToHex(node.fill),
            border:
              node.stroke_width > 0
                ? `${Math.max(1, node.stroke_width * scale)}px solid ${rgbaToHex(node.stroke)}`
                : undefined,
            fontSize: node.text
              ? Math.max(5, node.text.font_size * scale)
              : undefined,
            fontWeight: node.text?.font_weight,
          }}
        >
          {node.text?.content}
          {node.kind === "icon" ? "◇" : ""}
        </div>
      ))}
    </div>
  );
}

function isDescendant(node: NodeSummary, rootId: string, nodes: NodeSummary[]) {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  let parentId = node.parent_id;
  while (parentId) {
    if (parentId === rootId) return true;
    parentId = byId.get(parentId)?.parent_id;
  }
  return false;
}
