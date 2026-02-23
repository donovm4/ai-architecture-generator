/**
 * Service Validation Rules
 *
 * Validates Azure service configurations: VM disks, Load Balancer backends,
 * AKS subnet sizing, private endpoint recommendations, and more.
 */

import type { ValidationFinding, WalkResult } from '../types.js';

/** Normalise resource type to lowercase for comparison */
function normaliseType(type: string): string {
  return (type || '').toLowerCase().replace(/[\s_-]/g, '');
}

/** Parse a CIDR prefix length */
function parseCIDRPrefix(cidr?: string): number | null {
  if (!cidr) return null;
  const match = cidr.match(/\/(\d+)$/);
  if (!match) return null;
  const prefix = parseInt(match[1], 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  return prefix;
}

let ruleCounter = 0;
function nextId(): string {
  return `service-${++ruleCounter}`;
}

export function serviceRules(walk: WalkResult): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  ruleCounter = 0;

  // Build lookups
  const allResourceNames = new Set<string>();
  const allResourceTypes = new Map<string, string[]>(); // type → names
  for (const { resource } of walk.resources) {
    allResourceNames.add(resource.name.toLowerCase());
    const nt = normaliseType(resource.type);
    if (!allResourceTypes.has(nt)) allResourceTypes.set(nt, []);
    allResourceTypes.get(nt)!.push(resource.name);
  }

  const hasPrivateEndpoints = walk.resources.some(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'privateendpoint' || nt.includes('privateendpoint');
  });

  const hasServiceEndpoints = walk.resources.some(r => {
    const nt = normaliseType(r.resource.type);
    return nt.includes('serviceendpoint');
  });

  // Check connections for backend references
  const connectionTargets = new Set<string>();
  for (const conn of walk.connections) {
    connectionTargets.add(conn.from.toLowerCase());
    connectionTargets.add(conn.to.toLowerCase());
  }

  // ── Rule 1: VMs should have disks specified ──
  const vms = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'vm' || nt === 'virtualmachine' || nt.includes('virtualmachines');
  });
  const disks = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'disk' || nt.includes('manageddisk') || nt.includes('disks');
  });

  for (const vm of vms) {
    const vmProps = vm.resource.properties || {};
    const hasDiskProp = vmProps.osDisk || vmProps.dataDisks || vmProps.disks || vmProps.disk;
    const hasDiskConnection = walk.connections.some(c =>
      (c.from.toLowerCase() === vm.resource.name.toLowerCase() || c.to.toLowerCase() === vm.resource.name.toLowerCase()) &&
      disks.some(d => d.resource.name.toLowerCase() === c.from.toLowerCase() || d.resource.name.toLowerCase() === c.to.toLowerCase())
    );

    if (!hasDiskProp && !hasDiskConnection && disks.length === 0) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'config',
        resourceId: vm.resource.id || vm.resource.name,
        resourceName: vm.resource.name,
        title: 'VM has no disk configuration',
        description: `VM "${vm.resource.name}" has no disk configuration specified. Consider adding OS disk and data disk specifications.`,
        autoFixPrompt: `Add disk configuration (OS disk type, size, and optionally data disks) to VM "${vm.resource.name}".`,
      });
    }
  }

  // ── Rule 2: Load Balancers should have backend pool targets ──
  const loadBalancers = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'loadbalancer' || nt.includes('loadbalancer');
  });

  for (const lb of loadBalancers) {
    const lbProps = lb.resource.properties || {};
    const hasBackendProp = lbProps.backendPool || lbProps.backendPools || lbProps.backendAddressPools;
    const hasBackendConnection = walk.connections.some(c =>
      c.from.toLowerCase() === lb.resource.name.toLowerCase() || c.to.toLowerCase() === lb.resource.name.toLowerCase()
    );

    if (!hasBackendProp && !hasBackendConnection) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        category: 'config',
        resourceId: lb.resource.id || lb.resource.name,
        resourceName: lb.resource.name,
        title: 'Load Balancer has no backend targets',
        description: `Load Balancer "${lb.resource.name}" has no backend pool targets configured or connected. It needs at least one backend target (VM, VMSS, etc.) to distribute traffic.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/load-balancer/backend-pool-management',
        autoFixPrompt: `Add backend pool targets (VMs or VMSS) to Load Balancer "${lb.resource.name}" and create connections to them.`,
      });
    }
  }

  // ── Rule 3: Application Gateway needs backend pool ──
  const appGateways = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt.includes('applicationgateway') || nt.includes('appgateway') || nt === 'appgw' || nt === 'agw';
  });

  for (const agw of appGateways) {
    const agwProps = agw.resource.properties || {};
    const hasBackend = agwProps.backendPool || agwProps.backendPools || agwProps.backendAddressPools || agwProps.backends;
    const hasBackendConnection = walk.connections.some(c =>
      c.from.toLowerCase() === agw.resource.name.toLowerCase() || c.to.toLowerCase() === agw.resource.name.toLowerCase()
    );

    if (!hasBackend && !hasBackendConnection) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        category: 'config',
        resourceId: agw.resource.id || agw.resource.name,
        resourceName: agw.resource.name,
        title: 'Application Gateway has no backend pool',
        description: `Application Gateway "${agw.resource.name}" has no backend pool configured or connected. It needs at least one backend target.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/application-gateway/application-gateway-components#backend-pools',
        autoFixPrompt: `Add backend pool targets to Application Gateway "${agw.resource.name}" and create connections to backend services.`,
      });
    }
  }

  // ── Rule 4: Key Vault should use private endpoints in production ──
  const keyVaults = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'keyvault' || nt.includes('keyvault');
  });

  for (const kv of keyVaults) {
    if (!hasPrivateEndpoints) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'network',
        resourceId: kv.resource.id || kv.resource.name,
        resourceName: kv.resource.name,
        title: 'Key Vault should use private endpoint',
        description: `Key Vault "${kv.resource.name}" doesn't have a private endpoint in the architecture. For production workloads, use private endpoints to secure Key Vault access.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/key-vault/general/private-link-service',
        autoFixPrompt: `Add a private endpoint for Key Vault "${kv.resource.name}" in the appropriate subnet and configure a Private DNS Zone for "privatelink.vaultcore.azure.net".`,
      });
    }
  }

  // ── Rule 5: SQL/CosmosDB should have private endpoints ──
  const databases = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt.includes('sql') || nt.includes('cosmosdb') || nt.includes('cosmos')
      || nt.includes('mysql') || nt.includes('postgresql') || nt.includes('mariadb')
      || nt.includes('documentdb');
  });

  for (const db of databases) {
    if (!hasPrivateEndpoints && !hasServiceEndpoints) {
      findings.push({
        id: nextId(),
        severity: 'warning',
        category: 'network',
        resourceId: db.resource.id || db.resource.name,
        resourceName: db.resource.name,
        title: 'Database should use private connectivity',
        description: `Database "${db.resource.name}" (${db.resource.type}) has no private endpoint or service endpoint in the architecture. Use private endpoints to prevent data exfiltration and meet compliance requirements.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/private-link/private-link-overview',
        autoFixPrompt: `Add a private endpoint for "${db.resource.name}" in the appropriate subnet.`,
      });
    }
  }

  // ── Rule 6: AKS needs its own subnet, min /24 recommended ──
  const aksResources = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'aks' || nt.includes('kubernetes') || nt.includes('managedcluster');
  });

  for (const aks of aksResources) {
    // Check if AKS is in a subnet
    if (aks.context.subnetName) {
      // Check subnet size
      const matchingSubnet = walk.subnets.find(s =>
        s.subnet.name === aks.context.subnetName &&
        s.vnetName === aks.context.vnetName
      );

      if (matchingSubnet?.subnet.addressPrefix) {
        const prefix = parseCIDRPrefix(matchingSubnet.subnet.addressPrefix);
        if (prefix !== null && prefix > 24) {
          findings.push({
            id: nextId(),
            severity: 'warning',
            category: 'sizing',
            resourceId: aks.resource.id || aks.resource.name,
            resourceName: aks.resource.name,
            title: 'AKS subnet should be at least /24',
            description: `AKS cluster "${aks.resource.name}" is in subnet "${aks.context.subnetName}" (/${prefix}). AKS with Azure CNI requires a large subnet (/24 or larger) to accommodate pod IPs.`,
            sourceUrl: 'https://learn.microsoft.com/en-us/azure/aks/azure-cni-overview#plan-ip-addressing-for-your-cluster',
            autoFixPrompt: `Change the AKS subnet "${aks.context.subnetName}" to at least /24 to accommodate AKS pod IPs.`,
          });
        }
      }

      // Check if other non-related resources share the subnet
      if (matchingSubnet) {
        const subnetResources = matchingSubnet.subnet.resources ?? [];
        const nonAKS = subnetResources.filter(r => {
          const nt = normaliseType(r.type);
          return nt !== 'aks' && !nt.includes('kubernetes') && !nt.includes('managedcluster');
        });
        if (nonAKS.length > 0) {
          findings.push({
            id: nextId(),
            severity: 'info',
            category: 'placement',
            resourceId: aks.resource.id || aks.resource.name,
            resourceName: aks.resource.name,
            title: 'AKS should ideally have a dedicated subnet',
            description: `AKS cluster "${aks.resource.name}" shares subnet "${aks.context.subnetName}" with ${nonAKS.length} other resource(s). AKS works best with a dedicated subnet for IP management.`,
            sourceUrl: 'https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni',
            autoFixPrompt: `Move AKS cluster "${aks.resource.name}" to its own dedicated subnet with at least /24 address space.`,
          });
        }
      }
    }
  }

  // ── Rule 7: Container Registry should be paired with AKS ──
  const acrs = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'containerregistry' || nt.includes('containerregistry') || nt === 'acr';
  });

  if (aksResources.length > 0 && acrs.length === 0) {
    findings.push({
      id: nextId(),
      severity: 'info',
      category: 'config',
      resourceId: aksResources[0].resource.id || aksResources[0].resource.name,
      resourceName: aksResources[0].resource.name,
      title: 'AKS without Container Registry',
      description: 'AKS cluster found but no Azure Container Registry (ACR) in the architecture. Consider adding one for container image management.',
      sourceUrl: 'https://learn.microsoft.com/en-us/azure/aks/cluster-container-registry-integration',
      autoFixPrompt: 'Add an Azure Container Registry (ACR) and attach it to the AKS cluster.',
    });
  }

  // ── Rule 8: App Service should have App Service Plan ──
  const appServices = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'appservice' || nt.includes('webapp') ||
      (nt.includes('web/sites') && !nt.includes('function'));
  });
  const appServicePlans = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt.includes('appserviceplan') || nt.includes('serverfarm');
  });

  if (appServices.length > 0 && appServicePlans.length === 0) {
    findings.push({
      id: nextId(),
      severity: 'info',
      category: 'config',
      resourceId: appServices[0].resource.id || appServices[0].resource.name,
      resourceName: appServices[0].resource.name,
      title: 'App Service without App Service Plan',
      description: 'App Service found but no App Service Plan is defined. Every App Service requires an App Service Plan that defines compute resources.',
      sourceUrl: 'https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans',
      autoFixPrompt: 'Add an App Service Plan for the App Service(s) in the architecture.',
    });
  }

  // ── Rule 9: Redis Cache should use private endpoint ──
  const redisResources = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'redis' || nt.includes('cache/redis');
  });

  for (const redis of redisResources) {
    if (!hasPrivateEndpoints) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'network',
        resourceId: redis.resource.id || redis.resource.name,
        resourceName: redis.resource.name,
        title: 'Redis Cache should use private endpoint',
        description: `Redis Cache "${redis.resource.name}" doesn't have a private endpoint. For production, use private endpoints to secure Redis access.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-private-link',
        autoFixPrompt: `Add a private endpoint for Redis Cache "${redis.resource.name}".`,
      });
    }
  }

  // ── Rule 10: Storage Account should use private endpoint in production ──
  const storageAccounts = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt === 'storageaccount' || nt.includes('storageaccount');
  });

  for (const sa of storageAccounts) {
    if (!hasPrivateEndpoints) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'network',
        resourceId: sa.resource.id || sa.resource.name,
        resourceName: sa.resource.name,
        title: 'Storage Account should use private endpoint',
        description: `Storage Account "${sa.resource.name}" doesn't have a private endpoint. For production, use private endpoints to prevent data exfiltration.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/storage/common/storage-private-endpoints',
        autoFixPrompt: `Add a private endpoint for Storage Account "${sa.resource.name}" in the appropriate subnet.`,
      });
    }
  }

  // ── Rule 11: VMs should be in availability set or zone for HA ──
  for (const vm of vms) {
    const vmProps = vm.resource.properties || {};
    const inAvZone = vmProps.availabilityZone || vmProps.zone;
    const inAvSet = vmProps.availabilitySet;
    const inVMSS = walk.resources.some(r => normaliseType(r.resource.type).includes('scaleset'));

    if (!inAvZone && !inAvSet && !inVMSS && vms.length > 1) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'config',
        resourceId: vm.resource.id || vm.resource.name,
        resourceName: vm.resource.name,
        title: 'VM not in availability zone or set',
        description: `VM "${vm.resource.name}" is not configured with an availability zone or availability set. For high availability, place VMs in availability zones or availability sets.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/virtual-machines/availability',
        autoFixPrompt: `Configure VM "${vm.resource.name}" with an availability zone (zone 1, 2, or 3) for high availability.`,
      });
    }
  }

  // ── Rule 12: API Management should be in a subnet (VNet integration) ──
  const apimResources = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt.includes('apimanagement') || nt === 'apim';
  });

  for (const apim of apimResources) {
    if (!apim.context.subnetName) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'placement',
        resourceId: apim.resource.id || apim.resource.name,
        resourceName: apim.resource.name,
        title: 'API Management not in a VNet',
        description: `API Management "${apim.resource.name}" is not deployed in a VNet subnet. For production, deploy APIM in a VNet for network isolation.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/api-management/virtual-network-concepts',
        autoFixPrompt: `Deploy API Management "${apim.resource.name}" in a dedicated subnet within the VNet.`,
      });
    }
  }

  // ── Rule 13: SQL Managed Instance must be in a dedicated subnet ──
  const sqlMIs = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt.includes('sqlmanagedinstance') || nt.includes('managedinstance');
  });

  for (const mi of sqlMIs) {
    if (!mi.context.subnetName) {
      findings.push({
        id: nextId(),
        severity: 'error',
        category: 'placement',
        resourceId: mi.resource.id || mi.resource.name,
        resourceName: mi.resource.name,
        title: 'SQL Managed Instance must be in a subnet',
        description: `SQL Managed Instance "${mi.resource.name}" must be deployed in a dedicated VNet subnet. This is a hard requirement.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/azure-sql/managed-instance/vnet-existing-add-subnet',
        autoFixPrompt: `Place SQL Managed Instance "${mi.resource.name}" in a dedicated subnet with at least /27 address space.`,
      });
    }

    // Check if the subnet is dedicated
    if (mi.context.subnetName) {
      const matchingSubnet = walk.subnets.find(s => s.subnet.name === mi.context.subnetName);
      if (matchingSubnet) {
        const otherResources = (matchingSubnet.subnet.resources ?? []).filter(r => {
          const nt = normaliseType(r.type);
          return !nt.includes('sqlmanagedinstance') && !nt.includes('managedinstance');
        });
        if (otherResources.length > 0) {
          findings.push({
            id: nextId(),
            severity: 'error',
            category: 'placement',
            resourceId: mi.resource.id || mi.resource.name,
            resourceName: mi.resource.name,
            title: 'SQL Managed Instance subnet must be dedicated',
            description: `SQL Managed Instance "${mi.resource.name}" is in subnet "${mi.context.subnetName}" with other resources. SQL MI requires a dedicated subnet with no other services.`,
            sourceUrl: 'https://learn.microsoft.com/en-us/azure/azure-sql/managed-instance/vnet-existing-add-subnet',
            autoFixPrompt: `Move SQL Managed Instance "${mi.resource.name}" to its own dedicated subnet.`,
          });
        }
      }
    }
  }

  // ── Rule 14: Recovery Services Vault for VM backup ──
  if (vms.length > 0) {
    const hasRecoveryVault = walk.resources.some(r => {
      const nt = normaliseType(r.resource.type);
      return nt.includes('recoveryvault') || nt.includes('recoveryservices') || nt.includes('backupvault');
    });
    if (!hasRecoveryVault) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'config',
        resourceId: 'architecture',
        resourceName: 'Architecture',
        title: 'No backup solution for VMs',
        description: `The architecture has ${vms.length} VM(s) but no Recovery Services Vault or Backup Vault for backup. Consider adding Azure Backup.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/backup/backup-azure-vms-first-look-arm',
        autoFixPrompt: 'Add a Recovery Services Vault and configure backup for the VMs in the architecture.',
      });
    }
  }

  // ── Rule 15: Event Hub / Service Bus should consider premium for production ──
  const messagingResources = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt.includes('eventhub') || nt.includes('servicebus');
  });

  for (const msg of messagingResources) {
    if (!hasPrivateEndpoints) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'network',
        resourceId: msg.resource.id || msg.resource.name,
        resourceName: msg.resource.name,
        title: 'Messaging service should use private endpoint',
        description: `${msg.resource.type} "${msg.resource.name}" doesn't have a private endpoint. For production, use private endpoints for secure access.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/service-bus-messaging/private-link-service',
        autoFixPrompt: `Add a private endpoint for "${msg.resource.name}" in the appropriate subnet.`,
      });
    }
  }

  // ── Rule 16: Azure OpenAI / Cognitive Services should use private endpoint ──
  const aiResources = walk.resources.filter(r => {
    const nt = normaliseType(r.resource.type);
    return nt.includes('openai') || nt.includes('cognitiveservices') || nt.includes('aisearch');
  });

  for (const ai of aiResources) {
    if (!hasPrivateEndpoints) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'network',
        resourceId: ai.resource.id || ai.resource.name,
        resourceName: ai.resource.name,
        title: 'AI service should use private endpoint',
        description: `${ai.resource.type} "${ai.resource.name}" should use a private endpoint for production workloads to prevent data exfiltration.`,
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/cognitive-services-virtual-networks',
        autoFixPrompt: `Add a private endpoint for "${ai.resource.name}" in the appropriate subnet.`,
      });
    }
  }

  // ── Rule 17: Monitoring - App Insights / Log Analytics recommended ──
  {
    const hasMonitoring = walk.resources.some(r => {
      const nt = normaliseType(r.resource.type);
      return nt.includes('appinsights') || nt.includes('applicationinsights')
        || nt.includes('loganalytics') || nt.includes('monitor');
    });

    if (!hasMonitoring && walk.resources.length > 5) {
      findings.push({
        id: nextId(),
        severity: 'info',
        category: 'config',
        resourceId: 'architecture',
        resourceName: 'Architecture',
        title: 'No monitoring solution detected',
        description: 'The architecture has no Application Insights or Log Analytics workspace. Consider adding monitoring for observability.',
        sourceUrl: 'https://learn.microsoft.com/en-us/azure/azure-monitor/overview',
        autoFixPrompt: 'Add a Log Analytics workspace and Application Insights for monitoring the architecture.',
      });
    }
  }

  return findings;
}
