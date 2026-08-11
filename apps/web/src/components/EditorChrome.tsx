export function Inspect() {
  return (
    <>
      <h2>Inspect</h2>
      <div className="code-block">
        display: block;
        <br />
        width: 58px;
        <br />
        height: 42px;
      </div>
      <button className="secondary-button">Copy CSS</button>
      <EmptyState text="Token and layout inspection arrives in Levels 6 and 9." />
    </>
  );
}
export function Review() {
  return (
    <>
      <h2>Comments</h2>
      <button className="primary-button">Place comment</button>
      <EmptyState text="Anchored collaborative threads arrive in Level 9." />
    </>
  );
}

export function ToolButton({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={active ? "active" : ""}
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}
