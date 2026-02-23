/**
 * Architecture Assessor
 *
 * Uses AI to evaluate an architecture against Microsoft Azure Review Checklists
 * and topology rules. Instead of dumping all checklist items, the AI analyzes
 * which items are actually relevant to the specific architecture.
 */

import { walkArchitecture } from '../validation/walker.js';
import { getChecklistForType, getCrossCuttingItems } from './checklist-mapper.js';
import { assessTopology } from './topology-rules.js';
import type { AssessmentResult, AssessmentFinding, ChecklistItem, ServiceChecklist } from './types.js';

/** Gather raw checklist data for an architecture (no AI, just mapping) */
export function gatherChecklists(architecture: any): {
  serviceChecklists: ServiceChecklist[];
  crossCuttingItems: ChecklistItem[];
  topologyFindings: AssessmentFinding[];
} {
  const walk = walkArchitecture(architecture);
  const serviceChecklists: ServiceChecklist[] = [];
  const seenChecklist = new Set<string>();

  for (const walked of walk.resources) {
    const type = walked.resource.type;
    const name = walked.resource.name;
    const { files, items } = getChecklistForType(type);

    if (items.length === 0) continue;

    const key = `${type}:${files.join(',')}`;
    if (seenChecklist.has(key)) continue;
    seenChecklist.add(key);

    const serviceName = items[0]?.service || type;

    serviceChecklists.push({
      resourceType: type,
      resourceName: name,
      service: serviceName,
      checklistFile: files[0] || '',
      items,
    });
  }

  const crossCuttingItems = getCrossCuttingItems();
  const topologyFindings = assessTopology(walk);

  return { serviceChecklists, crossCuttingItems, topologyFindings };
}

/** Build the AI prompt for assessment */
export function buildAssessmentPrompt(architecture: any, checklists: ServiceChecklist[], crossCutting: ChecklistItem[]): string {
  // Summarize the architecture
  const archSummary = JSON.stringify(architecture, null, 2);

  // Build checklist reference — only High and Medium severity to keep token count manageable
  const checklistRef: string[] = [];
  for (const sc of checklists) {
    const importantItems = sc.items
      .filter(i => i.severity === 'High' || i.severity === 'Medium')
      .map(i => `  - [${i.severity}] [${i.waf}] ${i.text}${i.link ? ` (${i.link})` : ''}`)
      .join('\n');
    if (importantItems) {
      checklistRef.push(`### ${sc.service}\n${importantItems}`);
    }
  }

  // Cross-cutting (already filtered to High)
  const ccRef = crossCutting
    .slice(0, 30) // Cap to avoid token explosion
    .map(i => `  - [${i.severity}] [${i.waf}] ${i.text}`)
    .join('\n');

  return `You are an Azure Well-Architected Framework (WAF) assessor. Analyze this architecture and identify specific issues, risks, and recommendations.

## Architecture to Assess
${archSummary}

## Reference Checklists (Microsoft Azure Review Checklists)
These are best-practice checklist items for the services in this architecture. Only flag items that are **actually relevant** to this specific architecture based on what's present/missing.

${checklistRef.join('\n\n')}

${ccRef ? `### Cross-Cutting (Security & Resiliency)\n${ccRef}` : ''}

## Instructions
1. Analyze the architecture topology, resource configuration, and connections.
2. Identify ONLY findings that are relevant to THIS architecture. Do NOT include generic advice that doesn't apply.
3. For each finding, explain specifically WHY it applies to this architecture (reference specific resources by name).
4. Categorize findings by WAF pillar (Security, Reliability, Performance, Cost, Operations).
5. Be specific — "Your AKS cluster 'aks-main' lacks..." not "AKS clusters should...".

## Response Format
Return a JSON array of findings. Each finding:
{
  "severity": "critical" | "warning" | "info",
  "pillar": "Security" | "Reliability" | "Performance" | "Cost" | "Operations",
  "title": "Short descriptive title",
  "description": "What the issue is, referencing specific resources",
  "impact": "What could go wrong",
  "remediation": "Specific steps to fix it",
  "checklistRef": "optional — the checklist item text this relates to"
}

Return ONLY the JSON array, no markdown fences or explanation. Aim for 5-15 findings — quality over quantity. Focus on the most impactful issues first.`;
}

/** Parse the AI response into findings */
export function parseAssessmentResponse(text: string): AssessmentFinding[] {
  // Try to extract JSON array from the response
  let jsonStr = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Find the array
  const arrStart = jsonStr.indexOf('[');
  const arrEnd = jsonStr.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    jsonStr = jsonStr.substring(arrStart, arrEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((f: any, i: number) => ({
      id: `ai-${i + 1}`,
      severity: (['critical', 'warning', 'info'].includes(f.severity) ? f.severity : 'info') as 'critical' | 'warning' | 'info',
      pillar: f.pillar || 'Operations',
      title: f.title || 'Untitled finding',
      description: f.description || '',
      impact: f.impact || '',
      remediation: f.remediation || '',
    }));
  } catch {
    console.error('[Assessment] Failed to parse AI response as JSON');
    return [];
  }
}

/** Non-AI fallback: just return topology findings + summary */
export function assessWithoutAI(architecture: any): AssessmentResult {
  const { serviceChecklists, crossCuttingItems, topologyFindings } = gatherChecklists(architecture);

  const allItems = [
    ...serviceChecklists.flatMap(sc => sc.items),
    ...crossCuttingItems,
  ];

  const byPillar: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const item of allItems) {
    byPillar[item.waf] = (byPillar[item.waf] || 0) + 1;
    bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
  }
  for (const f of topologyFindings) {
    byPillar[f.pillar] = (byPillar[f.pillar] || 0) + 1;
  }

  return {
    serviceChecklists: [],
    crossCuttingItems: [],
    topologyFindings,
    aiFindings: [],
    summary: {
      totalItems: topologyFindings.length,
      byPillar,
      bySeverity,
      servicesAssessed: serviceChecklists.map(sc => sc.service),
    },
  };
}
