/**
 * ValidationToggle — Toggle switch for enabling/disabling Azure validation
 *
 * Placed in the sidebar below the diagram mode toggle.
 */

interface ValidationToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  diagramMode: 'azure' | 'generic';
}

export function ValidationToggle({ enabled, onToggle, diagramMode }: ValidationToggleProps) {
  // Only show for Azure mode
  if (diagramMode !== 'azure') return null;

  return (
    <div className="validation-toggle-panel">
      <div className="validation-toggle-row">
        <div className="validation-toggle-label">
          <span className="validation-toggle-icon">🔍</span>
          <span className="validation-toggle-text">Azure Validation</span>
        </div>
        <label className="toggle-switch" title="Validate architecture against Azure best practices after generation">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
      </div>
      <p className="validation-toggle-hint">
        {enabled
          ? 'After generation, the architecture will be validated against Azure subnet sizing, naming rules, network topology, and service best practices.'
          : 'Enable to check generated architectures against real Azure constraints.'}
      </p>
    </div>
  );
}
