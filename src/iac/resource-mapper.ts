/**
 * Resource Mapper
 *
 * Traverses an Architecture object and produces a flat list of IaCResource
 * objects grouped by category, with inferred dependencies and naming
 * conventions.
 */

import type { Architecture, Resource, VNet, Subnet, ResourceGroup, Region, Subscription, Connection } from '../schema/types.js';
import { RESOURCES, type ResourceCategory } from '../schema/resources.js';
import type { IaCResource, IaCCategory, IaCModule, IaCOutput } from './types.js';
import { hasAvmBicepModule } from './bicep/avm-registry.js';

// ─── Naming helpers ───────────────────────────────────────────────

/** Region display name → short code used in naming conventions */
const REGION_CODES: Record<string, string> = {
  'west europe': 'weu', 'westeurope': 'weu',
  'east us': 'eus', 'eastus': 'eus',
  'east us 2': 'eus2', 'eastus2': 'eus2',
  'west us': 'wus', 'westus': 'wus',
  'west us 2': 'wus2', 'westus2': 'wus2',
  'west us 3': 'wus3', 'westus3': 'wus3',
  'central us': 'cus', 'centralus': 'cus',
  'north europe': 'neu', 'northeurope': 'neu',
  'uk south': 'uks', 'uksouth': 'uks',
  'uk west': 'ukw', 'ukwest': 'ukw',
  'japan east': 'jpe', 'japaneast': 'jpe',
  'japan west': 'jpw', 'japanwest': 'jpw',
  'southeast asia': 'sea', 'southeastasia': 'sea',
  'east asia': 'ea', 'eastasia': 'ea',
  'australia east': 'aue', 'australiaeast': 'aue',
  'canada central': 'cac', 'canadacentral': 'cac',
  'germany west central': 'gwc', 'germanywestcentral': 'gwc',
  'france central': 'frc', 'francecentral': 'frc',
  'south central us': 'scus', 'southcentralus': 'scus',
  'north central us': 'ncus', 'northcentralus': 'ncus',
  'brazil south': 'brs', 'brazilsouth': 'brs',
  'korea central': 'krc', 'koreacentral': 'krc',
  'sweden central': 'swc', 'swedencentral': 'swc',
};

/** Resource type key → short prefix for naming */
const TYPE_PREFIXES: Record<string, string> = {
  vm: 'vm', vmss: 'vmss', aks: 'aks', appService: 'app', functionApp: 'func',
  containerApp: 'ca', containerAppEnv: 'cae', containerRegistry: 'acr',
  containerInstance: 'ci', appServicePlan: 'asp', disk: 'disk', avd: 'avd',
  vnet: 'vnet', hubVnet: 'vnet', subnet: 'snet', nsg: 'nsg',
  loadBalancer: 'lb', appGateway: 'agw', firewall: 'afw',
  bastion: 'bas', vpnGateway: 'vgw', nat: 'ng', publicIp: 'pip',
  privateEndpoint: 'pep', dns: 'dns', privateDns: 'pdns',
  frontDoor: 'afd', cdn: 'cdn', trafficManager: 'traf',
  routeTable: 'rt', waf: 'waf', ddosProtection: 'ddos',
  expressRoute: 'erc', vwan: 'vwan', vhub: 'vhub',
  storageAccount: 'st', dataLake: 'dl', netAppFiles: 'anf',
  cosmosDb: 'cosmos', sqlServer: 'sql', sqlDatabase: 'sqldb',
  sqlManagedInstance: 'sqlmi', mysql: 'mysql', postgresql: 'psql',
  postgresqlFlex: 'psql', redis: 'redis', dataExplorer: 'adx',
  keyVault: 'kv', defender: 'def', sentinel: 'sent',
  apiManagement: 'apim', serviceBus: 'sb', eventHub: 'evh',
  eventGrid: 'evg', logicApp: 'logic', appConfig: 'appcs',
  openAI: 'oai', cognitiveServices: 'cog', aiSearch: 'srch',
  machineLearning: 'mlw', botService: 'bot',
  databricks: 'dbw', synapse: 'syn', dataFactory: 'adf',
  streamAnalytics: 'asa', purview: 'pview',
  appInsights: 'appi', logAnalytics: 'log', monitor: 'mon', grafana: 'graf',
  recoveryVault: 'rsv', automationAccount: 'aa', managedIdentity: 'id',
  signalR: 'sigr', staticWebApp: 'swa',
  iotHub: 'iot', iotCentral: 'iotc', digitalTwins: 'dt',
};

