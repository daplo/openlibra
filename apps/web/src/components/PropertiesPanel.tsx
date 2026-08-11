import { useEffect, useRef, useState } from "react";
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Columns3,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  Rows3,
} from "lucide-react";
import { hexToRgb, rgbaToHex } from "../editor/model-utils";
import type { NodeSummary, ShadowSummary } from "../editor/types";

export function Properties(props: {
  selected: NodeSummary[];
  documentColors: string[];
  onAddDocumentColor: (color: string) => void;
  onAlign: (alignment: string) => void;
  onDelete: () => void;
  onGroup: () => void;
  onStyleChange: (
    node: NodeSummary,
    change: Partial<{
      fill: string;
      stroke: string;
      strokeWidth: number;
      cornerRadius: number;
    }>,
  ) => void;
  onBoundsChange: (
    node: NodeSummary,
    change: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  onOpacityChange: (node: NodeSummary, opacity: number) => void;
  onShadowsChange: (node: NodeSummary, shadows: ShadowSummary[]) => void;
  onTransformChange: (
    node: NodeSummary,
    change: Partial<Pick<NodeSummary, "rotation" | "flip_x" | "flip_y">>,
  ) => void;
  onLayoutChange: (
    node: NodeSummary,
    change: Partial<
      Pick<
        NodeSummary,
        | "layout_mode"
        | "layout_align"
        | "layout_justify"
        | "layout_gap"
        | "layout_padding"
        | "auto_height"
      >
    >,
  ) => void;
  onWidthSizingChange: (
    node: NodeSummary,
    sizing: NodeSummary["width_sizing"],
  ) => void;
  onArtboardGuideChange: (
    node: NodeSummary,
    change: Partial<
      Pick<
        NodeSummary,
        | "guide_mode"
        | "guide_count"
        | "guide_gap"
        | "guide_color"
        | "guide_opacity"
      >
    >,
  ) => void;
}) {
  const { selected } = props;
  if (selected.length === 0)
    return (
      <>
        <h2>Properties</h2>
        <EmptyState text="Select a layer to inspect it." />
      </>
    );
  const node = selected[0];
  return (
    <>
      <h2>Properties</h2>
      <div className="property-groups">
        <PropertySection title="Layer">
          <Property
            label="Name"
            value={
              selected.length === 1 ? node.name : `${selected.length} layers`
            }
          />
          {selected.length === 1 && <Property label="Type" value={node.kind} />}
          {selected.length > 1 && (
            <button className="primary-button" onClick={props.onGroup}>
              Group selection
            </button>
          )}
        </PropertySection>
        {selected.length > 1 && (
          <PropertySection title="Alignment">
            <AlignmentControls onAlign={props.onAlign} />
          </PropertySection>
        )}
        {selected.length === 1 && (
          <>
            <PropertySection title="Layout">
              <GeometryControls
                node={node}
                onChange={(change) => props.onBoundsChange(node, change)}
                onTransformChange={(change) =>
                  props.onTransformChange(node, change)
                }
              />
              {node.parent_id && (
                <WidthSizingControl
                  node={node}
                  onChange={(sizing) => props.onWidthSizingChange(node, sizing)}
                />
              )}
            </PropertySection>
            {(node.kind === "frame" || node.kind === "group") && (
              <PropertySection title="Auto layout">
                <AutoLayoutControls
                  node={node}
                  onChange={(change) => props.onLayoutChange(node, change)}
                />
              </PropertySection>
            )}
            {node.kind === "frame" && (
              <PropertySection title="Artboard grid">
                <ArtboardGuideControls
                  node={node}
                  documentColors={props.documentColors}
                  onAddDocumentColor={props.onAddDocumentColor}
                  onChange={(change) =>
                    props.onArtboardGuideChange(node, change)
                  }
                />
              </PropertySection>
            )}
            {node.kind !== "group" && (
              <StyleControls
                node={node}
                documentColors={props.documentColors}
                onAddDocumentColor={props.onAddDocumentColor}
                onChange={(change) => props.onStyleChange(node, change)}
                onOpacityChange={(opacity) =>
                  props.onOpacityChange(node, opacity)
                }
                onShadowsChange={(shadows) =>
                  props.onShadowsChange(node, shadows)
                }
              />
            )}
          </>
        )}
        <PropertySection title="Actions">
          <button className="danger-button" onClick={props.onDelete}>
            Delete {selected.length > 1 ? "layers" : "layer"}
          </button>
        </PropertySection>
        <EmptyState text="Drag on the canvas or use arrow keys to move. Hold Shift with arrows for 10 px." />
      </div>
    </>
  );
}

function AlignmentControls({
  onAlign,
}: {
  onAlign: (alignment: string) => void;
}) {
  const actions = [
    ["left", <AlignHorizontalJustifyStart />],
    ["center-x", <AlignHorizontalJustifyCenter />],
    ["right", <AlignHorizontalJustifyEnd />],
    ["top", <AlignVerticalJustifyStart />],
    ["center-y", <AlignVerticalJustifyCenter />],
    ["bottom", <AlignVerticalJustifyEnd />],
  ] as const;
  return (
    <div className="alignment-controls">
      {actions.map(([id, icon]) => (
        <button key={id} onClick={() => onAlign(id)} title={`Align ${id}`}>
          {icon}
        </button>
      ))}
    </div>
  );
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div className="property">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function StyleControls({
  node,
  documentColors,
  onAddDocumentColor,
  onChange,
  onOpacityChange,
  onShadowsChange,
}: {
  node: NodeSummary;
  documentColors: string[];
  onAddDocumentColor: (color: string) => void;
  onChange: (
    change: Partial<{
      fill: string;
      stroke: string;
      strokeWidth: number;
      cornerRadius: number;
    }>,
  ) => void;
  onOpacityChange: (opacity: number) => void;
  onShadowsChange: (shadows: ShadowSummary[]) => void;
}) {
  return (
    <>
      <PropertySection title="Fill">
        <ColorControl
          label="Color"
          value={rgbaToHex(node.fill)}
          documentColors={documentColors}
          onAddDocumentColor={onAddDocumentColor}
          onChange={(fill) => onChange({ fill })}
        />
      </PropertySection>
      <PropertySection title="Border">
        <ColorControl
          label="Color"
          value={rgbaToHex(node.stroke)}
          documentColors={documentColors}
          onAddDocumentColor={onAddDocumentColor}
          onChange={(stroke) => onChange({ stroke })}
        />
        <NumberControl
          label="Width"
          value={node.stroke_width}
          max={20}
          onChange={(strokeWidth) => onChange({ strokeWidth })}
        />
      </PropertySection>
      <PropertySection title="Corners">
        <NumberControl
          label="Radius"
          value={node.corner_radius}
          max={Math.floor(Math.min(node.width, node.height) / 2)}
          onChange={(cornerRadius) => onChange({ cornerRadius })}
        />
      </PropertySection>
      <PropertySection title="Shadows">
        <ShadowControls
          shadows={node.shadows}
          documentColors={documentColors}
          onAddDocumentColor={onAddDocumentColor}
          onChange={onShadowsChange}
        />
      </PropertySection>
      <PropertySection title="Opacity">
        <NumberControl
          label="Opacity"
          value={Math.round(node.opacity * 100)}
          max={100}
          onChange={(opacity) => onOpacityChange(opacity / 100)}
        />
      </PropertySection>
    </>
  );
}

function ShadowControls({
  shadows,
  documentColors,
  onAddDocumentColor,
  onChange,
}: {
  shadows: ShadowSummary[];
  documentColors: string[];
  onAddDocumentColor: (color: string) => void;
  onChange: (shadows: ShadowSummary[]) => void;
}) {
  const update = (index: number, change: Partial<ShadowSummary>) =>
    onChange(
      shadows.map((shadow, position) =>
        position === index ? { ...shadow, ...change } : shadow,
      ),
    );
  const add = () =>
    onChange([
      ...shadows,
      {
        kind: "outer",
        color: [0, 0, 0, 0.25],
        offset_x: 0,
        offset_y: 8,
        blur: 16,
        spread: 0,
        enabled: true,
      },
    ]);
  return (
    <div className="shadow-list">
      {shadows.map((shadow, index) => (
        <div className="shadow-effect" key={index}>
          <div className="shadow-effect-header">
            <button
              className={`effect-toggle ${shadow.enabled ? "active" : ""}`}
              onClick={() => update(index, { enabled: !shadow.enabled })}
              title={shadow.enabled ? "Hide shadow" : "Show shadow"}
            >
              {shadow.enabled ? "●" : "○"}
            </button>
            <select
              value={shadow.kind}
              onChange={(event) =>
                update(index, {
                  kind: event.target.value as ShadowSummary["kind"],
                })
              }
            >
              <option value="outer">Drop shadow</option>
              <option value="inner">Inner shadow</option>
            </select>
            <button
              onClick={() =>
                onChange([
                  ...shadows.slice(0, index + 1),
                  { ...shadow, color: [...shadow.color] },
                  ...shadows.slice(index + 1),
                ])
              }
              title="Duplicate"
            >
              ＋
            </button>
            <button
              onClick={() =>
                onChange(shadows.filter((_, position) => position !== index))
              }
              title="Remove"
            >
              ×
            </button>
          </div>
          <ColorControl
            label="Color"
            value={rgbaToHex(shadow.color)}
            documentColors={documentColors}
            onAddDocumentColor={onAddDocumentColor}
            onChange={(color) =>
              update(index, { color: [...hexToRgb(color), shadow.color[3]] })
            }
          />
          <div className="geometry-grid shadow-grid">
            <GeometryInput
              label="X"
              value={shadow.offset_x}
              onChange={(offset_x) => update(index, { offset_x })}
            />
            <GeometryInput
              label="Y"
              value={shadow.offset_y}
              onChange={(offset_y) => update(index, { offset_y })}
            />
            <GeometryInput
              label="B"
              value={shadow.blur}
              min={0}
              onChange={(blur) => update(index, { blur })}
            />
            <GeometryInput
              label="S"
              value={shadow.spread}
              onChange={(spread) => update(index, { spread })}
            />
          </div>
          <NumberControl
            label="Opacity"
            value={Math.round(shadow.color[3] * 100)}
            max={100}
            onChange={(opacity) =>
              update(index, {
                color: [
                  shadow.color[0],
                  shadow.color[1],
                  shadow.color[2],
                  opacity / 100,
                ],
              })
            }
          />
        </div>
      ))}
      <button className="secondary-button add-shadow" onClick={add}>
        + Add shadow
      </button>
    </div>
  );
}

function PropertySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="property-section" open>
      <summary>
        <span>{title}</span>
        <span className="section-chevron">⌄</span>
      </summary>
      <div className="property-section-body">{children}</div>
    </details>
  );
}

