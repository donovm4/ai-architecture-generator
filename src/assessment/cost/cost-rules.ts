/**
 * Cost Optimization Rules
 *
 * Generates recommendations for reducing Azure spend:
 * reserved instances, right-sizing, tier optimization, etc.
 */

import type { AssessmentFinding, CostLineItem } from '../types.js';
import type { WalkResult } from '../../validation/types.js';

let findingId = 0;
function nextId(): string {
  return `cost-${++findingId}`;
}

export function getCostRecommendations(
  walk: WalkResult,
  breakdown: CostLineItem[],
  totalMonthly: number,
): AssessmentFinding[] {
  findingId = 0;
  const findings: AssessmentFinding[] = [];

  // 1. Reserved Instances for VMs
  const vmItems = breakdown.filter(b =>
    b.resourceType === 'Virtual Machine' || b.resourceType === 'VM Scale Set'
  );
  if (vmItems.length > 0) {
    const vmTotal = vmItems.reduce((s, v) => s + v.monthlyEstimate, 0);
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'cost',
      title: 'Consider Reserved Instances for VMs',
      description: `You have ${vmItems.length} VM-based resource(s) costing ~€${vmTotal}/mo. Azure Reserved Instances (1yr or 3yr) can save 30-72%.`,
      impact: `Potential savings: €${Math.round(vmTotal * 0.35)}-€${Math.round(vmTotal * 0.72)}/mo with reservations.`,
      remediation: 'Evaluate 1-year or 3-year Reserved Instance commitments for stable workloads.',
    });
  }

  // 2. Expensive Firewall check
  const firewalls = breakdown.filter(b => b.resourceType === 'Azure Firewall');
  for (const fw of firewalls) {
    if (fw.sku.toLowerCase() === 'premium') {
      findings.push({
        id: nextId(),
        severity: 'warning',
        pillar: 'cost',
        title: `Firewall Premium tier: ${fw.resourceName}`,
        description: `Azure Firewall Premium (€1,277/mo) includes IDPS and TLS inspection. Consider Standard (€912/mo) if you don't need these features.`,
        impact: `Potential savings: €365/mo per firewall.`,
        remediation: 'Evaluate if Premium features (TLS inspection, IDPS) are required. Downgrade to Standard if not.',
        autoFixPrompt: `Change the firewall "${fw.resourceName}" to Standard tier`,
      });
    }
    if (fw.sku.toLowerCase() === 'standard') {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'cost',
        title: `Consider Firewall Basic tier: ${fw.resourceName}`,
        description: `Azure Firewall Basic (€365/mo) may be sufficient for smaller workloads vs Standard (€912/mo).`,
        impact: `Potential savings: €547/mo per firewall.`,
        remediation: 'Evaluate if Basic tier meets your throughput and feature requirements.',
        autoFixPrompt: `Change the firewall "${fw.resourceName}" to Basic tier`,
      });
    }
  }

  // 3. DDoS Protection cost warning
  const ddos = breakdown.filter(b => b.resourceType === 'DDoS Protection');
  if (ddos.length > 0) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'cost',
      title: 'DDoS Protection Plan is expensive',
      description: `Azure DDoS Protection Standard costs €2,944/mo (flat fee). It covers all VNets in the subscription.`,
      impact: `€2,944/mo — ensure this is justified by the sensitivity of your public endpoints.`,
      remediation: 'Confirm the cost is justified. For dev/test environments, consider relying on DDoS Basic (free, included).',
    });
  }

  // 4. Oversized VMs (D8s or larger)
  const largeVMs = vmItems.filter(b => b.monthlyEstimate >= 284);
  for (const vm of largeVMs) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'cost',
      title: `Consider right-sizing: ${vm.resourceName}`,
      description: `${vm.resourceName} uses ${vm.sku} (€${vm.monthlyEstimate}/mo). Verify the workload requires this size.`,
      impact: `Right-sizing could save 30-50% of VM costs.`,
      remediation: 'Use Azure Advisor or Monitor to check actual CPU/memory utilization before right-sizing.',
    });
  }

  // 5. Premium App Gateway (WAF_v2)
  const wafGateways = breakdown.filter(b =>
    b.resourceType === 'Application Gateway' && b.sku.toLowerCase().includes('waf')
  );
  if (wafGateways.length > 0) {
    for (const gw of wafGateways) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'cost',
        title: `WAF App Gateway: ${gw.resourceName}`,
        description: `Application Gateway with WAF costs €${gw.monthlyEstimate}/mo. Consider using Azure Front Door WAF if you need global distribution.`,
        impact: `Front Door Standard + WAF may be more cost-effective for multi-region scenarios.`,
        remediation: 'Compare Application Gateway WAF vs Front Door WAF for your use case.',
      });
    }
  }

  // 6. Bastion cost
  const bastions = breakdown.filter(b => b.resourceType === 'Azure Bastion');
  for (const b of bastions) {
    if (b.sku.toLowerCase() === 'standard') {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'cost',
        title: `Consider Bastion Basic: ${b.resourceName}`,
        description: `Bastion Standard (€310/mo) includes features like file transfer and native client. Basic (€137/mo) may suffice.`,
        impact: `Potential savings: €173/mo.`,
        remediation: 'Evaluate if Standard features are needed. Downgrade to Basic for simple RDP/SSH.',
        autoFixPrompt: `Change bastion "${b.resourceName}" to Basic tier`,
      });
    }
  }

  // 7. Multiple AKS clusters — consider consolidation
  const aksClusters = breakdown.filter(b => b.resourceType === 'AKS');
  if (aksClusters.length > 1) {
    const aksTotal = aksClusters.reduce((s, a) => s + a.monthlyEstimate, 0);
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'cost',
      title: 'Multiple AKS clusters detected',
      description: `${aksClusters.length} AKS clusters with total node cost of €${aksTotal}/mo. Consider consolidating into fewer clusters with namespaces.`,
      impact: `Consolidation could reduce node overhead costs.`,
      remediation: 'Use Kubernetes namespaces and resource quotas to share clusters between teams/environments.',
    });
  }

  // 8. VPN Gateway cost
  const vpnGateways = breakdown.filter(b => b.resourceType === 'VPN Gateway');
  for (const gw of vpnGateways) {
    if (gw.monthlyEstimate >= 337) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'cost',
        title: `High-tier VPN Gateway: ${gw.resourceName}`,
        description: `VPN Gateway ${gw.sku} costs €${gw.monthlyEstimate}/mo. VpnGw1 (€132/mo) handles up to 650 Mbps.`,
        impact: `Potential savings: €${gw.monthlyEstimate - 132}/mo if lower throughput is acceptable.`,
        remediation: 'Review your actual bandwidth requirements and consider downgrading.',
        autoFixPrompt: `Downgrade VPN gateway "${gw.resourceName}" to VpnGw1`,
      });
    }
  }

  // 9. High total monthly cost
  if (totalMonthly > 5000) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'cost',
      title: 'High estimated monthly cost',
      description: `Total estimated cost is €${totalMonthly.toLocaleString()}/mo (€${(totalMonthly * 12).toLocaleString()}/yr). Review all resources for optimization.`,
      impact: `Annual spend: ~€${(totalMonthly * 12).toLocaleString()}.`,
      remediation: 'Use Azure Advisor cost recommendations, consider dev/test pricing, and evaluate reserved instances.',
    });
  }

  // 10. API Management Premium tier
  const premiumApim = breakdown.filter(b =>
    b.resourceType === 'API Management' && b.sku.includes('premium')
  );
  for (const apim of premiumApim) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'cost',
      title: `APIM Premium tier: ${apim.resourceName}`,
      description: `API Management Premium costs €${apim.monthlyEstimate}/mo. Consider Standard (€465/mo) unless you need multi-region or VNet injection.`,
      impact: `Potential savings: €${apim.monthlyEstimate - 465}/mo.`,
      remediation: 'Premium is needed for: VNet integration, multi-region, availability zones. Downgrade if not required.',
      autoFixPrompt: `Change API Management "${apim.resourceName}" to Standard tier`,
    });
  }

  return findings;
}