function sanitize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/^([0-9])/, '_$1');
}

function iacName(type: string, name: string, regionCode: string, _env: string): string {
  const prefix = TYPE_PREFIXES[type] || (type ? type.substring(0, 4) : 'res');
  const short = sanitize(name).substring(0, 20);
  const parts = [prefix, short];
  // Bug #8: Only append region code if the name doesn't already end with it
  if (regionCode && !short.endsWith(regionCode)) {
    parts.push(regionCode);
  }
  return parts.join('-');
}

// ─── Category mapping ─────────────────────────────────────────────

function mapCategory(cat: ResourceCategory): IaCCategory {
  if (cat === 'hierarchy' || cat === 'migration' || cat === 'devops') return 'other';
  return cat as IaCCategory;
}

// ─── Architecture traversal ───────────────────────────────────────

interface CollectedResource {
  resource: Resource | VNet;
  regionCode: string;
  rgName?: string;
}

function collectFromSubnet(subnet: Subnet, regionCode: string, rgName?: string): CollectedResource[] {
  const results: CollectedResource[] = [];
  if (subnet.resources) {
    for (const r of subnet.resources) {
      results.push({ resource: r, regionCode, rgName });
    }
  }
  if (subnet.availabilityZones) {
    for (const az of subnet.availabilityZones) {
      for (const r of az.resources) {
        results.push({ resource: r, regionCode, rgName });
      }
    }
  }
  return results;
}

function collectFromVNet(vnet: VNet, regionCode: string, rgName?: string): CollectedResource[] {
  const results: CollectedResource[] = [{ resource: vnet, regionCode, rgName }];
  if (vnet.subnets) {
    for (const s of vnet.subnets) {
      // Ensure subnet has type set (may be missing from raw JSON input)
      const subnetAsResource = { ...s, type: s.type || 'subnet' } as unknown as Resource;
      results.push({ resource: subnetAsResource, regionCode, rgName });
      results.push(...collectFromSubnet(s, regionCode, rgName));
    }
  }
  return results;
}

function collectFromResourceGroup(rg: ResourceGroup, regionCode: string): CollectedResource[] {
  const results: CollectedResource[] = [];
  for (const r of rg.resources) {
    if (r.type === 'vnet' || r.type === 'hubVnet') {
      results.push(...collectFromVNet(r as VNet, regionCode, rg.name));
    } else {
      results.push({ resource: r, regionCode, rgName: rg.name });
    }
  }
  return results;
}

function collectFromRegion(region: Region): CollectedResource[] {
  const results: CollectedResource[] = [];
  const code = REGION_CODES[region.name.toLowerCase()] || REGION_CODES[region.code?.toLowerCase() || ''] || sanitize(region.name).substring(0, 4);
  if (region.resourceGroups) {
    for (const rg of region.resourceGroups) {
      results.push(...collectFromResourceGroup(rg, code));
    }
  }
  if (region.resources) {
    for (const r of region.resources) {
      if (r.type === 'vnet' || r.type === 'hubVnet') {
        results.push(...collectFromVNet(r as VNet, code));
      } else {
        results.push({ resource: r, regionCode: code });
      }
    }
  }
  return results;
}

function collectFromSubscription(sub: Subscription): CollectedResource[] {
  const results: CollectedResource[] = [];
  if (sub.regions) {
    for (const r of sub.regions) {
      results.push(...collectFromRegion(r));
    }
  }
  if (sub.resourceGroups) {
    for (const rg of sub.resourceGroups) {
      results.push(...collectFromResourceGroup(rg, ''));
    }
  }
  return results;
}

