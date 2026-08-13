import { useMemo, useState } from "react";
import { rgbaToHex } from "../editor/model-utils";
import type {
  NodeSummary,
  NumberVariable,
  TextStyleAsset,
} from "../editor/types";

export function Inspect({
  selected,
  numberVariables,
  textStyles,
}: {
  selected: NodeSummary[];
  numberVariables: NumberVariable[];
  textStyles: TextStyleAsset[];
}) {
  const [copied, setCopied] = useState(false);
  const node = selected.length === 1 ? selected[0] : undefined;
  const css = useMemo(() => (node ? nodeCss(node) : ""), [node]);
  if (!node)
    return (
      <>
        <h2>Inspect</h2>
        <EmptyState
          text={
            selected.length > 1
              ? `${selected.length} layers selected. Select one layer to inspect implementation values.`
              : "Select a layer to inspect implementation values."
          }
        />
      </>
    );
  const variableRows = Object.entries(node.variable_bindings)
    .flatMap(([property, binding]) =>
      Array.isArray(binding)
        ? binding.flatMap((id, index) =>
            id ? [[`${property}[${index}]`, id] as const] : [],
          )
        : binding
          ? ([[property, binding]] as const)
          : [],
    )
    .map(([property, id]) => ({
      property,
      variable: numberVariables.find((variable) => variable.id === id),
    }));
  const textStyle = textStyles.find((style) => style.id === node.text_style_id);
  return (
    <>
      <h2>Inspect</h2>
      <div className="inspect-summary">
        <strong>{node.name}</strong>
        <span>{node.kind}</span>
      </div>
      <dl className="inspect-metrics">
        <div>
          <dt>Position</dt>
          <dd>
            {node.x}, {node.y}
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>
            {node.width} × {node.height}
          </dd>
        </div>
        <div>
          <dt>Fill</dt>
          <dd>{rgbaToHex(node.fill)}</dd>
        </div>
        <div>
          <dt>Opacity</dt>
          <dd>{Math.round(node.opacity * 100)}%</dd>
        </div>
        {node.layout_mode !== "none" && (
          <>
            <div>
              <dt>Layout</dt>
              <dd>{node.layout_mode}</dd>
            </div>
            <div>
              <dt>Gap</dt>
              <dd>{node.layout_gap}px</dd>
            </div>
            <div>
              <dt>Padding</dt>
              <dd>{node.layout_padding.join("px ")}px</dd>
            </div>
          </>
        )}
        {node.text && (
          <>
            <div>
              <dt>Font</dt>
              <dd>{node.text.font_family}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>
                {node.text.font_weight} / {node.text.font_size}px
              </dd>
            </div>
          </>
        )}
      </dl>
      {(variableRows.length > 0 || textStyle) && (
        <section className="inspect-tokens">
          <h3>Resolved tokens</h3>
          {textStyle && (
            <div>
              <span>Typography</span>
              <strong>{textStyle.name}</strong>
            </div>
          )}
          {variableRows.map(({ property, variable }) => (
            <div key={property}>
              <span>{property}</span>
              <strong>
                {variable
                  ? `${variable.name} · ${variable.value}`
                  : "Missing token"}
              </strong>
            </div>
          ))}
        </section>
      )}
      <pre className="code-block">{css}</pre>
      <button
        className="secondary-button"
        onClick={() => {
          void navigator.clipboard.writeText(css).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy CSS"}
      </button>
    </>
  );
}

function nodeCss(node: NodeSummary) {
  const rules = [
    `position: absolute;`,
    `left: ${node.x}px;`,
    `top: ${node.y}px;`,
    `width: ${node.width}px;`,
    `height: ${node.height}px;`,
    `background: ${rgbaToHex(node.fill)};`,
    `opacity: ${node.opacity};`,
  ];
  if (node.corner_radii.some(Boolean))
    rules.push(
      `border-radius: ${node.corner_radii.map((value) => `${value}px`).join(" ")};`,
    );
  if (node.stroke_width > 0)
    rules.push(
      `border: ${node.stroke_width}px solid ${rgbaToHex(node.stroke)};`,
    );
  if (node.layout_mode !== "none") {
    rules.push("display: flex;");
    rules.push(
      `flex-direction: ${node.layout_mode === "row" ? "row" : "column"};`,
    );
    rules.push(`gap: ${node.layout_gap}px;`);
    rules.push(
      `padding: ${node.layout_padding.map((value) => `${value}px`).join(" ")};`,
    );
  }
  if (node.text) {
    rules.push(`font-family: ${JSON.stringify(node.text.font_family)};`);
    rules.push(`font-size: ${node.text.font_size}px;`);
    rules.push(`font-weight: ${node.text.font_weight};`);
    rules.push(`line-height: ${node.text.line_height}px;`);
    rules.push(`letter-spacing: ${node.text.letter_spacing}px;`);
  }
  return rules.join("\n");
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
