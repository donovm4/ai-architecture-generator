import { useState, useMemo } from 'react';

// ─── Types ───

export interface CostLineItem {
  resourceName: string;
  resourceType: string;
  service: string;
  sku: string;
  region: string;
  monthlyEstimate: number;
  unit: string;
  pricePerUnit: number;
  assumptions: string;
  category: string;
}

export interface SlaPathEntry {
  resourceName: string;
  resourceType: string;
  sla: number;
  note: string;
}

export interface SlaPath {
  name: string;
  description: string;
  path: SlaPathEntry[];
  compositeSla: number;
}

export interface CostSlaResult {
  lineItems: CostLineItem[];
  totalMonthly: number;
  currency: string;
  region: string;
  slaPaths: SlaPath[];
  recommendations: Array<{
    id: string;
    severity: string;
    pillar: string;
    title: string;
    description: string;
    impact: string;
    remediation: string;
  }>;
  generatedAt: string;
}

interface CostSlaPanelProps {
  result: CostSlaResult;
  onClose: () => void;
}

// ─── Constants ───

const CATEGORY_ICONS: Record<string, string> = {
  compute: '🖥️',
  networking: '🌐',
  storage: '📦',
  databases: '🗄️',
  security: '🔒',
  integration: '🔌',
  monitoring: '📊',
  other: '📋',
};

const CATEGORY_COLORS: Record<string, string> = {
  compute: '#3b82f6',
  networking: '#8b5cf6',
  storage: '#f59e0b',
  databases: '#10b981',
  security: '#ef4444',
  integration: '#ec4899',
  monitoring: '#6366f1',
  other: '#6b7280',
};

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getSlaColor(sla: number): string {
  if (sla >= 99.99) return '#10b981';
  if (sla >= 99.95) return '#22c55e';
  if (sla >= 99.9) return '#f59e0b';
  if (sla >= 99.5) return '#f97316';
  return '#ef4444';
}

// ─── Sub-components ───

function CostBreakdownBar({ items }: { items: CostLineItem[] }) {
  const total = items.reduce((s, i) => s + i.monthlyEstimate, 0);
  if (total === 0) return null;

  // Group by category
  const byCategory = new Map<string, number>();
  for (const item of items) {
    const cat = item.category || 'other';
    byCategory.set(cat, (byCategory.get(cat) || 0) + item.monthlyEstimate);
  }

  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="cost-breakdown">
      <div className="cost-breakdown-bar">
        {sorted.map(([cat, amount]) => (
          <div
            key={cat}
            className="cost-breakdown-seg"
            style={{
              width: `${(amount / total) * 100}%`,
              backgroundColor: CATEGORY_COLORS[cat] || '#6b7280',
            }}
            title={`${cat}: ${formatCurrency(amount)}`}
          />
        ))}
      </div>
      <div className="cost-breakdown-legend">
        {sorted.map(([cat, amount]) => (
          <span key={cat} className="cost-legend-item">
            <span className="cost-legend-dot" style={{ backgroundColor: CATEGORY_COLORS[cat] || '#6b7280' }} />
            {CATEGORY_ICONS[cat] || '📋'} {cat} {formatCurrency(amount)}
          </span>
        ))}
      </div>
    </div>
  );
}