function GeometryControls({
  node,
  onChange,
  onTransformChange,
}: {
  node: NodeSummary;
  onChange: (
    change: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  onTransformChange: (
    change: Partial<Pick<NodeSummary, "rotation" | "flip_x" | "flip_y">>,
  ) => void;
}) {
  return (
    <>
      <div className="geometry-grid">
        <GeometryInput
          label="X"
          value={node.x}
          onChange={(x) => onChange({ x })}
        />
        <GeometryInput
          label="Y"
          value={node.y}
          onChange={(y) => onChange({ y })}
        />
        <GeometryInput
          label="W"
          value={node.width}
          min={8}
          onChange={(width) => onChange({ width })}
        />
        <GeometryInput
          label="H"
          value={node.height}
          min={8}
          onChange={(height) => onChange({ height })}
        />
      </div>
      <div className="transform-controls">
        <label>
          <span>°</span>
          <input
            aria-label="Rotation degrees"
            type="number"
            value={Math.round(node.rotation * 100) / 100}
            onChange={(event) =>
              onTransformChange({ rotation: Number(event.target.value) })
            }
          />
        </label>
        <button
          title="Rotate 90° clockwise"
          onClick={() => onTransformChange({ rotation: node.rotation + 90 })}
        >
          <RotateCw />
        </button>
        <button
          title="Flip horizontally"
          aria-pressed={node.flip_x}
          onClick={() => onTransformChange({ flip_x: !node.flip_x })}
        >
          <FlipHorizontal2 />
        </button>
        <button
          title="Flip vertically"
          aria-pressed={node.flip_y}
          onClick={() => onTransformChange({ flip_y: !node.flip_y })}
        >
          <FlipVertical2 />
        </button>
      </div>
    </>
  );
}

function AutoLayoutControls({
  node,
  onChange,
}: {
  node: NodeSummary;
  onChange: (
    change: Partial<
      Pick<
        NodeSummary,
        | "layout_mode"
        | "layout_align"
        | "layout_justify"
        | "layout_gap"
        | "layout_padding"
        | "auto_height"
      >
    >,
  ) => void;
}) {
  const padding = node.layout_padding;
  const setPadding = (index: number, value: number) =>
    onChange({
      layout_padding:
        padding.every((current) => current === 0) && value !== 0
          ? [value, value, value, value]
          : padding.map((current, position) =>
              position === index ? value : current,
            ),
    });
  return (
    <div className="auto-layout-controls">
      <div
        className="layout-direction"
        role="group"
        aria-label="Layout direction"
      >
        <button
          className={node.layout_mode === "none" ? "active" : ""}
          onClick={() => onChange({ layout_mode: "none" })}
        >
          Off
        </button>
        <button
          className={node.layout_mode === "row" ? "active" : ""}
          onClick={() => onChange({ layout_mode: "row" })}
        >
          <Columns3 />
          Row
        </button>
        <button
          className={node.layout_mode === "column" ? "active" : ""}
          onClick={() => onChange({ layout_mode: "column" })}
        >
          <Rows3 />
          Column
        </button>
      </div>
      {node.layout_mode !== "none" && (
        <>
          <div className="child-sizing auto-height">
            <span>Height</span>
            <div>
              <button
                className={!node.auto_height ? "active" : ""}
                onClick={() => onChange({ auto_height: false })}
              >
                Fixed
              </button>
              <button
                className={node.auto_height ? "active" : ""}
                onClick={() => onChange({ auto_height: true })}
              >
                Auto
              </button>
            </div>
          </div>
          <span className="layout-subheading">Alignment</span>
          <AlignmentGrid node={node} onChange={onChange} />
          <LayoutNumberInput
            label="Gap"
            value={node.layout_gap}
            onChange={(layout_gap) => onChange({ layout_gap })}
          />
          <span className="layout-subheading">Padding</span>
          <div className="geometry-grid padding-grid">
            <GeometryInput
              label="T"
              value={padding[0]}
              min={0}
              onChange={(value) => setPadding(0, value)}
            />
            <GeometryInput
              label="R"
              value={padding[1]}
              min={0}
              onChange={(value) => setPadding(1, value)}
            />
            <GeometryInput
              label="B"
              value={padding[2]}
              min={0}
              onChange={(value) => setPadding(2, value)}
            />
            <GeometryInput
              label="L"
              value={padding[3]}
              min={0}
              onChange={(value) => setPadding(3, value)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function LayoutNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="layout-number-input">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={Math.round(value * 100) / 100}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.max(0, next));
        }}
      />
    </label>
  );
}

function WidthSizingControl({
  node,
  onChange,
}: {
  node: NodeSummary;
  onChange: (sizing: NodeSummary["width_sizing"]) => void;
}) {
  return (
    <div className="child-sizing">
      <span>Width</span>
      <div>
        <button
          className={node.width_sizing === "fixed" ? "active" : ""}
          onClick={() => onChange("fixed")}
        >
          Fixed
        </button>
        <button
          className={node.width_sizing === "fill" ? "active" : ""}
          onClick={() => onChange("fill")}
        >
          Fill
        </button>
      </div>
    </div>
  );
}

function ArtboardGuideControls({
  node,
  documentColors,
  onAddDocumentColor,
  onChange,
}: {
  node: NodeSummary;
  documentColors: string[];
  onAddDocumentColor: (color: string) => void;
  onChange: (
    change: Partial<
      Pick<
        NodeSummary,
        | "guide_mode"
        | "guide_count"
        | "guide_gap"
        | "guide_color"
        | "guide_opacity"
      >
    >,
  ) => void;
}) {
  return (
    <div className="guide-controls">
      <div className="layout-direction">
        <button
          className={node.guide_mode === "none" ? "active" : ""}
          onClick={() => onChange({ guide_mode: "none" })}
        >
          Off
        </button>
        <button
          className={node.guide_mode === "grid" ? "active" : ""}
          onClick={() => onChange({ guide_mode: "grid" })}
        >
          Grid
        </button>
        <button
          className={node.guide_mode === "columns" ? "active" : ""}
          onClick={() => onChange({ guide_mode: "columns" })}
        >
          Columns
        </button>
      </div>
      {node.guide_mode !== "none" && (
        <>
          {node.guide_mode === "columns" && (
            <LayoutNumberInput
              label="Columns"
              value={node.guide_count}
              onChange={(guide_count) =>
                onChange({ guide_count: Math.max(1, Math.round(guide_count)) })
              }
            />
          )}
          <LayoutNumberInput
            label={node.guide_mode === "grid" ? "Spacing" : "Gutter"}
            value={node.guide_gap}
            onChange={(guide_gap) =>
              onChange({ guide_gap: Math.max(1, guide_gap) })
            }
          />
          <ColorControl
            label="Color"
            value={rgbaToHex(node.guide_color)}
            documentColors={documentColors}
            onAddDocumentColor={onAddDocumentColor}
            onChange={(color) =>
              onChange({ guide_color: [...hexToRgb(color), 1] })
            }
          />
          <NumberControl
            label="Opacity"
            value={Math.round(node.guide_opacity * 100)}
            max={100}
            onChange={(opacity) => onChange({ guide_opacity: opacity / 100 })}
          />
        </>
      )}
    </div>
  );
}

function AlignmentGrid({
  node,
  onChange,
}: {
  node: NodeSummary;
  onChange: (
    change: Partial<Pick<NodeSummary, "layout_align" | "layout_justify">>,
  ) => void;
}) {
  const values = ["start", "center", "end"] as const;
  const horizontal =
    node.layout_mode === "row" ? node.layout_justify : node.layout_align;
  const vertical =
    node.layout_mode === "row" ? node.layout_align : node.layout_justify;
  return (
    <div className="alignment-grid" role="group" aria-label="Content alignment">
      {values.flatMap((y) =>
        values.map((x) => (
          <button
            key={`${x}-${y}`}
            className={horizontal === x && vertical === y ? "active" : ""}
            title={`${y} ${x}`}
            aria-label={`Align ${y} ${x}`}
            onClick={() =>
              onChange(
                node.layout_mode === "row"
                  ? { layout_justify: x, layout_align: y }
                  : { layout_align: x, layout_justify: y },
              )
            }
          >
            <span />
          </button>
        )),
      )}
    </div>
  );
}

function GeometryInput({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="geometry-input">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        step="1"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next))
            onChange(min === undefined ? next : Math.max(min, next));
        }}
      />
    </label>
  );
}

