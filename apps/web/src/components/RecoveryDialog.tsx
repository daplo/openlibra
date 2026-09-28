import { useEffect, useRef, useState } from "react";
import { DocumentEngine } from "../wasm/open_libra_scene_wasm";
import {
  createProjectPreview,
  listRecoverySnapshots,
  type ProjectPreview,
  type RecentDocument,
  type RecoverySnapshot,
} from "../editor/recent-documents";
import type { DocumentReadModel } from "../editor/types";
import { ProjectPreviewImage } from "./LibraryView";

type SnapshotView = {
  snapshot: RecoverySnapshot;
  preview?: ProjectPreview;
  pages: number;
  pageNames: string[];
  error?: string;
};

export function RecoveryDialog({
  project,
  onClose,
  onRestore,
}: {
  project: RecentDocument;
  onClose: () => void;
  onRestore: (snapshot: RecoverySnapshot) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [views, setViews] = useState<SnapshotView[]>([]);
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void listRecoverySnapshots(project.id)
      .then((snapshots) => {
        if (!active) return;
        const next = snapshots.map((snapshot): SnapshotView => {
          let engine: DocumentEngine | undefined;
          try {
            engine = DocumentEngine.load_json(snapshot.json);
            const model = JSON.parse(
              engine.read_model_json(),
            ) as DocumentReadModel;
            return {
              snapshot,
              preview: createProjectPreview(model),
              pages: model.pages.length,
              pageNames: model.pages.map((page) => page.name),
            };
          } catch {
            return {
              snapshot,
              pages: 0,
              pageNames: [],
              error: "This snapshot is damaged or unsupported.",
            };
          } finally {
            engine?.free();
          }
        });
        setViews(next);
        setSelected(next.find((view) => !view.error)?.snapshot.id);
      })
      .catch(() => {
        if (active) setError("Could not load recovery history. Please retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id, attempt]);
  const chosen = views.find((view) => view.snapshot.id === selected);
  async function restore() {
    if (!chosen || chosen.error || restoring) return;
    setRestoring(true);
    setError(undefined);
    try {
      if (await onRestore(chosen.snapshot)) onClose();
    } catch {
      setError(
        "Could not open this snapshot. Your original project has not been replaced.",
      );
    } finally {
      setRestoring(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="recovery-dialog"
      aria-labelledby="recovery-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!restoring) onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <h2 id="recovery-title">Recovery history</h2>
      <p>{project.name}</p>
      <p>
        Open an earlier snapshot as a separate project. The original project
        stays unchanged.
      </p>
      {loading ? (
        <p role="status">Loading recovery snapshots…</p>
      ) : (
        <>
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button
                disabled={restoring}
                onClick={() => setAttempt((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {!error && views.length === 0 && (
            <p>
              No recovery snapshots yet. Snapshots are created during autosave.
            </p>
          )}
          {views.length > 0 && (
            <div className="recovery-content">
              <fieldset disabled={restoring}>
                <legend>Saved snapshots</legend>
                {views.map((view) => (
                  <label className="recovery-option" key={view.snapshot.id}>
                    <input
                      type="radio"
                      name="recovery-snapshot"
                      checked={selected === view.snapshot.id}
                      disabled={!!view.error}
                      onChange={() => setSelected(view.snapshot.id)}
                    />
                    <span>
                      <time
                        dateTime={new Date(
                          view.snapshot.createdAt,
                        ).toISOString()}
                      >
                        {new Date(view.snapshot.createdAt).toLocaleString()}
                      </time>
                      <small>
                        {view.error ??
                          `${view.pages} ${view.pages === 1 ? "page" : "pages"}`}
                      </small>
                      {view.preview && (
                        <ProjectPreviewImage
                          preview={view.preview}
                          width={200}
                          height={95}
                        />
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
              {chosen?.preview && (
                <section aria-label="Snapshot preview">
                  <h3>Snapshot preview</h3>
                  <ProjectPreviewImage
                    preview={chosen.preview}
                    width={320}
                    height={200}
                  />
                  <p>
                    Simplified preview of the saved active page; images and
                    effects may differ.
                  </p>
                  <h4>Pages ({chosen.pages})</h4>
                  <ul>
                    {chosen.pageNames.map((name, index) => (
                      <li key={index}>{name}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      )}
      <footer>
        <button autoFocus disabled={restoring} onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={
            loading || !!error || !chosen || !!chosen.error || restoring
          }
          onClick={() => void restore()}
        >
          {restoring ? "Opening recovered copy…" : "Open as recovered copy"}
        </button>
      </footer>
    </dialog>
  );
}
