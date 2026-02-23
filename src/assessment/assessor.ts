/**
 * Assessment Orchestrator
 *
 * Runs all pillar assessments against an Architecture and returns
 * a unified AssessmentResult.
 */

import type { Architecture } from '../schema/types.js';
import type { AssessmentResult } from './types.js';
import { walkArchitecture } from '../validation/walker.js';
import { assessCost } from './cost/cost-estimator.js';
import { assessSecurity } from './security/security-rules.js';
import { assessReliability } from './reliability/sla-calculator.js';
import { assessPerformance } from './performance/perf-rules.js';

export type Pillar = 'cost' | 'security' | 'reliability' | 'performance';

const DEFAULT_COST = { score: 0, totalMonthly: 0, currency: 'EUR', breakdown: [], recommendations: [] };
const DEFAULT_SECURITY = { score: 0, findings: [] };
const DEFAULT_RELIABILITY = { score: 0, compositeSla: 0, slaChain: [], findings: [], singlePointsOfFailure: [] };
const DEFAULT_PERFORMANCE = { score: 0, findings: [] };

/**
 * Run the WAF assessment across selected pillars.
 *
 * @param architecture - The Azure architecture to assess
 * @param pillars - Which pillars to evaluate (default: all four)
 */
export function assess(
  architecture: Architecture,
  pillars?: Pillar[],
): AssessmentResult {
  const selected = new Set<Pillar>(pillars ?? ['cost', 'security', 'reliability', 'performance']);

  // Walk the architecture tree once (shared across all pillars)
  const walk = walkArchitecture(architecture);

  // Run each selected pillar
  const cost = selected.has('cost') ? assessCost(walk) : DEFAULT_COST;
  const security = selected.has('security') ? assessSecurity(walk) : DEFAULT_SECURITY;
  const reliability = selected.has('reliability') ? assessReliability(walk) : DEFAULT_RELIABILITY;
  const performance = selected.has('performance') ? assessPerformance(walk) : DEFAULT_PERFORMANCE;

  // Calculate overall score (average of selected pillars)
  const scores: number[] = [];
  if (selected.has('cost')) scores.push(cost.score);
  if (selected.has('security')) scores.push(security.score);
  if (selected.has('reliability')) scores.push(reliability.score);
  if (selected.has('performance')) scores.push(performance.score);

  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    pillars: { cost, security, reliability, performance },
    overallScore: Math.max(1, Math.min(5, overallScore)),
    assessedAt: new Date().toISOString(),
  };
}
