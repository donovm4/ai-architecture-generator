/**
 * Performance Assessment Rules
 *
 * Checks for performance bottlenecks, missing caching layers,
 * auto-scaling gaps, and CDN opportunities.
 */

import type { AssessmentFinding, PerformanceAssessment } from '../types.js';
import type { WalkResult, WalkedResource } from '../../validation/types.js';

let findingId = 0;
function nextId(): string {
  return `perf-${++findingId}`;
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

export function assessPerformance(walk: WalkResult): PerformanceAssessment {
  findingId = 0;
  const findings: AssessmentFinding[] = [];
  const allResources = walk.resources;

  // 1. Cross-region connections without CDN/caching
  const regions = new Set(allResources.map(r => r.context.regionName).filter(Boolean));
  const hasCDN = hasResourceOfType(allResources, 'cdn', 'azure cdn', 'frontdoor', 'front door', 'azure front door');
  const hasCache = hasResourceOfType(allResources, 'redis', 'rediscache', 'redis cache', 'azure cache for redis');

  if (regions.size > 1 && !hasCDN && !hasCache) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'performance',
      title: 'Multi-region without CDN or caching',
      description: `Architecture spans ${regions.size} regions but has no CDN or caching layer for cross-region data access.`,
      impact: 'Users in distant regions experience high latency. No edge caching for static content.',
      remediation: 'Deploy Azure Front Door or CDN for static content, and Redis Cache for frequently accessed data.',
      autoFixPrompt: 'Add Azure CDN and Redis Cache for improved cross-region performance',
    });
  }

  // 2. Missing Redis cache for frequent data access (when DBs present but no cache)
  const hasDatabases = hasResourceOfType(allResources,
    'sqldatabase', 'sql database', 'sql', 'azure sql', 'sqlserver',
    'cosmosdb', 'cosmos db');
  const webApps = allResources.filter(r => isType(r.resource.type,
    'appservice', 'app service', 'webapp', 'web app',
    'functionapp', 'function app', 'aks', 'kubernetes'));

  if (hasDatabases && webApps.length > 0 && !hasCache) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'performance',
      title: 'No caching layer between app and database',
      description: 'Application services connect directly to databases with no Redis Cache layer.',
      impact: 'Every request hits the database directly. Frequent reads could benefit from caching.',
      remediation: 'Add Azure Cache for Redis to cache frequently accessed data and reduce database load.',
      autoFixPrompt: 'Add Azure Cache for Redis between the application and database tiers',
    });
  }

  // 3. VMs undersized for their role
  const vms = allResources.filter(r => isType(r.resource.type, 'vm', 'virtualmachine', 'virtual machine'));
  for (const vm of vms) {
    const props = vm.resource.properties || {};
    const size = ((props.vmSize as string) || (props.size as string) || (props.sku as string) || '').toLowerCase();
    const name = vm.resource.name.toLowerCase();

    // B-series VMs used for production workloads
    if (size.startsWith('b') && !name.includes('dev') && !name.includes('test') && !name.includes('jump')) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        pillar: 'performance',
        title: `B-series VM for production: ${vm.resource.name}`,
        description: `VM "${vm.resource.name}" uses burstable B-series (${size.toUpperCase()}). B-series is designed for dev/test, not sustained workloads.`,
        impact: 'CPU credits may deplete under sustained load, causing severe performance degradation.',
        remediation: 'Use D-series or E-series VMs for production workloads that need consistent CPU performance.',
        autoFixPrompt: `Upgrade VM "${vm.resource.name}" from B-series to D-series for production use`,
      });
    }
  }

  // 4. Missing auto-scaling
  const appServices = allResources.filter(r => isType(r.resource.type,
    'appservice', 'app service', 'webapp', 'web app'));
  for (const app of appServices) {
    const props = app.resource.properties || {};
    if (!props.autoScale && !props.autoScaling && !props.elasticScaleEnabled) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'performance',
        title: `No auto-scaling: ${app.resource.name}`,
        description: `App Service "${app.resource.name}" has no auto-scaling configured.`,
        impact: 'Cannot handle traffic spikes automatically. May become unresponsive under load.',
        remediation: 'Configure auto-scale rules based on CPU, memory, or HTTP queue length.',
      });
    }
  }

  // VMSS without autoscaling
  const vmss = allResources.filter(r => isType(r.resource.type, 'vmss', 'vmscaleset', 'vm scale set'));
  for (const vs of vmss) {
    const props = vs.resource.properties || {};
    if (!props.autoScale && !props.autoScaling) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'performance',
        title: `VMSS without auto-scaling: ${vs.resource.name}`,
        description: `VM Scale Set "${vs.resource.name}" may not have auto-scaling rules configured.`,
        impact: 'Fixed instance count cannot adapt to traffic patterns.',
        remediation: 'Configure VMSS autoscale with metrics-based rules (CPU > 70%, etc.).',
      });
    }
  }

  // 5. No CDN for static content delivery
  const hasStorage = hasResourceOfType(allResources, 'storageaccount', 'storage account', 'storage');
  if (hasStorage && !hasCDN) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'performance',
      title: 'Storage account without CDN',
      description: 'Storage accounts serve content without a CDN. Static files are served directly from the storage region.',
      impact: 'Users far from the storage region experience higher latency for static assets.',
      remediation: 'Enable Azure CDN in front of storage accounts serving static content (images, scripts, documents).',
      autoFixPrompt: 'Add Azure CDN in front of storage accounts for static content delivery',
    });
  }

  // 6. Database without read replicas for read-heavy workloads
  const sqlDatabases = allResources.filter(r => isType(r.resource.type,
    'sqldatabase', 'sql database', 'sql', 'azure sql', 'sqlserver'));
  for (const db of sqlDatabases) {
    const props = db.resource.properties || {};
    if (!props.readReplica && !props.readScale && !props.geoReplication) {
      findings.push({
        id: nextId(),
        severity: 'info',
        pillar: 'performance',
        title: `Consider read replicas: ${db.resource.name}`,
        description: `SQL Database "${db.resource.name}" has no read replicas configured.`,
        impact: 'All read and write queries hit the same database instance, limiting read throughput.',
        remediation: 'Enable read scale-out or add geo-replicas for read-heavy workloads.',
      });
    }
  }

  // 7. AKS without HPA (Horizontal Pod Autoscaler)
  const aksClusters = allResources.filter(r => isType(r.resource.type,
    'aks', 'kubernetes', 'azure kubernetes service'));
  for (const aks of aksClusters) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'performance',
      title: `Verify AKS pod auto-scaling: ${aks.resource.name}`,
      description: 'Ensure Horizontal Pod Autoscaler (HPA) is configured for workloads in the AKS cluster.',
      impact: 'Fixed pod counts cannot adapt to traffic changes.',
      remediation: 'Configure HPA on Deployments with CPU/memory targets. Consider KEDA for event-driven scaling.',
    });
  }

  // 8. App Gateway without connection draining
  const appGateways = allResources.filter(r => isType(r.resource.type,
    'applicationgateway', 'application gateway', 'app gateway'));
  for (const gw of appGateways) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'performance',
      title: `Verify App Gateway settings: ${gw.resource.name}`,
      description: 'Ensure connection draining, cookie-based affinity, and auto-scaling are properly configured.',
      impact: 'Misconfigured App Gateway can cause connection drops during deployments.',
      remediation: 'Enable connection draining, configure auto-scaling units, and set appropriate timeouts.',
    });
  }

  // 9. Large number of resources without traffic distribution
  const hasLB = hasResourceOfType(allResources, 'loadbalancer', 'load balancer');
  const hasAppGw = hasResourceOfType(allResources, 'applicationgateway', 'application gateway', 'app gateway');
  const hasTM = hasResourceOfType(allResources, 'trafficmanager', 'traffic manager');
  if (vms.length >= 3 && !hasLB && !hasAppGw && !hasTM) {
    findings.push({
      id: nextId(),
      severity: 'warning',
      pillar: 'performance',
      title: 'Multiple VMs without load balancing',
      description: `${vms.length} VMs detected but no load balancer for traffic distribution.`,
      impact: 'Uneven traffic distribution can overload some VMs while others are idle.',
      remediation: 'Add an Azure Load Balancer (L4) or Application Gateway (L7) to distribute traffic.',
      autoFixPrompt: 'Add a load balancer to distribute traffic across the VMs',
    });
  }

  // 10. Cosmos DB without indexing policy consideration
  const cosmosDBs = allResources.filter(r => isType(r.resource.type,
    'cosmosdb', 'cosmos db', 'cosmos'));
  for (const cosmos of cosmosDBs) {
    findings.push({
      id: nextId(),
      severity: 'info',
      pillar: 'performance',
      title: `Optimize Cosmos DB: ${cosmos.resource.name}`,
      description: 'Review Cosmos DB indexing policy, partition key strategy, and provisioned throughput.',
      impact: 'Poor partition key or indexing can cause hot partitions and high RU consumption.',
      remediation: 'Use Azure Cosmos DB Capacity Calculator and review partition key distribution.',
    });
  }

  // Score: 5 = well-optimized, 1 = significant performance concerns
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  let score = 5;
  score -= criticalCount * 1.5;
  score -= warningCount * 0.5;
  score -= Math.min(findings.filter(f => f.severity === 'info').length * 0.15, 1);
  score = Math.max(1, Math.min(5, Math.round(score)));

  return { score, findings };
}
