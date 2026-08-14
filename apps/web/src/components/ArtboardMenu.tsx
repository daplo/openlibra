import { ARTBOARD_PRESETS } from "../editor/constants";

export function ArtboardMenu({
  onChoose,
  onClose,
}: {
  onChoose: (preset: (typeof ARTBOARD_PRESETS)[number]) => void;
  onClose: () => void;
}) {
  const categories = [
    ...new Set(ARTBOARD_PRESETS.map((preset) => preset.category)),
  ];
  return (
    <div className="artboard-menu" role="dialog" aria-label="Artboard presets">
      <div className="artboard-menu-header">
        <strong>New artboard</strong>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {categories.map((category) => (
        <section key={category}>
          <p>{category}</p>
          {ARTBOARD_PRESETS.filter(
            (preset) => preset.category === category,
          ).map((preset) => (
            <button
              type="button"
              key={`${preset.name}-${preset.width}`}
              onClick={() => onChoose(preset)}
            >
              <span>{preset.name}</span>
              <small>
                {preset.width} × {preset.height}
              </small>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
