/**
 * Assessment Types
 *
 * Types for the checklist-based WAF assessment engine,
 * powered by Microsoft's Azure Review Checklists.
 */

/** A single item from a Microsoft Azure Review Checklist */
export interface ChecklistItem {
  guid: string;
  id: string;
  category: string;
  subcategory: string;
  text: string;
  waf: string; // 'Security' | 'Reliability' | 'Performance' | 'Cost' | 'Operations' | 'Governance'
  severity: 'High' | 'Medium' | 'Low';
  service?: string;
  link?: string;
}

/** A topology-level finding from custom architecture rules */
export interface AssessmentFinding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  pillar: string;
  title: string;
  description: string;
  impact: string;
  remediation: string;
  autoFixPrompt?: string;
}

/** Service-specific checklist result — items grouped by service in the architecture */
export interface ServiceChecklist {
  resourceType: string;
  resourceName: string;
  service: string;
  checklistFile: string;
  items: ChecklistItem[];
}

/** Full assessment result */
export interface AssessmentResult {
  /** Per-service checklist items (kept for reference, may be empty in AI mode) */
  serviceChecklists: ServiceChecklist[];
  /** Cross-cutting checklist items */
  crossCuttingItems: ChecklistItem[];
  /** Topology-level findings (custom rules, always run) */
  topologyFindings: AssessmentFinding[];
  /** AI-generated findings (architecture-specific) */
  aiFindings: AssessmentFinding[];
  /** Summary statistics */
  summary: {
    totalItems: number;
    byPillar: Record<string, number>;
    bySeverity: Record<string, number>;
    servicesAssessed: string[];
  };
}

// ─── Legacy types kept for backward compat ───

export interface SecurityAssessment {
  findings: AssessmentFinding[];
  score: number;
}
export interface ReliabilityAssessment {
  findings: AssessmentFinding[];
  score: number;
}
export interface PerformanceAssessment {
  findings: AssessmentFinding[];
  score: number;
}
export interface CostAssessment {
  findings: AssessmentFinding[];
  score: number;
}
export interface CostLineItem {
  resourceName: string;
  resourceType: string;
  sku: string;
  region: string;
  monthlyEstimate: number;
  category: string;
}
export interface SlaChainEntry {
  resourceName: string;
  serviceSla: number;
  sku: string;
  isRedundant: boolean;
}