function CostTable({ items }: { items: CostLineItem[] }) {
  return (
    <div className="cost-table-wrap">
      <table className="cost-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>SKU / Tier</th>
            <th>Assumptions</th>
            <th className="cost-table-right">Monthly</th>
          </tr>
        </thead>
        <tbody>
          {items
            .sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
            .map((item, i) => (
              <tr key={i}>
                <td>
                  <span className="cost-resource-name">
                    {CATEGORY_ICONS[item.category] || '📋'} {item.resourceName}
                  </span>
                  <span className="cost-resource-service">{item.service}</span>
                </td>
                <td className="cost-sku">{item.sku}</td>
                <td className="cost-assumptions">{item.assumptions}</td>
                <td className="cost-table-right cost-amount">{formatCurrency(item.monthlyEstimate)}</td>
              </tr>
            ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}><strong>Total Monthly Estimate</strong></td>
            <td className="cost-table-right cost-total">{formatCurrency(items.reduce((s, i) => s + i.monthlyEstimate, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SlaPathCard({ path }: { path: SlaPath }) {
  const [expanded, setExpanded] = useState(true);
  const slaColor = getSlaColor(path.compositeSla);

  return (
    <div className="sla-path-card">
      <button className="sla-path-header" onClick={() => setExpanded(!expanded)}>
        <div className="sla-path-info">
          <span className="sla-path-name">{path.name}</span>
          <span className="sla-path-desc">{path.description}</span>
        </div>
        <span className="sla-composite" style={{ color: slaColor }}>
          {path.compositeSla.toFixed(2)}%
        </span>
        <span className={`assess-chevron ${expanded ? 'assess-chevron-open' : ''}`}>▾</span>
      </button>
      {expanded && (
        <div className="sla-path-body">
          <div className="sla-chain">
            {path.path.map((entry, i) => (
              <div key={i} className="sla-chain-entry">
                {i > 0 && <span className="sla-chain-arrow">→</span>}
                <div className="sla-chain-node">
                  <span className="sla-chain-name">{entry.resourceName}</span>
                  <span className="sla-chain-sla" style={{ color: getSlaColor(entry.sla) }}>
                    {entry.sla}%
                  </span>
                  <span className="sla-chain-note">{entry.note}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="sla-calculation">
            {path.path.map(e => `${e.sla}%`).join(' × ')} = <strong style={{ color: slaColor }}>{path.compositeSla.toFixed(2)}%</strong>
            <span className="sla-downtime">
              ≈ {((1 - path.compositeSla / 100) * 730 * 60).toFixed(0)} min downtime/month
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───

type TabId = 'cost' | 'sla' | 'recommendations';

export function CostSlaPanel({ result, onClose }: CostSlaPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('cost');

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'cost', label: '💰 Cost Breakdown' },
    { id: 'sla', label: '🛡️ SLA Analysis', count: result.slaPaths.length },
    { id: 'recommendations', label: '💡 Savings', count: result.recommendations.length },
  ];

  return (
    <div className="assessment-panel cost-sla-panel">
      <div className="assessment-panel-header">
        <div className="assessment-panel-title">
          <span className="assessment-panel-icon">💰</span>
          <span>Cost & SLA Estimate</span>
          <span className="cost-total-badge">{formatCurrency(result.totalMonthly)}/mo</span>
          {result.slaPaths.length > 0 && (
            <span className="sla-badge" style={{ color: getSlaColor(result.slaPaths[0].compositeSla) }}>
              {result.slaPaths[0].compositeSla.toFixed(2)}% SLA
            </span>
          )}
        </div>
        <span className="cost-region-badge">📍 {result.region}</span>
        <button className="assessment-panel-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="assessment-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`assessment-tab ${activeTab === tab.id ? 'assessment-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="assessment-tab-badge">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="assessment-tab-content">
        {activeTab === 'cost' && (
          <div className="cost-tab">
            <CostBreakdownBar items={result.lineItems} />
            <CostTable items={result.lineItems} />
          </div>
        )}

        {activeTab === 'sla' && (
          <div className="sla-tab">
            {result.slaPaths.length === 0 ? (
              <div className="assess-empty-nice">
                <span>🛡️</span>
                <p>No SLA paths identified.</p>
              </div>
            ) : (
              <>
                <p className="assess-intro">
                  Composite SLA calculated per user flow path through the architecture.
                </p>
                {result.slaPaths.map((sp, i) => (
                  <SlaPathCard key={i} path={sp} />
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div className="cost-rec-tab">
            {result.recommendations.length === 0 ? (
              <div className="assess-empty-nice">
                <span>💡</span>
                <p>No cost optimization recommendations.</p>
              </div>
            ) : (
              result.recommendations.map((rec, i) => (
                <div key={i} className="cost-rec-card">
                  <div className="cost-rec-title">{rec.title}</div>
                  <p className="cost-rec-desc">{rec.description}</p>
                  {rec.impact && <p className="cost-rec-impact">💰 {rec.impact}</p>}
                  {rec.remediation && <p className="cost-rec-fix">→ {rec.remediation}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
