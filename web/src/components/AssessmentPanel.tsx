import { useState, useMemo } from 'react';

interface AssessmentPanelProps {
  assessment: AssessmentResult;
  onClose: () => void;
}

// ─── Types matching backend ───

export interface ChecklistItem {
  guid: string;
  id: string;
  category: string;
  subcategory: string;
  text: string;
  waf: string;
  severity: 'High' | 'Medium' | 'Low';
  service?: string;
  link?: string;
}

export interface AssessmentFinding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  pillar: string;
  title: string;
  description: string;
  impact: string;
  remediation: string;
}

export interface ServiceChecklist {
  resourceType: string;
  resourceName: string;
  service: string;
  checklistFile: string;
  items: ChecklistItem[];
}

export interface AssessmentResult {
  serviceChecklists: ServiceChecklist[];
  crossCuttingItems: ChecklistItem[];
  topologyFindings: AssessmentFinding[];
  aiFindings: AssessmentFinding[];
  summary: {
    totalItems: number;
    byPillar: Record<string, number>;
    bySeverity: Record<string, number>;
    servicesAssessed: string[];
  };
}

// ─── Constants ───

const PILLAR_ICONS: Record<string, string> = {
  Security: '🔒',
  Reliability: '🛡️',
  Performance: '⚡',
  Cost: '💰',
  Operations: '⚙️',
  Governance: '📋',
};

const SERVICE_ICONS: Record<string, string> = {
  aks: '☸️',
  'Azure Kubernetes Service': '☸️',
  Storage: '📦',
  'Key Vault': '🔑',
  'App Service': '🌐',
  'Azure Functions': '⚡',
  'Container Apps': '📦',
  'Container Registry': '🐳',
  'Cosmos DB': '🌍',
  'SQL Database': '🗄️',
  Redis: '⚡',
  'Service Bus': '📨',
  'Event Hubs': '📡',
  'API Management': '🔌',
};

const SEVERITY_ORDER = { High: 0, Medium: 1, Low: 2 };

// ─── Sub-components ───

function SeverityDot({ severity }: { severity: string }) {
  const cls = severity === 'High' || severity === 'critical' ? 'assess-dot-high'
    : severity === 'Medium' || severity === 'warning' ? 'assess-dot-med'
    : 'assess-dot-low';
  return <span className={`assess-dot ${cls}`} title={severity} />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === 'High' || severity === 'critical' ? 'assess-sev-high'
    : severity === 'Medium' || severity === 'warning' ? 'assess-sev-med'
    : 'assess-sev-low';
  return <span className={`assess-sev ${cls}`}>{severity}</span>;
}

function PillarTag({ pillar }: { pillar: string }) {
  return (
    <span className="assess-pillar-tag">
      {PILLAR_ICONS[pillar] || '📋'} {pillar}
    </span>
  );
}

function SeverityBar({ items }: { items: ChecklistItem[] }) {
  const high = items.filter(i => i.severity === 'High').length;
  const med = items.filter(i => i.severity === 'Medium').length;
  const low = items.filter(i => i.severity === 'Low').length;
  const total = items.length;
  if (total === 0) return null;

  return (
    <div className="assess-sev-bar" title={`${high} High · ${med} Medium · ${low} Low`}>
      {high > 0 && <div className="assess-sev-bar-seg assess-sev-bar-high" style={{ width: `${(high / total) * 100}%` }} />}
      {med > 0 && <div className="assess-sev-bar-seg assess-sev-bar-med" style={{ width: `${(med / total) * 100}%` }} />}
      {low > 0 && <div className="assess-sev-bar-seg assess-sev-bar-low" style={{ width: `${(low / total) * 100}%` }} />}
    </div>
  );
}

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="assess-item">
      <div className="assess-item-row">
        <SeverityDot severity={item.severity} />
        <span className="assess-item-text">{item.text}</span>
      </div>
      <div className="assess-item-meta">
        <PillarTag pillar={item.waf} />
        {item.category && <span className="assess-item-cat">{item.category}</span>}
        {item.link && (
          <a className="assess-item-link" href={item.link} target="_blank" rel="noreferrer">
            Docs ↗
          </a>
        )}
      </div>
    </div>
  );
}

