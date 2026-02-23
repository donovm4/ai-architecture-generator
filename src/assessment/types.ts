/**
 * WAF-Style Architecture Assessment Types
 *
 * Types for assessing Azure architectures across the four Well-Architected
 * Framework pillars: Cost, Security, Reliability, and Performance.
 */

export interface AssessmentResult {
  pillars: {
    cost: CostAssessment;
    security: SecurityAssessment;
    reliability: ReliabilityAssessment;
    performance: PerformanceAssessment;
  };
  overallScore: number;        // 1-5
  assessedAt: string;
}

export interface CostAssessment {
  score: number;
  totalMonthly: number;
  currency: string;
  breakdown: CostLineItem[];
  recommendations: AssessmentFinding[];
}

export interface CostLineItem {
  resourceName: string;
  resourceType: string;
  sku: string;
  region: string;
  monthlyEstimate: number;
  category: 'compute' | 'networking' | 'storage' | 'databases' | 'security' | 'monitoring' | 'other';
}

export interface SecurityAssessment {
  score: number;
  findings: AssessmentFinding[];
}

export interface ReliabilityAssessment {
  score: number;
  compositeSla: number;
  slaChain: SlaChainEntry[];
  findings: AssessmentFinding[];
  singlePointsOfFailure: string[];
}

export interface SlaChainEntry {
  resourceName: string;
  serviceSla: number;
  sku: string;
  isRedundant: boolean;
}

export interface PerformanceAssessment {
  score: number;
  findings: AssessmentFinding[];
}

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