/** Main entry point: flatten architecture into IaCResource list */
export function mapArchitectureToResources(arch: Architecture): IaCResource[] {
  const collected: CollectedResource[] = [];

  if (arch.subscriptions) {
    for (const sub of arch.subscriptions) {
      collected.push(...collectFromSubscription(sub));
    }
  }
  if (arch.subscription) {
    collected.push(...collectFromSubscription(arch.subscription));
  }
  if (arch.regions) {
    for (const r of arch.regions) {
      collected.push(...collectFromRegion(r));
    }
  }
  if (arch.globalResources) {
    for (const r of arch.globalResources) {
      collected.push({ resource: r, regionCode: '' });
    }
  }
  if (arch.onPremises) {
    for (const op of arch.onPremises) {
      if (op.resources) {
        for (const r of op.resources) {
          collected.push({ resource: r, regionCode: '' });
        }
      }
    }
  }
  // Handle pages
  if (arch.pages) {
    for (const page of arch.pages) {
      if (page.regions) {
        for (const r of page.regions) {
          collected.push(...collectFromRegion(r));
        }
      }
      if (page.subscription) {
        collected.push(...collectFromSubscription(page.subscription));
      }
      if (page.resourceGroups) {
        for (const rg of page.resourceGroups) {
          collected.push(...collectFromResourceGroup(rg, ''));
        }
      }
      if (page.globalResources) {
        for (const r of page.globalResources) {
          collected.push({ resource: r, regionCode: '' });
        }
      }
    }
  }

  // De-duplicate by name+type
  const seen = new Set<string>();
  const unique: CollectedResource[] = [];
  for (const c of collected) {
    const key = `${c.resource.type}::${c.resource.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }

  // Build connection map from architecture
  const connections = collectConnections(arch);
  const connectionMap = buildConnectionMap(connections);

  // Convert to IaCResource
  const resources: IaCResource[] = [];
  const nameToId = new Map<string, string>();
  // Track VNet names to identifiers for parenting subnets
  const vnetNameToId = new Map<string, string>();

  // First pass: create VNet resources to establish name→id mapping
  for (const c of unique) {
    const r = c.resource;
    if (r.type === 'vnet' || r.type === 'hubVnet') {
      const name = iacName(r.type, r.name, c.regionCode, '');
      const id = toIdentifier(name);
      vnetNameToId.set(r.name, id);
    }
  }

  // Track which VNet owns each subnet (by subnet name)
  const subnetToVnet = new Map<string, string>();
  for (const c of unique) {
    const r = c.resource;
    if ((r.type === 'vnet' || r.type === 'hubVnet') && (r as VNet).subnets) {
      for (const s of (r as VNet).subnets!) {
        subnetToVnet.set(s.name, r.name);
      }
    }
  }

  for (const c of unique) {
    const r = c.resource;
    const rType = r.type;
    const resDef = RESOURCES[rType];
    const cat: IaCCategory = resDef ? mapCategory(resDef.category) : 'other';

    // Skip hierarchy-only types
    if (['region', 'subscription', 'resourceGroup', 'onPremises', 'availabilityZone', 'managementGroup'].includes(rType)) {
      continue;
    }

    const name = iacName(rType, r.name, c.regionCode, '');
    const id = toIdentifier(name);
    nameToId.set(r.name, id);

    const iacResource: IaCResource = {
      resourceType: rType,
      name: r.name,
      identifier: id,
      iacName: name,
      category: cat,
      properties: r.properties || {},
      dependsOn: [],
      connectedTo: [...(r.connectedTo || []), ...(connectionMap.get(r.name) || [])],
      containedIn: (r as Resource).containedIn,
      isAvmModule: hasAvmBicepModule(rType),
    };

    // For VNets, carry architecture subnet definitions and address space
    if (rType === 'vnet' || rType === 'hubVnet') {
      const vnet = r as VNet;
      if (vnet.subnets) {
        iacResource.architectureSubnets = vnet.subnets.map(s => ({
          name: s.name,
          addressPrefix: s.addressPrefix,
          resources: s.resources?.map(sr => ({ type: sr.type, name: sr.name })),
        }));
      }
      if (vnet.addressSpace) {
        iacResource.addressSpace = vnet.addressSpace;
      }
    }

    // For subnets, track parent VNet
    if (rType === 'subnet') {
      const parentVNetName = subnetToVnet.get(r.name);
      if (parentVNetName) {
        const parentId = vnetNameToId.get(parentVNetName);
        if (parentId) {
          iacResource.parentVNetIdentifier = parentId;
        }
      }
    }

    resources.push(iacResource);
  }

  // Resolve dependencies from connections and containment
  inferDependencies(resources, nameToId);

  return resources;
}

function collectConnections(arch: Architecture): Connection[] {
  const connections: Connection[] = [...(arch.connections || [])];
  if (arch.pages) {
    for (const page of arch.pages) {
      if (page.connections) {
        connections.push(...page.connections);
      }
    }
  }
  return connections;
}

function buildConnectionMap(connections: Connection[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const c of connections) {
    if (!map.has(c.from)) map.set(c.from, []);
    map.get(c.from)!.push(c.to);
    if (c.bidirectional) {
      if (!map.has(c.to)) map.set(c.to, []);
      map.get(c.to)!.push(c.from);
    }
  }
  return map;
}

/** Dependency inference rules */
const DEPENDENCY_ORDER: Record<string, string[]> = {
  // Networking first
  vnet: [],
  hubVnet: [],
  subnet: ['vnet', 'hubVnet', 'nsg', 'routeTable'],
  nsg: [],
  routeTable: [],
  nat: ['publicIp'],
  // Then security
  keyVault: [],
  managedIdentity: [],
  // Then compute (depends on networking)
  vm: ['vnet', 'hubVnet', 'subnet', 'nsg', 'loadBalancer'],
  vmss: ['vnet', 'hubVnet', 'subnet', 'loadBalancer'],
  aks: ['vnet', 'hubVnet', 'subnet', 'logAnalytics'],
  appService: ['appServicePlan', 'vnet', 'hubVnet', 'subnet'],
  functionApp: ['appServicePlan', 'storageAccount'],
  containerApp: ['containerAppEnv'],
  containerAppEnv: ['logAnalytics', 'vnet', 'hubVnet', 'subnet'],
  // Databases
  sqlServer: ['vnet', 'hubVnet', 'privateEndpoint'],
  cosmosDb: ['vnet', 'hubVnet', 'privateEndpoint'],
  redis: ['vnet', 'hubVnet', 'privateEndpoint'],
  // Gateways on networking
  firewall: ['vnet', 'hubVnet', 'publicIp'],
  appGateway: ['vnet', 'hubVnet', 'subnet', 'publicIp'],
  bastion: ['vnet', 'hubVnet', 'publicIp'],
  vpnGateway: ['vnet', 'hubVnet', 'publicIp'],
  loadBalancer: ['publicIp'],
  // Private connectivity
  privateEndpoint: ['vnet', 'hubVnet', 'subnet'],
  // Monitoring
  appInsights: ['logAnalytics'],
  // AI
  openAI: ['privateEndpoint'],
  machineLearning: ['storageAccount', 'keyVault', 'appInsights'],
};

function inferDependencies(resources: IaCResource[], nameToId: Map<string, string>): void {
  const idSet = new Set(resources.map(r => r.identifier));
  const typeToIds = new Map<string, string[]>();
  for (const r of resources) {
    if (!typeToIds.has(r.resourceType)) typeToIds.set(r.resourceType, []);
    typeToIds.get(r.resourceType)!.push(r.identifier);
  }

  for (const r of resources) {
    const depTypes = DEPENDENCY_ORDER[r.resourceType] || [];
    for (const depType of depTypes) {
      const ids = typeToIds.get(depType) || [];
      for (const id of ids) {
        if (id !== r.identifier && !r.dependsOn.includes(id)) {
          r.dependsOn.push(id);
        }
      }
    }

    // Resolve connectedTo names to identifiers
    for (const name of r.connectedTo) {
      const id = nameToId.get(name);
      if (id && id !== r.identifier && !r.dependsOn.includes(id)) {
        r.dependsOn.push(id);
      }
    }
  }
}

// ─── Module grouping ──────────────────────────────────────────────

const MODULE_ORDER: IaCCategory[] = [
  'networking', 'security', 'identity', 'monitoring', 'storage',
  'databases', 'compute', 'integration', 'ai', 'analytics',
  'web', 'iot', 'management', 'other',
];

export function groupResourcesIntoModules(resources: IaCResource[]): IaCModule[] {
  const categoryMap = new Map<IaCCategory, IaCResource[]>();
  for (const r of resources) {
    if (!categoryMap.has(r.category)) categoryMap.set(r.category, []);
    categoryMap.get(r.category)!.push(r);
  }

  const modules: IaCModule[] = [];
  const moduleCategories = new Set<IaCCategory>();

  for (const cat of MODULE_ORDER) {
    const res = categoryMap.get(cat);
    if (!res || res.length === 0) continue;
    moduleCategories.add(cat);

    // Determine module dependencies
    const depModules = new Set<string>();
    for (const r of res) {
      for (const depId of r.dependsOn) {
        const depResource = resources.find(rr => rr.identifier === depId);
        if (depResource && depResource.category !== cat) {
          depModules.add(depResource.category);
        }
      }
    }

    // Generate outputs for the module
    const outputs = generateModuleOutputs(res, cat);

    modules.push({
      name: cat,
      category: cat,
      resources: res,
      dependsOnModules: Array.from(depModules),
      outputs,
    });
  }

  return modules;
}

function generateModuleOutputs(resources: IaCResource[], category: IaCCategory): IaCOutput[] {
  const outputs: IaCOutput[] = [];

  for (const r of resources) {
    // Bug #6: Skip subnet resources — they'll be inlined into VNet modules
    if (r.resourceType === 'subnet') continue;

    // Bug #1: Use .outputs.resourceId for AVM modules, .id for raw resources
    const isAvm = r.isAvmModule === true;
    const idRef = isAvm ? `${r.identifier}.outputs.resourceId` : `${r.identifier}.id`;

    // Add resource ID output
    outputs.push({
      name: `${r.identifier}Id`,
      value: idRef,
      description: `Resource ID of ${r.name}`,
    });

    // Add type-specific outputs (only for AVM modules that have these outputs)
    if (isAvm && (r.resourceType === 'vnet' || r.resourceType === 'hubVnet')) {
      outputs.push({
        name: `${r.identifier}DefaultSubnetId`,
        value: `${r.identifier}.outputs.subnetResourceIds[0]`,
        description: `Default subnet ID for ${r.name}`,
      });
    }
    if (isAvm && r.resourceType === 'storageAccount') {
      outputs.push({
        name: `${r.identifier}PrimaryBlobEndpoint`,
        value: `${r.identifier}.outputs.primaryBlobEndpoint`,
        description: `Primary blob endpoint for ${r.name}`,
      });
    }
    if (isAvm && r.resourceType === 'keyVault') {
      outputs.push({
        name: `${r.identifier}Uri`,
        value: `${r.identifier}.outputs.uri`,
        description: `Key Vault URI for ${r.name}`,
      });
    }
    if (isAvm && r.resourceType === 'aks') {
      outputs.push({
        name: `${r.identifier}Fqdn`,
        value: `${r.identifier}.outputs.controlPlaneFQDN`,
        description: `AKS control plane FQDN for ${r.name}`,
      });
    }
  }

  return outputs;
}
