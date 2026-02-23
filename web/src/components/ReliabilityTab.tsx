import type { AssessmentFinding, SlaChainEntry } from './AssessmentPanel';

interface ReliabilityTabProps {
  reliability: {
    score: number;
    compositeSla: number;
    slaChain: SlaChainEntry[];
    findings: AssessmentFinding[];
    singlePointsOfFailure: string[];
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

function SlaBar({ percentage }: { percentage: number }) {
  const color = percentage >= 99.99 ? '#107c10'
    : percentage >= 99.95 ? '#4caf50'
    : percentage >= 99.9 ? '#ff9800'
    : '#f44336';

  return (
    <div className="sla-bar">
      <div className="sla-bar-fill" style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }} />
    </div>
  );
}

export function ReliabilityTab({ reliability }: ReliabilityTabProps) {
  const criticals = reliability.findings.filter(f => f.severity === 'critical');
  const warnings = reliability.findings.filter(f => f.severity === 'warning');
  const infos = reliability.findings.filter(f => f.severity === 'info');

  // Calculate downtime from SLA
  const downtimeMinutesPerMonth = ((100 - reliability.compositeSla) / 100) * 43800; // avg minutes/month
  const downtimeDisplay = downtimeMinutesPerMonth < 60
    ? `${downtimeMinutesPerMonth.toFixed(1)} min/month`
    : `${(downtimeMinutesPerMonth / 60).toFixed(1)} hrs/month`;

  return (
    <div className="reliability-tab">
      <div className="sla-summary">
        <div className="sla-composite">
          <span className="sla-composite-label">Estimated Composite SLA</span>
          <span className="sla-composite-value">{reliability.compositeSla.toFixed(4)}%</span>
          <SlaBar percentage={reliability.compositeSla} />
          <span className="sla-downtime">≈ {downtimeDisplay} estimated downtime</span>
        </div>
      </div>

      {reliability.singlePointsOfFailure.length > 0 && (
        <div className="spof-section">
          <h4>⚠️ Single Points of Failure</h4>
          <div className="spof-list">
            {reliability.singlePointsOfFailure.map((name, i) => (
              <span key={i} className="spof-item">{name}</span>
            ))}
          </div>
        </div>
      )}

      {reliability.slaChain.length > 0 && (
        <div className="sla-chain-section">
          <h4>SLA Chain ({reliability.slaChain.length} services)</h4>
          <table className="sla-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>SKU</th>
                <th className="sla-table-right">SLA %</th>
                <th>Redundant</th>
              </tr>
            </thead>
            <tbody>
              {reliability.slaChain.map((entry, i) => (
                <tr key={i} className={entry.isRedundant ? '' : 'sla-row-single'}>
                  <td>{entry.resourceName}</td>
                  <td className="sla-table-sku">{entry.sku || '—'}</td>
                  <td className="sla-table-right">{entry.serviceSla}%</td>
                  <td>{entry.isRedundant ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reliability.findings.length > 0 && (
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
