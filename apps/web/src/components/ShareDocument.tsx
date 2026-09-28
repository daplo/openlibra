import { useState } from "react";

export function ShareDocument({
  documentJson,
  onClose,
}: {
  documentJson: () => string;
  onClose: () => void;
}) {
  const [server, setServer] = useState("http://127.0.0.1:8787");
  const [name, setName] = useState("Designer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function publish() {
    setBusy(true);
    try {
      const endpoint = new URL(server).origin;
      const response = await fetch(`${endpoint}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, document: documentJson() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      sessionStorage.setItem(
        `open-libra-room-session:${endpoint}:${result.room_id}`,
        JSON.stringify(result),
      );
      const url = new URL(location.href);
      url.search = new URLSearchParams({
        shared: "1",
        server: endpoint,
        room: result.room_id,
      }).toString();
      url.hash = new URLSearchParams({ invite: result.invite }).toString();
      location.assign(url.href);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  return (
    <div className="shared-dialog-backdrop">
      <section
        className="shared-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Share document"
      >
        <h2>Share document</h2>
        <p>
          Publish a separate shared copy, including embedded images and
          components. Your local project remains in the Library.
        </p>
        <label>
          Collaboration server
          <input
            aria-label="Collaboration server"
            value={server}
            onChange={(e) => setServer(e.target.value)}
          />
        </label>
        <label>
          Your name
          <input
            aria-label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </label>
        <p>
          Requires a running collaboration service. Owner access is stored in
          this browser tab; keep a downloaded backup.
        </p>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy || !name.trim()} onClick={() => void publish()}>
          {busy ? "Publishing…" : "Publish shared copy"}
        </button>
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </section>
    </div>
  );
}
