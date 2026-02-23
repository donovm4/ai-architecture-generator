import { useState, useEffect, useCallback } from 'react';

interface MappedShape {
  cellId: string;
  label: string;
  resourceType: string;
  confidence: 'exact' | 'fuzzy';
}

interface UnrecognizedShape {
  cellId: string;
  label: string;
  style: string;
  suggestedType?: string;
}

interface ImportMapping {
  mapped: MappedShape[];
  unrecognized: UnrecognizedShape[];
  totalShapes: number;
}

interface ResourceTypeOption {
  key: string;
  displayName: string;
  category: string;
}

interface ImportAnalysisProps {
  isOpen: boolean;
  mapping: ImportMapping;
  xml: string;
  architecture: any;
  onAccept: (result: any) => void;
  onClose: () => void;
  onError: (error: string) => void;
}

export function ImportAnalysis({
  isOpen,
  mapping,
  xml,
  architecture,
  onAccept,
  onClose,
  onError,
}: ImportAnalysisProps) {
  const [resourceTypes, setResourceTypes] = useState<ResourceTypeOption[]>([]);
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(false);

  // Fetch resource types for dropdown
  useEffect(() => {
    if (isOpen && resourceTypes.length === 0) {
      fetch('/api/import/resource-types')
        .then(r => r.json())
        .then(setResourceTypes)
        .catch(() => { /* ignore */ });
    }
  }, [isOpen, resourceTypes.length]);

  const handleManualMapping = useCallback((cellId: string, resourceType: string) => {
    setManualMappings(prev => {
      if (!resourceType) {
        const next = { ...prev };
        delete next[cellId];
        return next;
      }
      return { ...prev, [cellId]: resourceType };
    });
  }, []);

  const handleImportMapped = useCallback(() => {
    // Use the architecture as-is (only automatically mapped shapes)
    onAccept({ xml, architecture, mapping });
  }, [xml, architecture, mapping, onAccept]);

  const handleImportAll = useCallback(async () => {
    // Re-import with manual mappings applied
    const mappingsArray = Object.entries(manualMappings)
      .filter(([, type]) => type)
      .map(([cellId, resourceType]) => ({ cellId, resourceType }));

    if (mappingsArray.length === 0) {
      // No manual mappings — just use current result
      onAccept({ xml, architecture, mapping });
      return;
    }

    setResolving(true);
    try {
      const response = await fetch('/api/import/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml, mappings: mappingsArray }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to resolve mappings');
      }

      const result = await response.json();
      onAccept(result);
    } catch (err: any) {
      onError(err.message || 'Failed to resolve mappings');
    } finally {
      setResolving(false);
    }
  }, [xml, manualMappings, mapping, architecture, onAccept, onError]);

  if (!isOpen) return null;

  // Group resource types by category for the dropdown
  const groupedTypes = resourceTypes.reduce<Record<string, ResourceTypeOption[]>>((acc, rt) => {
    if (!acc[rt.category]) acc[rt.category] = [];
    acc[rt.category].push(rt);
    return acc;
  }, {});

  const hasUnrecognized = mapping.unrecognized.length > 0;
  const manualCount = Object.values(manualMappings).filter(Boolean).length;

  return (
    <div className="import-modal-overlay" onClick={onClose}>
      <div className="import-analysis-modal" onClick={e => e.stopPropagation()}>
        <div className="import-modal-header">
          <h2>Import Analysis</h2>
          <button className="import-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="import-analysis-body">
          {/* Summary */}
          <div className="import-summary">
            <div className="import-summary-stat">
              <span className="import-summary-number">{mapping.totalShapes}</span>
              <span className="import-summary-label">Total shapes</span>
            </div>
            <div className="import-summary-stat import-summary-mapped">
              <span className="import-summary-number">{mapping.mapped.length}</span>
              <span className="import-summary-label">Mapped</span>
            </div>
            {hasUnrecognized && (
              <div className="import-summary-stat import-summary-unrecognized">
                <span className="import-summary-number">{mapping.unrecognized.length}</span>
                <span className="import-summary-label">Unrecognized</span>
              </div>
            )}
          </div>

          {/* Mapped shapes */}
          {mapping.mapped.length > 0 && (
            <div className="import-section">
              <h3 className="import-section-title">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" fill="#107c10" />
                  <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Mapped Resources
              </h3>
              <div className="import-mapped-list">
                {mapping.mapped.map(shape => (
                  <div key={shape.cellId} className="import-mapped-item">
                    <span className="import-mapped-label">{shape.label || '(unnamed)'}</span>
                    <span className={`import-mapped-badge ${shape.confidence === 'exact' ? 'badge-exact' : 'badge-fuzzy'}`}>
                      {shape.resourceType}
                    </span>
                    {shape.confidence === 'fuzzy' && (
                      <span className="import-confidence-hint" title="Matched by label text">~</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unrecognized shapes */}
          {hasUnrecognized && (
            <div className="import-section">
              <h3 className="import-section-title">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="#d83b01" strokeWidth="1.5" />
                  <path d="M8 5v3" stroke="#d83b01" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="0.75" fill="#d83b01" />
                </svg>
                Unrecognized Shapes
                <span className="import-section-hint">Select a resource type or skip</span>
              </h3>
              <div className="import-unrecognized-list">
                {mapping.unrecognized.map(shape => (
                  <div key={shape.cellId} className="import-unrecognized-item">
                    <div className="import-unrecognized-info">
                      <span className="import-unrecognized-label">{shape.label}</span>
                    </div>
                    <select
                      className="import-type-select"
                      value={manualMappings[shape.cellId] || ''}
                      onChange={e => handleManualMapping(shape.cellId, e.target.value)}
                    >
                      <option value="">— Skip —</option>
                      {Object.entries(groupedTypes).map(([category, types]) => (
                        <optgroup key={category} label={category}>
                          {types.map(rt => (
                            <option key={rt.key} value={rt.key}>
                              {rt.displayName}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="import-analysis-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <div className="import-analysis-actions-right">
            <button
              className="btn btn-primary"
              onClick={handleImportMapped}
              disabled={mapping.mapped.length === 0}
            >
              Import Mapped ({mapping.mapped.length})
            </button>
            {hasUnrecognized && manualCount > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleImportAll}
                disabled={resolving}
              >
                {resolving ? (
                  <>
                    <span className="spinner" />
                    Resolving...
                  </>
                ) : (
                  `Import All (+${manualCount})`
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
