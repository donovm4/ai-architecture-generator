import type { AssessmentFinding } from './AssessmentPanel';

interface SecurityTabProps {
  security: {
    score: number;
    findings: AssessmentFinding[];
  };
}

function FindingCard({ finding }: { finding: AssessmentFinding }) {
  const severityIcon = finding.severity === 'critical' ? '🔴'
    : finding.severity === 'warning' ? '🟡' : '🔵';

  return (
    <div className={`finding-card finding-${finding.severity}`}>
      <div className="finding-header">
        <span className="finding-severity">{severityIcon}</span>
        <span className="finding-title">{finding.title}</span>
      </div>
      <p className="finding-description">{finding.description}</p>
      <div className="finding-details">
        <div className="finding-detail">
          <strong>Impact:</strong> {finding.impact}
        </div>
        <div className="finding-detail">
          <strong>Fix:</strong> {finding.remediation}
        </div>
      </div>
    </div>
  );
}

export function SecurityTab({ security }: SecurityTabProps) {
  const criticals = security.findings.filter(f => f.severity === 'critical');
  const warnings = security.findings.filter(f => f.severity === 'warning');
  const infos = security.findings.filter(f => f.severity === 'info');

  return (
    <div className="security-tab">
      <div className="findings-summary">
        <div className="findings-summary-item findings-critical">
          <span className="findings-count">{criticals.length}</span>
          <span className="findings-label">🔴 Critical</span>
        </div>
        <div className="findings-summary-item findings-warning">
          <span className="findings-count">{warnings.length}</span>
          <span className="findings-label">🟡 Warning</span>
        </div>
        <div className="findings-summary-item findings-info">
          <span className="findings-count">{infos.length}</span>
          <span className="findings-label">🔵 Info</span>
        </div>
      </div>

      {security.findings.length === 0 ? (
        <div className="findings-empty">
          <span>✅</span>
          <p>No security findings. Your architecture looks secure!</p>
        </div>
      ) : (
        <div className="findings-list">
          {criticals.length > 0 && (
            <div className="findings-group">
              <h4>🔴 Critical ({criticals.length})</h4>
              {criticals.map(f => <FindingCard key={f.id} finding={f} />)}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="findings-group">
              <h4>🟡 Warnings ({warnings.length})</h4>
              {warnings.map(f => <FindingCard key={f.id} finding={f} />)}
            </div>
          )}
          {infos.length > 0 && (
            <div className="findings-group">
              <h4>🔵 Informational ({infos.length})</h4>
              {infos.map(f => <FindingCard key={f.id} finding={f} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
