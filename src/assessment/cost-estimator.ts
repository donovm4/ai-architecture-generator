/**
 * Cost Estimator
 *
 * Estimates monthly PAYG costs for an architecture using the Azure Retail Prices API.
 * Uses AI to map architecture resources to appropriate SKUs and calculate costs.
 */

import type { AssessmentFinding } from './types.js';

/** A single cost line item */
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
  category: 'compute' | 'networking' | 'storage' | 'databases' | 'security' | 'integration' | 'monitoring' | 'other';
}

/** SLA chain entry for composite SLA calculation */
export interface SlaPathEntry {
  resourceName: string;
  resourceType: string;
  sla: number;
  note: string;
}

/** A user flow path with composite SLA */
export interface SlaPath {
  name: string;
  description: string;
  path: SlaPathEntry[];
  compositeSla: number;
}

/** Full cost & SLA estimation result */
export interface CostSlaResult {
  lineItems: CostLineItem[];
  totalMonthly: number;
  currency: string;
  region: string;
  slaPaths: SlaPath[];
  recommendations: AssessmentFinding[];
  generatedAt: string;
}

/** Build the AI prompt for cost + SLA estimation */
export function buildCostSlaPrompt(architecture: any, region: string): string {
  const archJson = JSON.stringify(architecture, null, 2);

  return `You are an Azure cost estimation and SLA analysis expert. Analyze this architecture and provide:
1. Monthly PAYG cost estimates for each resource
2. User flow paths with composite SLA calculations

## Architecture
${archJson}

## Region
${region}

## Instructions

### Cost Estimation
For each resource in the architecture:
- Pick the most likely SKU/tier for a production workload (not the cheapest, not the most expensive)
- Use PAYG (Pay-As-You-Go) retail pricing for the specified region
- Estimate monthly cost assuming typical production usage (730 hours/month for compute, reasonable storage/throughput)
- Document your assumptions (e.g., "D4s v5, 730 hrs/month", "S1 tier, 1 instance")
- Categorize each as: compute, networking, storage, databases, security, integration, monitoring, or other

### SLA Analysis
- Identify 1-3 critical user flow paths through the architecture (e.g., "Web request: User → Front Door → App Gateway → AKS → SQL Database")
- For each path, list the resources in sequence with their individual SLAs
- Calculate the composite SLA by multiplying individual SLAs along the path
- Only include resources that are in the critical path (not monitoring, diagnostics, etc.)

### Cost Recommendations
- Identify 2-4 cost optimization opportunities (reserved instances, right-sizing, tier changes)

## Response Format
Return a JSON object:
{
  "lineItems": [
    {
      "resourceName": "aks-main",
      "resourceType": "aks",
      "service": "Azure Kubernetes Service",
      "sku": "Standard_D4s_v5 × 3 nodes",
      "region": "westeurope",
      "monthlyEstimate": 438.00,
      "unit": "hour",
      "pricePerUnit": 0.20,
      "assumptions": "3-node cluster, D4s v5, 730 hrs/month",
      "category": "compute"
    }
  ],
  "slaPaths": [
    {
      "name": "Web Request Path",
      "description": "End user HTTP request flow",
      "path": [
        { "resourceName": "front-door", "resourceType": "frontDoor", "sla": 99.99, "note": "Azure Front Door Standard" },
        { "resourceName": "aks-main", "resourceType": "aks", "sla": 99.95, "note": "AKS with SLA (paid tier)" }
      ],
      "compositeSla": 99.94
    }
  ],
  "recommendations": [
    {
      "severity": "info",
      "pillar": "Cost",
      "title": "Consider Reserved Instances for AKS nodes",
      "description": "3-year reserved instances for D4s v5 could save ~60%",
      "impact": "Potential savings of ~$263/month",
      "remediation": "Purchase 3-year reserved instances for the 3 AKS nodes"
    }
  ]
}

Return ONLY the JSON object, no markdown fences. Be realistic with pricing — use actual Azure retail prices you know.`;
}

/** Parse the AI cost/SLA response */
export function parseCostSlaResponse(text: string): CostSlaResult | null {
  let jsonStr = text.trim();

  // Strip markdown fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  // Find object
  const objStart = jsonStr.indexOf('{');
  const objEnd = jsonStr.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) {
    jsonStr = jsonStr.substring(objStart, objEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);

    const lineItems: CostLineItem[] = (parsed.lineItems || []).map((item: any) => ({
      resourceName: item.resourceName || '',
      resourceType: item.resourceType || '',
      service: item.service || '',
      sku: item.sku || '',
      region: item.region || '',
      monthlyEstimate: Number(item.monthlyEstimate) || 0,
      unit: item.unit || '',
      pricePerUnit: Number(item.pricePerUnit) || 0,
      assumptions: item.assumptions || '',
      category: item.category || 'other',
    }));

    const slaPaths: SlaPath[] = (parsed.slaPaths || []).map((sp: any) => ({
      name: sp.name || '',
      description: sp.description || '',
      path: (sp.path || []).map((e: any) => ({
        resourceName: e.resourceName || '',
        resourceType: e.resourceType || '',
        sla: Number(e.sla) || 99.9,
        note: e.note || '',
      })),
      compositeSla: Number(sp.compositeSla) || 0,
    }));

    const recommendations: AssessmentFinding[] = (parsed.recommendations || []).map((r: any, i: number) => ({
      id: `cost-rec-${i + 1}`,
      severity: r.severity || 'info',
      pillar: 'Cost',
      title: r.title || '',
      description: r.description || '',
      impact: r.impact || '',
      remediation: r.remediation || '',
    }));

    const totalMonthly = lineItems.reduce((sum: number, item: CostLineItem) => sum + item.monthlyEstimate, 0);

    return {
      lineItems,
      totalMonthly,
      currency: 'USD',
      region: lineItems[0]?.region || 'unknown',
      slaPaths,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[CostEstimator] Failed to parse response:', e);
    return null;
  }
}