function ColorControl({
  label,
  value,
  documentColors,
  onAddDocumentColor,
  onChange,
}: {
  label: string;
  value: string;
  documentColors: string[];
  onAddDocumentColor: (color: string) => void;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("open-libra-recent-colors") ?? "[]",
      ) as string[];
    } catch {
      return [];
    }
  });
  const [vaultColors, setVaultColors] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("open-libra-vault-colors") ?? "[]",
      ) as string[];
    } catch {
      return [];
    }
  });
  const pickerRef = useRef<HTMLLabelElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        pickerRef.current?.contains(event.target)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [open]);

  function choose(color: string) {
    const normalized = color.toUpperCase();
    onChange(normalized);
    setDraft(normalized);
    setRecentColors((current) => {
      const next = [
        normalized,
        ...current.filter((item) => item !== normalized),
      ].slice(0, 8);
      localStorage.setItem("open-libra-recent-colors", JSON.stringify(next));
      return next;
    });
    setOpen(false);
  }
  function addToVault() {
    setVaultColors((current) => {
      const normalized = value.toUpperCase();
      const next = [
        normalized,
        ...current.filter((item) => item !== normalized),
      ];
      localStorage.setItem("open-libra-vault-colors", JSON.stringify(next));
      return next;
    });
  }
  function commit() {
    const normalized = draft.startsWith("#") ? draft : `#${draft}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) choose(normalized);
    else setDraft(value);
  }
  return (
    <label className="color-control" ref={pickerRef}>
      <span>{label}</span>
      <button
        type="button"
        className="color-swatch-button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Choose ${label.toLowerCase()} color`}
        aria-expanded={open}
      >
        <span style={{ background: value }} />
      </button>
      <input
        className="hex-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      {open && (
        <div
          className="color-library"
          role="dialog"
          aria-label={`${label} color library`}
        >
          {recentColors.length > 0 && (
            <ColorPalette
              name="Recent"
              colors={recentColors}
              value={value}
              onChoose={choose}
            />
          )}
          <ColorPalette
            name="Document"
            colors={documentColors}
            value={value}
            onChoose={choose}
          />
          <ColorPalette
            name="Vault"
            colors={vaultColors}
            value={value}
            onChoose={choose}
          />
          <div className="library-actions">
            <button type="button" onClick={() => onAddDocumentColor(value)}>
              + Add to document
            </button>
            <button type="button" onClick={addToVault}>
              + Add to vault
            </button>
          </div>
          <div className="custom-color-row">
            <span>Custom color</span>
            <input
              type="color"
              value={value}
              onChange={(event) => choose(event.target.value)}
            />
          </div>
        </div>
      )}
    </label>
  );
}

