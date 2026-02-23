/**
 * ValidationPanel — Displays validation findings with severity, descriptions,
 * source links, multi-select, and batch auto-fix capability.
 */

import { useState, useCallback, useMemo } from 'react';
import type { ValidationResult, ValidationFinding } from '../types';

interface ValidationPanelProps {
  result: ValidationResult;
  onAutoFix: (prompt: string) => void;
  onHighlightResource: (resourceName: string) => void;
  onClose: () => void;
}

const SEVERITY_ICONS: Record<string, string> = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

const CATEGORY_LABELS: Record<string, string> = {
  subnet: 'Subnet',
  placement: 'Placement',
  naming: 'Naming',
  sizing: 'Sizing',
  config: 'Configuration',
  network: 'Network',
};

/** Build a single combined prompt from multiple findings' autoFixPrompts */
function buildBatchPrompt(findings: ValidationFinding[]): string {
  const fixable = findings.filter(f => f.autoFixPrompt);
  if (fixable.length === 0) return '';
  if (fixable.length === 1) return fixable[0].autoFixPrompt!;

  const lines = fixable.map((f, i) => `${i + 1}. ${f.autoFixPrompt}`);
  return `Apply ALL of the following fixes to the architecture:\n${lines.join('\n')}`;
}

function FindingCard({
  finding,
  isSelected,
  onToggleSelect,
  onAutoFix,
  onHighlightResource,
}: {
  finding: ValidationFinding;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onAutoFix: (prompt: string) => void;
  onHighlightResource: (name: string) => void;
}) {
  return (
    <div className={`finding-card finding-${finding.severity} ${isSelected ? 'finding-selected' : ''}`}>
      <div className="finding-header">
        {finding.autoFixPrompt && (
          <label className="finding-checkbox" title="Select for batch fix">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(finding.id)}
            />
          </label>
        )}
        <span className="finding-severity-icon">{SEVERITY_ICONS[finding.severity]}</span>
        <span className="finding-title">{finding.title}</span>
        <span className="finding-category-badge">{CATEGORY_LABELS[finding.category] || finding.category}</span>
      </div>

      <p className="finding-description">{finding.description}</p>

      <div className="finding-footer">
        <button
          className="finding-resource-link"
          onClick={() => onHighlightResource(finding.resourceName)}
          title={`Highlight ${finding.resourceName}`}
        >
          📍 {finding.resourceName}
        </button>

        <div className="finding-actions">
          {finding.sourceUrl && (
            <a
              href={finding.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="finding-learn-link"
              title="Open Microsoft Learn documentation"
            >
              📖 Learn
            </a>
          )}

          {finding.autoFixPrompt && (
            <button
              className="btn btn-sm finding-autofix-btn"
              onClick={() => onAutoFix(finding.autoFixPrompt!)}
              title="Auto-fix this single finding"
            >
              🔧 Fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ValidationPanel({
  result,
  onAutoFix,
  onHighlightResource,
  onClose,
}: ValidationPanelProps) {
  const { findings, summary, duration } = result;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Group by severity
  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');
  const infos = findings.filter(f => f.severity === 'info');

  // Fixable findings
  const fixableFindings = useMemo(() => findings.filter(f => f.autoFixPrompt), [findings]);
  const fixableErrors = useMemo(() => errors.filter(f => f.autoFixPrompt), [errors]);
  const fixableWarnings = useMemo(() => warnings.filter(f => f.autoFixPrompt), [warnings]);

  const selectedFindings = useMemo(
    () => findings.filter(f => selectedIds.has(f.id) && f.autoFixPrompt),
    [findings, selectedIds]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(fixableFindings.map(f => f.id)));
  }, [fixableFindings]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectAllErrors = useCallback(() => {
    setSelectedIds(new Set(fixableErrors.map(f => f.id)));
  }, [fixableErrors]);

  const selectAllWarnings = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const f of fixableWarnings) next.add(f.id);
      return next;
    });
  }, [fixableWarnings]);

  const handleBatchFix = useCallback((findingsToFix: ValidationFinding[]) => {
    const prompt = buildBatchPrompt(findingsToFix);
    if (prompt) {
      onAutoFix(prompt);
      setSelectedIds(new Set());
    }
  }, [onAutoFix]);

  return (
    <div className="validation-panel">
      <div className="validation-panel-header">
        <div className="validation-panel-title">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1.5L16.5 15H1.5L9 1.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
            <path d="M9 7V10.5M9 12.5V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <h3>Validation Results</h3>
          <span className="validation-duration">({duration}ms)</span>
        </div>
        <button className="validation-close-btn" onClick={onClose} title="Close validation panel">
          ✕
        </button>
      </div>

      {/* Summary bar */}
      <div className="validation-summary">
        <span className={`validation-summary-item ${summary.errors > 0 ? 'has-findings' : ''}`}>
          ❌ {summary.errors} error{summary.errors !== 1 ? 's' : ''}
        </span>
        <span className="validation-summary-sep">|</span>
        <span className={`validation-summary-item ${summary.warnings > 0 ? 'has-findings' : ''}`}>
          ⚠️ {summary.warnings} warning{summary.warnings !== 1 ? 's' : ''}
        </span>
        <span className="validation-summary-sep">|</span>
        <span className={`validation-summary-item ${summary.info > 0 ? 'has-findings' : ''}`}>
          ℹ️ {summary.info} info
        </span>
      </div>

      {/* Batch fix toolbar */}
      {fixableFindings.length > 0 && findings.length > 0 && (
        <div className="validation-batch-toolbar">
          <div className="batch-select-actions">
            <span className="batch-label">Select:</span>
            <button className="btn btn-xs batch-btn" onClick={selectAll} title="Select all fixable findings">
              All ({fixableFindings.length})
            </button>
            {fixableErrors.length > 0 && (
              <button className="btn btn-xs batch-btn batch-btn-error" onClick={selectAllErrors} title="Select all errors">
                Errors ({fixableErrors.length})
              </button>
            )}
            {fixableWarnings.length > 0 && (
              <button className="btn btn-xs batch-btn batch-btn-warning" onClick={selectAllWarnings} title="Select all warnings">
                Warnings ({fixableWarnings.length})
              </button>
            )}
            {selectedIds.size > 0 && (
              <button className="btn btn-xs batch-btn" onClick={selectNone} title="Clear selection">
                None
              </button>
            )}
          </div>
          <div className="batch-fix-actions">
            {selectedFindings.length > 0 && (
              <button
                className="btn btn-sm btn-primary batch-fix-btn"
                onClick={() => handleBatchFix(selectedFindings)}
                title={`Fix ${selectedFindings.length} selected finding(s) in one refinement pass`}
              >
                🔧 Fix Selected ({selectedFindings.length})
              </button>
            )}
            {fixableErrors.length > 0 && (
              <button
                className="btn btn-sm batch-fix-btn batch-fix-errors"
                onClick={() => handleBatchFix(fixableErrors)}
                title="Fix all errors in one refinement pass"
              >
                🔧 Fix All Errors
              </button>
            )}
            {fixableFindings.length > 0 && (
              <button
                className="btn btn-sm batch-fix-btn batch-fix-all"
                onClick={() => handleBatchFix(fixableFindings)}
                title="Fix all fixable findings in one refinement pass"
              >
                🔧 Fix All ({fixableFindings.length})
              </button>
            )}
          </div>
        </div>
      )}

      {findings.length === 0 ? (
        <div className="validation-empty">
          <span className="validation-empty-icon">✅</span>
          <p>Architecture looks good! No issues found.</p>
        </div>
      ) : (
        <div className="validation-findings">
          {errors.length > 0 && (
            <div className="finding-group">
              <h4 className="finding-group-title finding-group-error">
                Errors ({errors.length})
              </h4>
              {errors.map(f => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  isSelected={selectedIds.has(f.id)}
                  onToggleSelect={toggleSelect}
                  onAutoFix={onAutoFix}
                  onHighlightResource={onHighlightResource}
                />
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="finding-group">
              <h4 className="finding-group-title finding-group-warning">
                Warnings ({warnings.length})
              </h4>
              {warnings.map(f => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  isSelected={selectedIds.has(f.id)}
                  onToggleSelect={toggleSelect}
                  onAutoFix={onAutoFix}
                  onHighlightResource={onHighlightResource}
                />
              ))}
            </div>
          )}

          {infos.length > 0 && (
            <div className="finding-group">
              <h4 className="finding-group-title finding-group-info">
                Information ({infos.length})
              </h4>
              {infos.map(f => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  isSelected={selectedIds.has(f.id)}
                  onToggleSelect={toggleSelect}
                  onAutoFix={onAutoFix}
                  onHighlightResource={onHighlightResource}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
