import { useEffect, useState } from "react";
import type { CollaborationClient, Invitation } from "../editor/collaboration";

export function CollaborationAccess({
  client,
}: {
  client: CollaborationClient;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [ttl, setTtl] = useState(3600);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let live = true;
    if (client.role === "owner")
      void client
        .request("invitations")
        .then((result) => {
          if (live) setInvitations(result.invitations);
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    return () => {
      live = false;
    };
  }, [client, client.role]);
  async function action(path: string, body: unknown) {
    try {
      const result = await client.request(path, body);
      if (result.invitations) setInvitations(result.invitations);
      setError(undefined);
    } catch (e) {
      setError(String(e));
    }
  }
  function link(secret: string) {
    const url = new URL(location.href);
    url.hash = new URLSearchParams({ invite: secret }).toString();
    return url.href;
  }
  return (
    <section className="collab-access" aria-label="People and access">
      <h2>People and access</h2>
      <div className="collab-controls">
        <label>
          Your display name{" "}
          <input
            aria-label="Your display name"
            value={name}
            maxLength={60}
            placeholder={
              client.participants.find(
                (p) => p.actor_id === client.session.actor,
              )?.name
            }
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          disabled={!name.trim() || client.status !== "connected"}
          onClick={() => void action("profile", { name })}
        >
          Update name
        </button>
      </div>
      <ul className="collab-people">
        {client.participants.map((person) => (
          <li key={person.actor_id} data-actor={person.actor_id}>
            <span style={{ color: person.color }}>●</span>{" "}
            <strong>{person.name}</strong> · {person.role} ·{" "}
            {person.online ? "online" : "offline"}
            {client.role === "owner" && person.role !== "owner" && (
              <>
                <select
                  aria-label={`Role for ${person.name}`}
                  value={person.role}
                  onChange={(e) =>
                    void action("participants", {
                      actor_id: person.actor_id,
                      role: e.target.value,
                    })
                  }
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Revoke ${person.name}'s access? Revoke their invitation too to prevent a new join.`,
                      )
                    )
                      void action("participants", {
                        actor_id: person.actor_id,
                        revoke: true,
                      });
                  }}
                >
                  Revoke {person.name}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {client.role === "owner" && (
        <details>
          <summary>Room invitations</summary>
          <div className="collab-controls">
            <label>
              Invitation role{" "}
              <select
                aria-label="Invitation role"
                value={role}
                onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </label>
            <label>
              Invitation expiry{" "}
              <select
                aria-label="Invitation expiry"
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
              >
                <option value={3600}>1 hour</option>
                <option value={86400}>1 day</option>
                <option value={604800}>7 days</option>
              </select>
            </label>
            <button
              onClick={() =>
                void action("invitations", { role, ttl_seconds: ttl })
              }
            >
              Create invitation
            </button>
          </div>
          <ul className="collab-invitations">
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <span>
                  {invitation.role} ·{" "}
                  {invitation.revoked
                    ? "revoked"
                    : `expires ${new Date(invitation.expires_at).toLocaleString()}`}
                </span>
                <input
                  aria-label={`${invitation.role} invitation link`}
                  readOnly
                  value={link(invitation.secret)}
                />
                <button
                  disabled={
                    invitation.revoked || invitation.expires_at <= clock
                  }
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(link(invitation.secret))
                      .catch((e) => setError(String(e)))
                  }
                >
                  Copy {invitation.role} link
                </button>
                <button
                  disabled={invitation.revoked}
                  onClick={() =>
                    void action("invitations", { revoke: invitation.id })
                  }
                >
                  Revoke invitation
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