function ColorPalette({
  name,
  colors,
  value,
  onChoose,
}: {
  name: string;
  colors: string[];
  value: string;
  onChoose: (color: string) => void;
}) {
  return (
    <section className="color-palette">
      <p>{name}</p>
      {colors.length > 0 ? (
        <div>
          {colors.map((color) => (
            <button
              type="button"
              key={color}
              className={
                color.toUpperCase() === value.toUpperCase() ? "selected" : ""
              }
              style={{ background: color }}
              onClick={() => onChoose(color)}
              aria-label={`${name} ${color}`}
              title={color}
            />
          ))}
        </div>
      ) : (
        <span className="empty-palette">No saved colors</span>
      )}
    </section>
  );
}

function NumberControl({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  function clamp(next: number) {
    return Math.min(max, Math.max(0, next));
  }

  function commit(next = draft) {
    const normalized = clamp(next);
    setDraft(normalized);
    if (normalized !== value) onChange(normalized);
  }

  return (
    <label className="number-control">
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max={max}
        step="1"
        value={draft}
        onChange={(event) => setDraft(clamp(Number(event.target.value)))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onPointerCancel={() => setDraft(value)}
        onKeyUp={(event) => {
          if (event.key.startsWith("Arrow"))
            commit(Number(event.currentTarget.value));
        }}
      />
      <input
        type="number"
        min="0"
        max={max}
        value={Math.round(draft)}
        onChange={(event) => setDraft(clamp(Number(event.target.value)))}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(Number(event.currentTarget.value));
          if (event.key === "Escape") setDraft(value);
        }}
      />
    </label>
  );
}
