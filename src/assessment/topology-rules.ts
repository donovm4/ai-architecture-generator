/**
 * Topology Rules
 *
 * Architecture-level assessment rules that check cross-resource topology.
 * These are things per-service checklists can't detect because they require
 * looking at the architecture as a whole.
 *
 * Rules are CONTEXTUAL — they only fire when the specific condition
 * actually applies to resources present in the architecture.
 */

import type { AssessmentFinding } from './types.js';
import type { WalkResult, WalkedResource } from '../validation/types.js';

let findingId = 0;
function nextId(): string {
  return `topo-${++findingId}`;
}

function normalizeType(type: string): string {
  return (type || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function isType(type: string, ...patterns: string[]): boolean {
  const normalized = normalizeType(type);
  return patterns.some(p => normalized === normalizeType(p));
}

function hasAnyType(resources: WalkedResource[], ...types: string[]): boolean {
  return resources.some(r => isType(r.resource.type, ...types));
}

export function assessTopology(walk: WalkResult): AssessmentFinding[] {
  findingId = 0;
  const findings: AssessmentFinding[] = [];
  const all = walk.resources;

  // ── 1. Subnets without NSGs ──
  const subnetsWithoutNsg = walk.subnets.filter(s => {
    const subnetResources = all.filter(r => r.context.subnetName === s.subnet.name);
    const hasNsg = subnetResources.some(r => isType(r.resource.type, 'nsg', 'networksecuritygroup'));
    const nsgRef = s.subnet.nsg;
    // Only flag subnets that actually have resources in them
    return !hasNsg && !nsgRef && (s.subnet.resources?.length || 0) > 0;
  });
  if (subnetsWithoutNsg.length > 0) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'Security',
      title: `${subnetsWithoutNsg.length} subnet(s) without NSG`,
      description: `Subnets without NSGs: ${subnetsWithoutNsg.map(s => s.subnet.name).join(', ')}`,
      impact: 'No network-level access control on these subnets.',
      remediation: 'Associate an NSG with each subnet to control inbound and outbound traffic.',
    });
  }

  // ── 2. VMs with public IP but no NSG on their subnet ──
  const vms = all.filter(r => isType(r.resource.type, 'vm', 'virtualmachine'));
  for (const vm of vms) {
    const props = vm.resource.properties || {};
    const hasPublicIP = props.publicIp || props.publicIP || props.publicIpAddress;
    if (!hasPublicIP) continue;

    const subnetHasNsg = all.some(r =>
      isType(r.resource.type, 'nsg', 'networksecuritygroup') &&
      r.context.subnetName === vm.context.subnetName
    );
    if (!subnetHasNsg) {
      findings.push({
        id: nextId(),
        severity: 'critical',
        pillar: 'Security',
        title: `VM "${vm.resource.name}" has public IP without NSG`,
        description: `VM "${vm.resource.name}" is publicly exposed with no network security group on its subnet.`,
        impact: 'Direct internet exposure without network-level access controls.',
        remediation: 'Add an NSG to the subnet or remove the public IP and use Bastion for access.',
      });
    }
  }

  // ── 3. PaaS without private endpoints — only if PaaS services exist ──
  const paasTypes = ['sqldatabase', 'sqlserver', 'cosmosdb', 'storageaccount', 'keyvault',
    'redis', 'rediscache', 'servicebus', 'eventhub', 'containerregistry', 'acr'];
  const paasServices = all.filter(r => isType(r.resource.type, ...paasTypes));
  const hasPrivateEndpoints = hasAnyType(all, 'privateendpoint');

  if (paasServices.length > 0 && !hasPrivateEndpoints) {
    const names = paasServices.map(r => r.resource.name).slice(0, 5).join(', ');
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'Security',
      title: `${paasServices.length} PaaS service(s) without private endpoints`,
      description: `Services: ${names}${paasServices.length > 5 ? '...' : ''}. No private endpoints detected.`,
      impact: 'Data traffic goes over the public internet instead of the Microsoft backbone.',
      remediation: 'Deploy private endpoints for PaaS services to keep traffic private.',
    });
  }

  // ── 4. No monitoring — only if there are compute/app resources ──
  const computeTypes = ['vm', 'virtualmachine', 'aks', 'appservice', 'functionapp',
    'containerapp', 'containerregistry'];
  const hasCompute = hasAnyType(all, ...computeTypes);
  const hasMonitoring = hasAnyType(all, 'loganalytics', 'loganalyticsworkspace', 'applicationinsights', 'monitor');

  if (hasCompute && !hasMonitoring) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'Operations',
      title: 'No centralized monitoring',
      description: 'Compute resources found but no Log Analytics workspace or Application Insights.',
      impact: 'No visibility into application performance, errors, or security events.',
      remediation: 'Add a Log Analytics workspace and enable diagnostic settings on all resources.',
    });
  }

  // ── 5. Web apps without WAF — only if web apps exist ──
  const webApps = all.filter(r => isType(r.resource.type, 'appservice', 'webapp', 'functionapp'));
  const hasWaf = hasAnyType(all, 'applicationgateway', 'appgateway', 'waf', 'frontdoor');

  if (webApps.length > 0 && !hasWaf) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'Security',
      title: 'No WAF protecting web applications',
      description: `${webApps.length} web app(s) found without a Web Application Firewall.`,
      impact: 'Web apps may be vulnerable to common web attacks (OWASP Top 10).',
      remediation: 'Consider adding Application Gateway with WAF v2 or Azure Front Door with WAF policy.',
    });
  }

  // ── 6. AKS without container registry ──
  const hasAks = hasAnyType(all, 'aks', 'kubernetesservice');
  const hasAcr = hasAnyType(all, 'containerregistry', 'acr');

  if (hasAks && !hasAcr) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'Security',
      title: 'AKS without private container registry',
      description: 'AKS cluster found but no Azure Container Registry in the architecture.',
      impact: 'Container images may be pulled from public registries without vulnerability scanning.',
      remediation: 'Add an Azure Container Registry and attach it to the AKS cluster.',
    });
  }

  return findings;
}