function TopologyFindingCard({ finding }: { finding: AssessmentFinding }) {
  const [expanded, setExpanded] = useState(false);
  const icon = finding.severity === 'critical' ? '🔴' : finding.severity === 'warning' ? '🟡' : '🔵';

  return (
    <div className={`assess-finding assess-finding-${finding.severity}`} onClick={() => setExpanded(!expanded)}>
      <div className="assess-finding-header">
        <span className="assess-finding-icon">{icon}</span>
        <div className="assess-finding-info">
          <span className="assess-finding-title">{finding.title}</span>
          <div className="assess-finding-tags">
            <SeverityBadge severity={finding.severity} />
            <PillarTag pillar={finding.pillar} />
          </div>
        </div>
        <span className={`assess-chevron ${expanded ? 'assess-chevron-open' : ''}`}>▾</span>
      </div>
      {expanded && (
        <div className="assess-finding-body">
          <p className="assess-finding-desc">{finding.description}</p>
          <div className="assess-finding-detail">
            <div className="assess-finding-impact">
              <span className="assess-finding-label">⚠️ Impact</span>
              <p>{finding.impact}</p>
            </div>
            <div className="assess-finding-fix">
              <span className="assess-finding-label">✅ Remediation</span>
              <p>{finding.remediation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceSection({ checklist, defaultOpen }: { checklist: ServiceChecklist; defaultOpen: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);

  const pillars = useMemo(() => [...new Set(checklist.items.map(i => i.waf))].sort(), [checklist.items]);

  const filtered = useMemo(() => {
    let items = checklist.items;
    if (severityFilter) items = items.filter(i => i.severity === severityFilter);
    if (pillarFilter) items = items.filter(i => i.waf === pillarFilter);
    return items;
  }, [checklist.items, severityFilter, pillarFilter]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const item of filtered) {
      const key = item.category || 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [filtered]);

  const highCount = checklist.items.filter(i => i.severity === 'High').length;
  const medCount = checklist.items.filter(i => i.severity === 'Medium').length;
  const lowCount = checklist.items.filter(i => i.severity === 'Low').length;
  const icon = SERVICE_ICONS[checklist.service] || SERVICE_ICONS[checklist.resourceType] || '📋';

  return (
    <div className={`assess-svc ${expanded ? 'assess-svc-open' : ''}`}>
      <button className="assess-svc-header" onClick={() => setExpanded(!expanded)}>
        <span className="assess-svc-icon">{icon}</span>
        <span className="assess-svc-name">{checklist.service}</span>
        <SeverityBar items={checklist.items} />
        <span className="assess-svc-stats">
          {highCount > 0 && <span className="assess-stat-high">{highCount}</span>}
          {medCount > 0 && <span className="assess-stat-med">{medCount}</span>}
          {lowCount > 0 && <span className="assess-stat-low">{lowCount}</span>}
          <span className="assess-stat-total">{checklist.items.length}</span>
        </span>
        <span className={`assess-chevron ${expanded ? 'assess-chevron-open' : ''}`}>▾</span>
      </button>
      {expanded && (
        <div className="assess-svc-body">
          <div className="assess-filters">
            {/* Severity filter */}
            <div className="assess-filter-group">
              {(['High', 'Medium', 'Low'] as const).map(sev => {
                const count = checklist.items.filter(i => i.severity === sev).length;
                if (count === 0) return null;
                return (
                  <button
                    key={sev}
                    className={`assess-filter-chip assess-filter-${sev.toLowerCase()} ${severityFilter === sev ? 'active' : ''}`}
                    onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}
                  >
                    <SeverityDot severity={sev} /> {sev} ({count})
                  </button>
                );
              })}
            </div>
            {/* Pillar filter */}
            {pillars.length > 1 && (
              <div className="assess-filter-group">
                {pillars.map(p => (
                  <button
                    key={p}
                    className={`assess-filter-chip ${pillarFilter === p ? 'active' : ''}`}
                    onClick={() => setPillarFilter(pillarFilter === p ? null : p)}
                  >
                    {PILLAR_ICONS[p] || ''} {p} ({checklist.items.filter(i => i.waf === p).length})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="assess-svc-items">
            {filtered.length === 0 ? (
              <p className="assess-no-items">No items match the current filters.</p>
            ) : (
              [...grouped.entries()].map(([category, items]) => (
                <div key={category} className="assess-cat-group">
                  <div className="assess-cat-heading">{category}</div>
                  {items.map(item => (
                    <ChecklistItemRow key={item.guid} item={item} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Header ───

function SummaryHeader({ summary, pillarFilter, onPillarFilter }: {
  summary: AssessmentResult['summary'];
  pillarFilter: string | null;
  onPillarFilter: (pillar: string | null) => void;
}) {
  const pillars = Object.entries(summary.byPillar).sort((a, b) => b[1] - a[1]);
  const high = summary.bySeverity['High'] || 0;
  const med = summary.bySeverity['Medium'] || 0;
  const low = summary.bySeverity['Low'] || 0;

  return (
    <div className="assess-summary">
      <div className="assess-summary-row">
        <div className="assess-summary-total">
          <span className="assess-summary-num">{summary.totalItems}</span>
          <span className="assess-summary-label">Findings</span>
        </div>
        <div className="assess-summary-sevs">
          {high > 0 && <span className="assess-sev-pill assess-sev-pill-high">{high} High</span>}
          {med > 0 && <span className="assess-sev-pill assess-sev-pill-med">{med} Medium</span>}
          {low > 0 && <span className="assess-sev-pill assess-sev-pill-low">{low} Low</span>}
        </div>
      </div>
      <div className="assess-summary-pillars">
        {pillars.map(([pillar, count]) => (
          <button
            key={pillar}
            className={`assess-summary-pillar ${pillarFilter === pillar ? 'assess-summary-pillar-active' : ''}`}
            onClick={() => onPillarFilter(pillarFilter === pillar ? null : pillar)}
          >
            <span>{PILLAR_ICONS[pillar] || '📋'}</span>
            <span className="assess-summary-pillar-name">{pillar}</span>
            <span className="assess-summary-pillar-count">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Panel ───

type TabId = 'findings' | 'topology';

export function AssessmentPanel({ assessment, onClose }: AssessmentPanelProps) {
  const hasTopology = assessment.topologyFindings.length > 0;
  const hasAI = assessment.aiFindings.length > 0;
  const allFindings = [...assessment.aiFindings, ...assessment.topologyFindings];
  const [activeTab, setActiveTab] = useState<TabId>('findings');
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);

  const pillars = useMemo(() => {
    const set = new Set(allFindings.map(f => f.pillar));
    return [...set].sort();
  }, [allFindings]);

  const filteredFindings = useMemo(() => {
    const source = activeTab === 'topology' ? assessment.topologyFindings : assessment.aiFindings;
    if (!pillarFilter) return source;
    return source.filter(f => f.pillar === pillarFilter);
  }, [activeTab, pillarFilter, assessment]);

  // Sort: critical first, then warning, then info
  const sortedFindings = useMemo(() => {
    const order = { critical: 0, warning: 1, info: 2 };
    return [...filteredFindings].sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
  }, [filteredFindings]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'findings', label: '🎯 AI Findings', count: assessment.aiFindings.length },
    { id: 'topology', label: '🏗️ Topology', count: assessment.topologyFindings.length },
  ];

  return (
    <div className="assessment-panel">
      <div className="assessment-panel-header">
        <div className="assessment-panel-title">
          <span className="assessment-panel-icon">📊</span>
          <span>WAF Assessment</span>
        </div>
        <button className="assessment-panel-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="assessment-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`assessment-tab ${activeTab === tab.id ? 'assessment-tab-active' : ''}`}
            onClick={() => { setActiveTab(tab.id); setPillarFilter(null); }}
          >
            {tab.label}
            {tab.count > 0 && <span className="assessment-tab-badge">{tab.count}</span>}
          </button>
        ))}
      </div>

      <div className="assessment-tab-content">
        <SummaryHeader summary={assessment.summary} pillarFilter={pillarFilter} onPillarFilter={setPillarFilter} />

        {sortedFindings.length === 0 ? (
          <div className="assess-empty-nice">
            <span>{hasAI || hasTopology ? '🔍' : '✅'}</span>
            <p>{pillarFilter
              ? `No ${pillarFilter} findings.`
              : activeTab === 'findings'
                ? 'No AI findings. The architecture looks good!'
                : 'No topology issues detected.'
            }</p>
          </div>
        ) : (
          sortedFindings.map(f => (
            <TopologyFindingCard key={f.id} finding={f} />
          ))
        )}

        {assessment.summary.servicesAssessed.length > 0 && activeTab === 'findings' && (
          <div className="assess-assessed-services">
            <span className="assess-assessed-label">Assessed against checklists for:</span>
            {assessment.summary.servicesAssessed.map(s => (
              <span key={s} className="assess-assessed-chip">
                {SERVICE_ICONS[s] || '📋'} {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
