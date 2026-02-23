/**
 * SLA Calculator
 *
 * Calculates composite SLA for Azure architectures based on known
 * service-level SLAs and architecture topology (serial/parallel).
 */

import type { SlaChainEntry, ReliabilityAssessment, AssessmentFinding } from '../types.js';
import type { WalkResult, WalkedResource } from '../../validation/types.js';
import { getHaFindings } from './ha-rules.js';

/** Known Azure service SLAs (percentage) */
const SERVICE_SLA: Record<string, number> = {
  // Compute
  'vm': 99.9,
  'virtualmachine': 99.9,
  'virtual machine': 99.9,
  'vmss': 99.95,
  'vmscaleset': 99.95,
  'vm scale set': 99.95,
  'appservice': 99.95,
  'app service': 99.95,
  'webapp': 99.95,
  'web app': 99.95,
  'functionapp': 99.95,
  'function app': 99.95,
  'functions': 99.95,
  'azure functions': 99.95,
  'aks': 99.95,
  'kubernetes': 99.95,
  'azure kubernetes service': 99.95,
  'containerinstances': 99.9,
  'container instances': 99.9,

  // Networking
  'loadbalancer': 99.99,
  'load balancer': 99.99,
  'applicationgateway': 99.95,
  'application gateway': 99.95,
  'app gateway': 99.95,
  'waf': 99.95,
  'firewall': 99.95,
  'azurefirewall': 99.95,
  'azure firewall': 99.95,
  'vpngateway': 99.95,
  'vpn gateway': 99.95,
  'virtualnetworkgateway': 99.95,
  'virtual network gateway': 99.95,
  'frontdoor': 99.99,
  'front door': 99.99,
  'azure front door': 99.99,
  'trafficmanager': 99.99,
  'traffic manager': 99.99,
  'cdn': 99.9,
  'azure cdn': 99.9,

  // Databases
  'sqldatabase': 99.99,
  'sql database': 99.99,
  'sql': 99.99,
  'azure sql': 99.99,
  'sqlserver': 99.99,
  'cosmosdb': 99.999,
  'cosmos db': 99.999,
  'cosmos': 99.999,
  'redis': 99.9,
  'rediscache': 99.9,
  'redis cache': 99.9,
  'azure cache for redis': 99.9,

  // Storage
  'storageaccount': 99.9,
  'storage account': 99.9,
  'storage': 99.9,

  // Security & Identity
  'keyvault': 99.99,
  'key vault': 99.99,
  'bastion': 99.95,
  'azurebastion': 99.95,
  'azure bastion': 99.95,

  // Messaging
  'servicebus': 99.9,
  'service bus': 99.9,
  'eventhub': 99.99,
  'event hub': 99.99,

  // Integration
  'apimanagement': 99.95,
  'api management': 99.95,
  'apim': 99.95,

  // Monitoring
  'loganalytics': 99.9,
  'log analytics': 99.9,
  'monitor': 99.9,
  'azure monitor': 99.9,
  'applicationinsights': 99.9,
  'application insights': 99.9,
};

/** Higher SLA for VMs with availability sets */
const VM_AVAILABILITY_SET_SLA = 99.95;
const VM_AVAILABILITY_ZONE_SLA = 99.99;

function normalizeType(type: string): string {
  return (type || '').toLowerCase().replace(/microsoft\.\w+\//g, '').trim();
}

function getServiceSla(type: string, properties?: Record<string, unknown>): number {
  const normalized = normalizeType(type);

  // VM with availability set gets higher SLA
  if (normalized === 'vm' || normalized === 'virtualmachine' || normalized === 'virtual machine') {
    const props = properties || {};
    if (props.availabilityZone || props.zone) return VM_AVAILABILITY_ZONE_SLA;
    if (props.availabilitySet) return VM_AVAILABILITY_SET_SLA;
  }

  return SERVICE_SLA[normalized] || 0;
}

/** Check if a resource type is a VNet, subnet, NSG, or other non-service resource */
function isInfrastructureOnly(type: string): boolean {
  const normalized = normalizeType(type);
  const infra = ['vnet', 'hubvnet', 'hub vnet', 'virtualnetwork', 'virtual network',
    'subnet', 'nsg', 'networksecuritygroup', 'network security group',
    'publicip', 'public ip', 'publicipaddress', 'privateendpoint', 'private endpoint',
    'ddosprotection', 'ddos protection', 'ddos',
    'containerregistry', 'container registry', 'acr'];
  return infra.includes(normalized);
}

export function assessReliability(walk: WalkResult): ReliabilityAssessment {
  const slaChain: SlaChainEntry[] = [];
  const singlePointsOfFailure: string[] = [];

  // Build SLA chain from all services
  for (const wr of walk.resources) {
    const type = wr.resource.type;
    if (isInfrastructureOnly(type)) continue;

    const sla = getServiceSla(type, wr.resource.properties as Record<string, unknown>);
    if (sla === 0) continue;

    const props = (wr.resource.properties || {}) as Record<string, unknown>;
    const sku = (
      (props.sku as string) ||
      (props.size as string) ||
      (props.tier as string) ||
      ''
    );

    // Determine redundancy
    const isRedundant = !!(
      props.availabilitySet || props.availabilityZone || props.zone
      || normalizeType(type) === 'vmss' || normalizeType(type) === 'vm scale set'
      || (props.instances && (props.instances as number) > 1)
      || (props.replicas && (props.replicas as number) > 1)
    );

    slaChain.push({
      resourceName: wr.resource.name,
      serviceSla: sla,
      sku,
      isRedundant,
    });

    // Track single points of failure
    if (!isRedundant) {
      const normalized = normalizeType(type);
      if (normalized === 'vm' || normalized === 'virtualmachine' || normalized === 'virtual machine') {
        singlePointsOfFailure.push(wr.resource.name);
      }
    }
  }

  // Calculate composite SLA (serial chain — multiply all SLAs)
  let compositeSla = 100;
  for (const entry of slaChain) {
    compositeSla = (compositeSla / 100) * entry.serviceSla;
  }
  // Round to 4 decimal places
  compositeSla = Math.round(compositeSla * 10000) / 10000;

  // Get HA findings
  const findings = getHaFindings(walk, slaChain);

  // Score: 5 = highly available, 1 = poor reliability
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  let score = 5;
  score -= criticalCount * 1.5;
  score -= warningCount * 0.5;
  // Low composite SLA reduces score
  if (compositeSla < 99.0) score -= 1;
  else if (compositeSla < 99.9) score -= 0.5;
  // SPOFs reduce score
  score -= singlePointsOfFailure.length * 0.3;
  score = Math.max(1, Math.min(5, Math.round(score)));

  return {
    score,
    compositeSla,
    slaChain,
    findings,
    singlePointsOfFailure,
  };
}
