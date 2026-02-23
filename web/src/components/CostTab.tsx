import type { CostLineItem, AssessmentFinding } from './AssessmentPanel';

interface CostTabProps {
  cost: {
    score: number;
    totalMonthly: number;
    currency: string;
    breakdown: CostLineItem[];
    recommendations: AssessmentFinding[];
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  compute: '🖥️ Compute',
  networking: '🌐 Networking',
  storage: '💾 Storage',
  databases: '🗄️ Databases',
  security: '🔐 Security',
  monitoring: '📈 Monitoring',
  other: '📦 Other',
};

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

export function CostTab({ cost }: CostTabProps) {
  // Group breakdown by category
  const byCategory = cost.breakdown.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, CostLineItem[]>);

  const categoryTotals = Object.entries(byCategory).map(([cat, items]) => ({
    category: cat,
    total: items.reduce((s, i) => s + i.monthlyEstimate, 0),
    items,
  })).sort((a, b) => b.total - a.total);

  return (
    <div className="cost-tab">
      <div className="cost-summary">
        <div className="cost-total">
          <span className="cost-total-label">Estimated Monthly Cost</span>
          <span className="cost-total-value">
            €{cost.totalMonthly.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className="cost-total-annual">
            ~€{(cost.totalMonthly * 12).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/yr
          </span>
        </div>
        <div className="cost-categories">
          {categoryTotals.map(ct => (
            <div key={ct.category} className="cost-category-bar">
              <span className="cost-category-label">{CATEGORY_LABELS[ct.category] || ct.category}</span>
              <span className="cost-category-amount">€{ct.total.toLocaleString('de-DE')}</span>
              <div className="cost-category-fill" style={{
                width: `${Math.max(4, (ct.total / cost.totalMonthly) * 100)}%`
              }} />
            </div>
          ))}
        </div>
      </div>

      <div className="cost-breakdown">
        <h4>Cost Breakdown</h4>
        <table className="cost-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Type</th>
              <th>SKU</th>
              <th className="cost-table-right">€/month</th>
            </tr>
          </thead>
          <tbody>
            {cost.breakdown.map((item, i) => (
              <tr key={i}>
                <td className="cost-table-name">{item.resourceName}</td>
                <td className="cost-table-type">{item.resourceType}</td>
                <td className="cost-table-sku">{item.sku}</td>
                <td className="cost-table-right cost-table-amount">
                  €{item.monthlyEstimate.toLocaleString('de-DE')}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}><strong>Total</strong></td>
              <td className="cost-table-right"><strong>€{cost.totalMonthly.toLocaleString('de-DE')}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {cost.recommendations.length > 0 && (
        <div className="cost-recommendations">
          <h4>Cost Optimization ({cost.recommendations.length})</h4>
          {cost.recommendations.map(r => (
            <FindingCard key={r.id} finding={r} />
          ))}
        </div>
      )}
    </div>
  );
}
