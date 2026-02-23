import { useState } from 'react';
import { CostTab } from './CostTab';
import { SecurityTab } from './SecurityTab';
import { ReliabilityTab } from './ReliabilityTab';
import { PerformanceTab } from './PerformanceTab';

interface AssessmentPanelProps {
  assessment: AssessmentResult;
  onClose: () => void;
}

// Duplicated from backend types for frontend use
export interface AssessmentFinding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  pillar: 'cost' | 'security' | 'reliability' | 'performance';
  title: string;
  description: string;
  impact: string;
  remediation: string;
  autoFixPrompt?: string;
}

export interface CostLineItem {
  resourceName: string;
  resourceType: string;
  sku: string;
  region: string;
  monthlyEstimate: number;
  category: 'compute' | 'networking' | 'storage' | 'databases' | 'security' | 'monitoring' | 'other';
}

export interface SlaChainEntry {
  resourceName: string;
  serviceSla: number;
  sku: string;
  isRedundant: boolean;
}

export interface AssessmentResult {
  pillars: {
    cost: {
      score: number;
      totalMonthly: number;
      currency: string;
      breakdown: CostLineItem[];
      recommendations: AssessmentFinding[];
    };
    security: {
      score: number;
      findings: AssessmentFinding[];
    };
    reliability: {
      score: number;
      compositeSla: number;
      slaChain: SlaChainEntry[];
      findings: AssessmentFinding[];
      singlePointsOfFailure: string[];
    };
    performance: {
      score: number;
      findings: AssessmentFinding[];
    };
  };
  overallScore: number;
  assessedAt: string;
}

const TABS = [
  { id: 'cost', label: '💰 Cost', emoji: '💰' },
  { id: 'security', label: '🔒 Security', emoji: '🔒' },
  { id: 'reliability', label: '🛡️ Reliability', emoji: '🛡️' },
  { id: 'performance', label: '⚡ Performance', emoji: '⚡' },
] as const;

function StarRating({ score, size = 16 }: { score: number; size?: number }) {
  return (
    <span className="star-rating" title={`${score}/5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`star ${i <= score ? 'star-filled' : 'star-empty'}`}
          style={{ fontSize: size }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function PillarScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="pillar-score">
      <span className="pillar-score-label">{label}</span>
      <StarRating score={score} size={14} />
    </div>
  );
}

export function AssessmentPanel({ assessment, onClose }: AssessmentPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('cost');

  return (
    <div className="assessment-panel">
      <div className="assessment-panel-header">
        <div className="assessment-panel-title">
          <span className="assessment-panel-icon">📊</span>
          <span>WAF Assessment</span>
          <StarRating score={assessment.overallScore} size={18} />
        </div>
        <div className="assessment-panel-scores">
          <PillarScore label="💰" score={assessment.pillars.cost.score} />
          <PillarScore label="🔒" score={assessment.pillars.security.score} />
          <PillarScore label="🛡️" score={assessment.pillars.reliability.score} />
          <PillarScore label="⚡" score={assessment.pillars.performance.score} />
        </div>
        <button className="assessment-panel-close" onClick={onClose} title="Close assessment">
          ✕
        </button>
      </div>

      <div className="assessment-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`assessment-tab ${activeTab === tab.id ? 'assessment-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'cost' && assessment.pillars.cost.score > 0 && (
              <span className="assessment-tab-badge">{assessment.pillars.cost.score}/5</span>
            )}
            {tab.id === 'security' && assessment.pillars.security.findings.length > 0 && (
              <span className="assessment-tab-badge">{assessment.pillars.security.findings.length}</span>
            )}
            {tab.id === 'reliability' && assessment.pillars.reliability.findings.length > 0 && (
              <span className="assessment-tab-badge">{assessment.pillars.reliability.findings.length}</span>
            )}
            {tab.id === 'performance' && assessment.pillars.performance.findings.length > 0 && (
              <span className="assessment-tab-badge">{assessment.pillars.performance.findings.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="assessment-tab-content">
        {activeTab === 'cost' && <CostTab cost={assessment.pillars.cost} />}
        {activeTab === 'security' && <SecurityTab security={assessment.pillars.security} />}
        {activeTab === 'reliability' && <ReliabilityTab reliability={assessment.pillars.reliability} />}
        {activeTab === 'performance' && <PerformanceTab performance={assessment.pillars.performance} />}
      </div>
    </div>
  );
}
