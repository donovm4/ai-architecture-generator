/**
 * High Availability Rules
 *
 * Checks for single points of failure, missing redundancy,
 * DR configuration, and health probes.
 */

import type { AssessmentFinding, SlaChainEntry } from '../types.js';
import type { WalkResult, WalkedResource } from '../../validation/types.js';

let findingId = 0;
function nextId(): string {
  return `ha-${++findingId}`;
}

function normalizeType(type: string): string {
  return (type || '').toLowerCase().replace(/[\s_-]+/g, '').replace(/microsoft\.\w+\//g, '');
}

function isType(type: string, ...patterns: string[]): boolean {
  const normalized = normalizeType(type);
  return patterns.some(p => normalized === p.replace(/[\s_-]+/g, ''));
}

function hasResourceOfType(resources: WalkedResource[], ...types: string[]): boolean {
  return resources.some(r => isType(r.resource.type, ...types));
}

export function getHaFindings(walk: WalkResult, slaChain: SlaChainEntry[]): AssessmentFinding[] {
  findingId = 0;
  const findings: AssessmentFinding[] = [];
  const allResources = walk.resources;

  // 1. Single region deployment
  const regions = new Set(allResources.map(r => r.context.regionName).filter(Boolean));
  if (regions.size <= 1) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'reliability',
      title: 'Single region deployment',
      description: `All resources are deployed in ${regions.size === 1 ? `"${[...regions][0]}"` : 'a single region'}. A regional outage would take down the entire architecture.`,
      impact: 'Complete service outage during a regional failure. No geographic redundancy.',
      remediation: 'Consider deploying to a secondary region with Azure Traffic Manager or Front Door for failover.',
      autoFixPrompt: 'Add a secondary region with failover for key services',
    });
  }

  // 2. Single instance VMs (no VMSS or availability set)
  const singleVMs = allResources.filter(r => {
    if (!isType(r.resource.type, 'vm', 'virtualmachine', 'virtual machine')) return false;
    const props = r.resource.properties || {};
    return !props.availabilitySet && !props.availabilityZone && !props.zone;
  });
  for (const vm of singleVMs) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'reliability',
      title: `Single instance VM: ${vm.resource.name}`,
      description: `VM "${vm.resource.name}" is a single instance without availability set or zone. SLA is only 99.9%.`,
      impact: 'Higher risk of downtime during planned/unplanned maintenance. No hardware redundancy.',
      remediation: 'Place VMs in an availability set (99.95% SLA) or use availability zones (99.99% SLA).',
      autoFixPrompt: `Place VM "${vm.resource.name}" in an availability zone for higher SLA`,
    });
  }

  // 3. No load balancer for multi-instance workloads
  const vmssResources = allResources.filter(r => isType(r.resource.type,
    'vmss', 'vmscaleset', 'vm scale set'));
  const hasLB = hasResourceOfType(allResources, 'loadbalancer', 'load balancer',
    'applicationgateway', 'application gateway', 'app gateway');
  if (vmssResources.length > 0 && !hasLB) {
    for (const vmss of vmssResources) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        pillar: 'reliability',
        title: `VMSS without load balancer: ${vmss.resource.name}`,
        description: `VM Scale Set "${vmss.resource.name}" has no load balancer to distribute traffic across instances.`,
        impact: 'Traffic may not be evenly distributed. No health-based routing.',
        remediation: 'Add an Azure Load Balancer or Application Gateway in front of the VMSS.',
        autoFixPrompt: `Add a load balancer for VMSS "${vmss.resource.name}"`,
      });
    }
  }

  // 4. Single database without geo-replication
  const databases = allResources.filter(r => isType(r.resource.type,
    'sqldatabase', 'sql database', 'sql', 'azure sql', 'sqlserver'));
  if (databases.length > 0 && regions.size <= 1) {
    for (const db of databases) {
      const props = db.resource.properties || {};
      if (!props.geoReplication && !props.failoverGroup) {
        findings.push({
          id: nextId(),
          severity: 'warning',
          pillar: 'reliability',
          title: `Database without geo-replication: ${db.resource.name}`,
          description: `SQL Database "${db.resource.name}" has no geo-replication or failover group configured.`,
          impact: 'Database is a single point of failure. Regional outage causes data unavailability.',
          remediation: 'Configure active geo-replication or auto-failover groups for the database.',
          autoFixPrompt: `Add geo-replication for database "${db.resource.name}"`,
        });
      }
    }
  }

  // 5. No disaster recovery configuration
  if (regions.size <= 1 && allResources.length > 5) {
    const hasDRIndicator = allResources.some(r => {
      const name = (r.resource.name || '').toLowerCase();
      return name.includes('dr') || name.includes('recovery') || name.includes('backup')
        || name.includes('secondary') || name.includes('failover');
    });
    if (!hasDRIndicator) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'reliability',
        title: 'No disaster recovery configuration',
        description: 'No DR configuration detected (no secondary region, no backup services, no failover groups).',
        impact: 'Extended outage in case of regional disaster. No defined Recovery Time Objective (RTO).',
        remediation: 'Define RPO/RTO requirements and implement Azure Site Recovery or cross-region replication.',
      });
    }
  }

  // 6. Missing health probes
  const lbAndGw = allResources.filter(r => isType(r.resource.type,
    'loadbalancer', 'load balancer', 'applicationgateway', 'application gateway', 'app gateway'));
  for (const lb of lbAndGw) {
    const props = lb.resource.properties || {};
    if (!props.healthProbe && !props.healthProbes && !props.probe) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'reliability',
        title: `Verify health probes: ${lb.resource.name}`,
        description: `Ensure ${lb.resource.name} has health probes configured to detect unhealthy backend instances.`,
        impact: 'Without health probes, traffic may be sent to failed instances.',
        remediation: 'Configure HTTP or TCP health probes with appropriate intervals and thresholds.',
      });
    }
  }

  // 7. AKS without multiple node pools or autoscaler
  const aksClusters = allResources.filter(r => isType(r.resource.type,
    'aks', 'kubernetes', 'azure kubernetes service'));
  for (const aks of aksClusters) {
    const props = aks.resource.properties || {};
    if (!props.autoScaling && !props.clusterAutoscaler) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'reliability',
        title: `AKS without autoscaler: ${aks.resource.name}`,
        description: 'AKS cluster does not have cluster autoscaler configured.',
        impact: 'Pods may fail to schedule during traffic spikes if nodes are at capacity.',
        remediation: 'Enable the cluster autoscaler with appropriate min/max node counts.',
      });
    }
  }

  // 8. CosmosDB without multi-region
  const cosmosDBs = allResources.filter(r => isType(r.resource.type,
    'cosmosdb', 'cosmos db', 'cosmos'));
  for (const cosmos of cosmosDBs) {
    const props = cosmos.resource.properties || {};
    if (!props.multiRegion && !props.geoReplication && regions.size <= 1) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'reliability',
        title: `Cosmos DB single-region: ${cosmos.resource.name}`,
        description: 'Cosmos DB is in a single region. Multi-region writes can provide higher availability (99.999% SLA).',
        impact: 'Regional outage would make Cosmos DB data unavailable.',
        remediation: 'Enable multi-region writes for Cosmos DB to achieve 99.999% availability SLA.',
      });
    }
  }

  // 9. App Service without multiple instances
  const appServices = allResources.filter(r => isType(r.resource.type,
    'appservice', 'app service', 'webapp', 'web app'));
  for (const app of appServices) {
    const props = app.resource.properties || {};
    const instances = (props.instanceCount as number) || (props.instances as number) || 1;
    if (instances <= 1) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'reliability',
        title: `App Service single instance: ${app.resource.name}`,
        description: `App Service "${app.resource.name}" runs on a single instance. Scale out for resilience.`,
        impact: 'Instance failure causes complete service outage until auto-restart.',
        remediation: 'Scale out to at least 2 instances for basic redundancy.',
      });
    }
  }

  return findings;
}
