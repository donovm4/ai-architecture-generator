/**
 * ValidationSummaryBar — Thin bar below diagram toolbar showing validation summary.
 * Click to expand/collapse the full ValidationPanel.
 */

import type { ValidationResult } from '../types';

interface ValidationSummaryBarProps {
  result: ValidationResult | null;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ValidationSummaryBar({ result, isExpanded, onToggle }: ValidationSummaryBarProps) {
  if (!result) return null;

  const { summary } = result;
  const total = summary.errors + summary.warnings + summary.info;
  const hasIssues = total > 0;

  return (
    <button
      className={`validation-summary-bar ${summary.errors > 0 ? 'has-errors' : summary.warnings > 0 ? 'has-warnings' : 'all-good'}`}
      onClick={onToggle}
      title={isExpanded ? 'Collapse validation panel' : 'Expand validation panel'}
    >
      <div className="validation-summary-bar-content">
        {!hasIssues ? (
          <span className="validation-summary-bar-text">✅ No issues found</span>
        ) : (
          <span className="validation-summary-bar-text">
            {summary.errors > 0 && (
              <span className="vsb-item vsb-error">❌ {summary.errors} error{summary.errors !== 1 ? 's' : ''}</span>
            )}
            {summary.warnings > 0 && (
              <span className="vsb-item vsb-warning">⚠️ {summary.warnings} warning{summary.warnings !== 1 ? 's' : ''}</span>
            )}
            {summary.info > 0 && (
              <span className="vsb-item vsb-info">ℹ️ {summary.info} info</span>
            )}
          </span>
        )}
        <span className={`validation-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </div>
    </button>
  );
}
