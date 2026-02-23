/**
 * AI Parser - Converts natural language to structured architecture
 * Supports complex multi-region, hub-spoke, and HA scenarios
 */

import type { Architecture, Region, VNet, Subnet, Resource, ResourceGroup, OnPremises, Connection, DiagramPage } from '../schema/types.js';
import { resolveResourceType, RESOURCES, CONTAINER_STYLES } from '../schema/resources.js';
import type { GenericArchitecture } from '../schema/generic-types.js';

export interface AIProvider {
  name: string;
  parse(prompt: string): Promise<ParsedResponse>;
}

export interface ParsedResponse {
  title?: string;
  description?: string;
  animation?: {
    enabled: boolean;
    defaultStyle?: 'flow' | 'pulse' | 'marching' | 'glow';
    speed?: 'slow' | 'normal' | 'fast';
  };
  resources: Array<{
    type: string;
    name: string;
    count?: number;
    containedIn?: string;
    region?: string;
    subscription?: string;
    properties?: Record<string, unknown>;
  }>;
  connections?: Array<{
    from: string;
    to: string;
    style?: string;
    label?: string;
    animated?: boolean;
    animationStyle?: 'flow' | 'pulse' | 'marching' | 'glow';
    animationColor?: string;
  }>;
  regions?: string[];
  subscriptions?: Array<{
    name: string;
    regions?: string[];
  }>;
  hasOnPremises?: boolean;
  architecture?: 'simple' | 'hub-spoke' | 'multi-region' | 'ha' | 'multi-page';
  pages?: Array<{
    name: string;
    description?: string;
    resources: Array<{
      type: string;
      name: string;
      count?: number;
      containedIn?: string;
      region?: string;
      subscription?: string;
      properties?: Record<string, unknown>;
    }>;
    connections?: Array<{
      from: string;
      to: string;
      style?: string;
      label?: string;
      animated?: boolean;
      animationStyle?: 'flow' | 'pulse' | 'marching' | 'glow';
      animationColor?: string;
    }>;
    regions?: string[];
    hasOnPremises?: boolean;
  }>;
}

/**
 * System prompt for the AI to understand architecture requests
 */
export const SYSTEM_PROMPT = `You are an Azure architecture parser. Convert natural language descriptions into structured JSON for generating Draw.io diagrams.

Output ONLY valid JSON with this structure:
{
  "architecture": "hub-spoke|multi-region|ha|simple",
  "title": "Architecture Title",
  "description": "A comprehensive explanation of this architecture: what it does, why this design was chosen, key design decisions, and important considerations. This should be 3-6 sentences providing valuable context.",
  "regions": ["West Europe", "North Europe"],
  "hasOnPremises": true,
  "subscriptions": [
    { "name": "Hub Subscription", "regions": ["West Europe", "North Europe"] },
    { "name": "Data Platform Subscription", "regions": ["West Europe"] }
  ],
  "resources": [
    { "type": "hubVnet", "name": "vnet-hub-weu", "region": "West Europe", "subscription": "Hub Subscription", "properties": { "addressSpace": "10.0.0.0/16" } },
    { "type": "firewall", "name": "fw-hub-weu", "containedIn": "AzureFirewallSubnet", "region": "West Europe" },
    { "type": "vpnGateway", "name": "ergw-hub-weu", "containedIn": "GatewaySubnet", "region": "West Europe", "properties": { "sku": "ErGw1AZ", "gatewayType": "ExpressRoute" } },
    { "type": "expressRoute", "name": "er-primary", "region": "West Europe", "properties": { "bandwidth": "1 Gbps" } },
    { "type": "vnet", "name": "vnet-spoke-prod", "region": "West Europe", "properties": { "addressSpace": "10.1.0.0/16" } },
    { "type": "nsg", "name": "nsg-web-weu", "region": "West Europe" },
    { "type": "vm", "name": "vm-web", "count": 3, "containedIn": "subnet-web", "region": "West Europe", "properties": { "vmSize": "Standard_D4s_v5" } },
    { "type": "fabric", "name": "fabric-analytics", "region": "West Europe", "subscription": "Data Platform Subscription" }
  ],
  "connections": [
    { "from": "er-primary", "to": "ergw-hub-weu", "style": "expressroute", "label": "ExpressRoute" },
    { "from": "er-primary", "to": "On-Premises", "style": "expressroute", "label": "On-Prem Link" },
    { "from": "vnet-hub-weu", "to": "vnet-spoke-prod", "style": "peering" }
  ]
}

Resource types available (use these exact names):
NETWORKING: vnet, hubVnet, subnet, nsg, asg, loadBalancer, appGateway, firewall, firewallPolicy, bastion, vpnGateway, expressRoute, expressRouteDirect, vwan, vhub, privateEndpoint, privateLink, publicIp, publicIpPrefix, nat, frontDoor, trafficManager, cdn, routeTable, routeFilter, localNetworkGateway, connection, ddosProtection, dns, privateDns, networkWatcher, networkManager, nic
COMPUTE: vm, vmss, aks, containerInstance, containerApp, containerAppEnv, containerRegistry, functionApp, appService, appServicePlan, avd, disk, serviceFabric, batch, springApp
SAP: sapHana, sapNetWeaver, sapApp, sapRouter, sapWebDispatcher, hanaLargeInstance
STORAGE: storageAccount, dataLake, netAppFiles, elasticSan
DATABASES: cosmosDb, sqlServer, sqlDatabase, sqlManagedInstance, sqlElasticPool, sqlVm, mysql, postgresql, postgresqlFlex, mariadb, redis, dataExplorer, dms
SECURITY: keyVault, nsg, waf, defender, sentinel, managedIdentity
INTEGRATION: apiManagement, serviceBus, eventHub, eventGrid, logicApp, appConfig, integrationAccount, relay, signalR
AI: openAI, cognitiveServices, machineLearning, botService, aiSearch, aiFoundry, documentIntelligence, speechService, computerVision, languageService, contentSafety
ANALYTICS: databricks, synapse, purview, dataFactory, streamAnalytics, hdInsight, analysisServices, powerBiEmbedded, fabric
MONITORING: appInsights, logAnalytics, grafana, monitor, actionGroup
IDENTITY: azureAd, managedIdentity
IOT: iotHub, iotCentral, digitalTwins
DEVOPS: devops
WEB: staticWebApp, notificationHub, communicationService
MANAGEMENT: recoveryVault, automationAccount, arcMachine, backupCenter, policy, advisor, migrate

Connection styles: solid, dashed, expressroute, vpn, peering, animated

Animation support:
- When the user asks for "animated", "flowing", "live", or "dynamic" diagrams, add "animation": { "enabled": true } at the top level and/or set "animated": true on individual connections.
- When animation.enabled is true, ALL connections will be animated by default (flowing dots along paths) — this looks great when opened in draw.io.
- You can set "animationStyle" on individual connections: "flow" (flowing dot — default, most impressive), "pulse" (thick pulsing lines), "marching" (classic dashed animation), "glow" (glowing flow with shadow).
- Use "animationColor" on a connection to override its color. Semantic colors: "#2196F3" (blue, primary), "#4CAF50" (green, success), "#FF9800" (orange, warning), "#F44336" (red, error), "#9C27B0" (purple, data), "#00BCD4" (cyan, control), "#FF5722" (deep orange, async), "#E91E63" (pink, AI/ML).
- Example connection with animation: { "from": "api-gateway", "to": "backend", "label": "API calls", "animated": true, "animationStyle": "flow", "animationColor": "#2196F3" }
- For the top-level animation config: { "animation": { "enabled": true, "defaultStyle": "flow" } }
- If the user does NOT ask for animation, omit the animation field entirely.

Architecture patterns to recognize:
- "hub and spoke" or "hub-spoke" → Create hub VNET with firewall/gateway, spoke VNETs peered to hub
- "HA" or "high availability" or "dual region" → Create resources in 2 regions with failover
- "ExpressRoute" → Add ER circuit and on-premises connection
- "private endpoint" or "private connectivity" → Use private endpoints for PaaS services
- "zone redundant" or "availability zones" → Distribute VMs/VMSS across availability zones using properties.availabilityZone
- "separate subscription" or "dedicated subscription" → Use the subscriptions array and set the "subscription" field on resources to group them
- "SAP" or "SAP on Azure" → Use sapHana for database VMs, sapApp/sapNetWeaver for application servers, sapWebDispatcher for web dispatchers, sapRouter for routers. SAP typically needs: large VMs (M-series for HANA, E-series for app), ANF/NetApp Files or Elastic SAN for shared storage, proximity placement groups, availability sets/zones
- "AVD" or "Virtual Desktop" → Use avd type. Typically includes: host pool VMs, session hosts, Azure Files/NetApp for profiles, Active Directory

Rules:
1. Hub VNETs get: GatewaySubnet, AzureFirewallSubnet, AzureBastionSubnet — always include firewall, bastion, and VPN gateway resources in those subnets
2. Spoke VNETs get: subnet-web, subnet-app, subnet-data (or as specified)
3. For HA: mirror resources in both regions
4. VMs/VMSS go in subnets; databases/storage at resource group level
5. Use descriptive suffixes: -weu, -neu, -eus, etc. for regional resources
6. Default address spaces: Hub 10.0.0.0/16, Spokes 10.1.0.0/16, 10.2.0.0/16, etc.
7. When user mentions "separate subscription", add a subscriptions array and tag resources with the subscription name
8. If no subscriptions are specified, omit the subscriptions array entirely
9. Multi-region hub-spoke: ALWAYS add a global VNet peering connection between hub VNets across regions
10. When user mentions "availability zones" or multiple VMs, distribute them across zones by setting properties.availabilityZone to 1, 2, or 3 on each VM/VMSS. Round-robin assign: first VM gets zone 1, second gets zone 2, third gets zone 3, fourth gets zone 1, etc.
11. ALWAYS include detailed properties on resources even when the user doesn't specify them — make smart suggestions:
    - VMs: vmSize (suggest Standard_D4s_v5 for general, Standard_E16s_v5 for memory-intensive, Standard_M64s for SAP HANA)
    - VNETs: addressSpace (use 10.x.0.0/16 pattern)
    - Subnets: addressPrefix (use 10.x.y.0/24 pattern, appropriately sized)
    - AKS: nodeCount, vmSize (suggest Standard_D4s_v5)
    - SQL Database: sku, tier (suggest Standard S3 or Premium P1)
    - Storage: kind (StorageV2), sku (Standard_LRS or Standard_GRS)
    - App Gateway: sku (WAF_v2), tier (Standard_v2)
    - ExpressRoute: bandwidth (1 Gbps or 2 Gbps)  
    - Redis: sku (Standard), capacity (C1)
    - VMSS: capacity (3), vmSize
    - NetApp Files: tier (Premium), capacity (4 TiB)
    - Elastic SAN: tier (Premium), capacity (1 TiB)
    - SAP HANA VMs: vmSize (Standard_M64s or Standard_M128s)
    - AVD: maxSessions (10), vmSize (Standard_D4s_v5)
    These will be displayed as labels on the diagram.
12. When the user mentions "pages", "tabs", "layers", or "separate views", create a multi-page diagram using the "pages" array. Each page has a name and its own resources and connections. Example: "pages": [{"name": "Network Overview", "resources": [...], "connections": [...]}, {"name": "Application Layer", "resources": [...], "connections": [...]}]. Common page splits: "Network" + "Application" + "Data", or one page per region.
13. If no pages are requested, do NOT use the pages array — use the flat structure.
14. ALWAYS include a "title" and "description" field. The description should explain what this architecture does, why key design choices were made, and important considerations (3-6 sentences). For multi-page diagrams, also include a "description" field on each page explaining what that specific page/view shows.

AZURE ARCHITECTURAL CONSTRAINTS (MANDATORY — violations cause validation errors):

Subnet naming requirements:
- Azure Firewall MUST be placed in a subnet named EXACTLY "AzureFirewallSubnet" — no other name is accepted
- Azure Bastion MUST be placed in a subnet named EXACTLY "AzureBastionSubnet" — no other name is accepted
- VPN Gateway and ExpressRoute Gateway MUST be placed in a subnet named EXACTLY "GatewaySubnet"
- Application Gateway MUST be in its own dedicated subnet (cannot share with other resources)

Subnet sizing requirements:
- AzureFirewallSubnet: minimum /26 prefix (e.g., 10.0.1.0/26)
- AzureBastionSubnet: minimum /26 prefix (e.g., 10.0.2.0/26)
- GatewaySubnet: minimum /27 prefix (e.g., 10.0.3.0/27)
- Application Gateway subnet: minimum /26 prefix
- AKS subnet: minimum /24 prefix (recommended for pod IP allocation)
- SQL Managed Instance subnet: minimum /27, must be dedicated (no other resources)
- General subnets: use /24 unless there's a specific reason for smaller

Network security requirements:
- NEVER attach an NSG to GatewaySubnet (breaks VPN/ExpressRoute)
- NEVER attach an NSG to AzureFirewallSubnet
- Every subnet containing VMs or other compute (AKS, VMSS, App Service) MUST have an NSG
- NSGs MUST be associated to subnets using the "nsg" field on the subnet resource, e.g.: { "type": "subnet", "name": "subnet-web", "addressPrefix": "10.1.0.0/24", "nsg": "nsg-web-weu" }
- Also create the NSG as a separate resource: { "type": "nsg", "name": "nsg-web-weu", "region": "West Europe" }
- Hub VNets with spokes MUST contain a Firewall or NVA for traffic inspection
- Spoke VNets MUST have a VNet peering connection to the hub VNet
- Spokes should NOT peer directly to each other — route through hub
- If Azure Firewall exists, spoke subnets need a Route Table (UDR) with default route (0.0.0.0/0) pointing to Firewall

Service placement requirements:
- PaaS services (SQL, CosmosDB, Key Vault, Storage, Redis, Event Hub, Service Bus, AI services) SHOULD use private endpoints in production architectures
- AKS clusters SHOULD be in their own dedicated subnet, not shared with other resources
- AKS clusters SHOULD have an associated Azure Container Registry (ACR)
- App Services MUST have an App Service Plan
- API Management in production SHOULD be deployed inside a VNet
- VMs SHOULD specify availability zones or availability sets for high availability
- VMs SHOULD have associated disk configuration
- Load Balancers and Application Gateways MUST have backend pool targets with connections to them
- Architecture SHOULD include monitoring (Log Analytics workspace + Application Insights)
- VMs SHOULD have a Recovery Services Vault for backup
- ExpressRoute circuits MUST have a connection to a Virtual Network Gateway (type "vpnGateway" with properties.gatewayType: "ExpressRoute") in the hub VNet's GatewaySubnet. Always create this connection: { "from": "er-circuit-name", "to": "gateway-name", "style": "expressroute" }

VNet requirements:
- VNets MUST have a valid addressSpace (e.g., "10.0.0.0/16")
- VNets SHOULD contain at least one subnet
- Peered VNets MUST NOT have overlapping address spaces
- Each subnet MUST have a valid addressPrefix within the VNet's addressSpace

Only output the JSON, no explanation.`;

/**
 * Parse the AI response into an Architecture object
 */
export function parseAIResponse(response: ParsedResponse, title?: string): Architecture {
  // Multi-page handling
  if (response.pages && response.pages.length > 0) {
    const arch: Architecture = {
      title: title || response.title || 'Azure Architecture',
      description: response.description,
      animation: response.animation,
      pages: response.pages.map(page => {
        const pageResponse: ParsedResponse = {
          resources: page.resources || [],
          connections: page.connections,
          regions: page.regions,
          hasOnPremises: page.hasOnPremises,
        };
        const pageRegions = page.regions || [];
        const isMultiRegion = pageRegions.length > 1;

        if (isMultiRegion) {
          return {
            name: page.name,
            description: page.description,
            regions: pageRegions.map(regionName => buildRegion(regionName, pageResponse)),
            connections: pageResponse.connections?.map(c => ({
              from: c.from,
              to: c.to,
              label: c.label,
              style: c.style as any,
              animated: c.animated,
              animationStyle: c.animationStyle,
              animationColor: c.animationColor,
            })) || [],
            onPremises: page.hasOnPremises ? [{
              name: 'On-Premises Datacenter',
              resources: [],
            }] : undefined,
          };
        } else {
          return {
            name: page.name,
            description: page.description,
            resourceGroups: buildResourceGroups(pageResponse, pageRegions[0]),
            connections: pageResponse.connections?.map(c => ({
              from: c.from,
              to: c.to,
              label: c.label,
              style: c.style as any,
              animated: c.animated,
              animationStyle: c.animationStyle,
              animationColor: c.animationColor,
            })) || [],
            onPremises: page.hasOnPremises ? [{
              name: 'On-Premises Datacenter',
              resources: [],
            }] : undefined,
          };
        }
      }),
    };
    return arch;
  }

  const arch: Architecture = {
    title: title || response.title || 'Azure Architecture',
    description: response.description,
    animation: response.animation,
    connections: [],
  };

  // Determine architecture type
  const isMultiRegion = response.regions && response.regions.length > 1;
  const hasMultiSub = response.subscriptions && response.subscriptions.length > 1;
  const hasOnPrem = response.hasOnPremises;

  if (hasMultiSub) {
    // Multi-subscription architecture
    arch.subscriptions = response.subscriptions!.map(sub => {
      const subRegions = sub.regions || response.regions || ['West Europe'];
      const subResources = response.resources.filter(r => r.subscription === sub.name);
      const subResponse: ParsedResponse = { ...response, resources: subResources };

      if (subRegions.length > 1) {
        // Multi-region within this subscription
        return {
          name: sub.name,
          regions: subRegions.map(regionName => buildRegion(regionName, subResponse)),
        };
      } else {
        return {
          name: sub.name,
          resourceGroups: buildResourceGroups(subResponse, subRegions[0]),
        };
      }
    });

    // Resources without a subscription tag go to a default subscription
    const untaggedResources = response.resources.filter(r => !r.subscription);
    if (untaggedResources.length > 0) {
      const defaultSubResponse: ParsedResponse = { ...response, resources: untaggedResources };
      if (isMultiRegion) {
        const defaultSub = {
          name: 'Azure Subscription',
          regions: response.regions!.map(regionName => buildRegion(regionName, defaultSubResponse)),
        };
        arch.subscriptions.unshift(defaultSub);
      } else {
        const defaultSub = {
          name: 'Azure Subscription',
          resourceGroups: buildResourceGroups(defaultSubResponse, response.regions?.[0]),
        };
        arch.subscriptions.unshift(defaultSub);
      }
    }
  } else if (isMultiRegion) {
    arch.regions = response.regions!.map(regionName => buildRegion(regionName, response));
  } else {
    // Single region or simple architecture
    arch.subscription = {
      name: 'Azure Subscription',
      resourceGroups: buildResourceGroups(response, response.regions?.[0]),
    };
  }

  // Handle on-premises
  if (hasOnPrem) {
    arch.onPremises = [{
      name: 'On-Premises Datacenter',
      resources: response.resources
        .filter(r => r.type === 'localNetworkGateway' || r.containedIn === 'onPremises')
        .map(r => ({
          type: resolveResourceType(r.type) || r.type,
          name: r.name,
          properties: r.properties,
        })),
    }];
  }

  // Handle global resources (Front Door, Traffic Manager, DNS)
  const globalTypes = ['frontDoor', 'trafficManager', 'dns', 'privateDns', 'cdn'];
  arch.globalResources = response.resources
    .filter(r => globalTypes.includes(resolveResourceType(r.type) || r.type))
    .map(r => ({
      type: resolveResourceType(r.type) || r.type,
      name: r.name,
      properties: r.properties,
    }));

  // Parse connections
  arch.connections = response.connections?.map(c => ({
    from: c.from,
    to: c.to,
    label: c.label,
    style: c.style as any,
    animated: c.animated,
    animationStyle: c.animationStyle,
    animationColor: c.animationColor,
  })) || [];

  // Auto-add hub-to-hub global VNet peering for multi-region hub-spoke
  if (isMultiRegion && response.regions && response.regions.length >= 2) {
    const hubVnets = response.resources
      .filter(r => (resolveResourceType(r.type) || r.type) === 'hubVnet')
      .map(r => r.name);
    
    // Connect all hub VNets to each other if not already connected
    for (let i = 0; i < hubVnets.length; i++) {
      for (let j = i + 1; j < hubVnets.length; j++) {
        const alreadyConnected = arch.connections.some(c =>
          (c.from === hubVnets[i] && c.to === hubVnets[j]) ||
          (c.from === hubVnets[j] && c.to === hubVnets[i])
        );
        if (!alreadyConnected) {
          arch.connections.push({
            from: hubVnets[i],
            to: hubVnets[j],
            label: 'Global VNet Peering',
            style: 'peering' as any,
          });
        }
      }
    }
  }

  return arch;
}

function buildRegion(regionName: string, response: ParsedResponse): Region {
  const regionResources = response.resources.filter(r => r.region === regionName);
  
  return {
    name: regionName,
    code: regionNameToCode(regionName),
    isPrimary: regionName.toLowerCase().includes('primary') || 
               response.regions?.indexOf(regionName) === 0,
    resourceGroups: buildResourceGroups({ ...response, resources: regionResources }, regionName),
  };
}

function buildResourceGroups(response: ParsedResponse, region?: string): ResourceGroup[] {
  const resourceMap = new Map<string, Resource>();
  const vnets: VNet[] = [];
  const subnets: Subnet[] = [];
  const otherResources: Resource[] = [];

  // First pass: categorize resources
  for (const res of response.resources) {
    const type = resolveResourceType(res.type) || res.type;
    const count = res.count || 1;

    for (let i = 0; i < count; i++) {
      const safeName = res.name.length > 256 ? res.name.substring(0, 256) : res.name;
      const name = count > 1 
        ? `${safeName.replace(/-?\d+$/, '')}-${String(i + 1).padStart(2, '0')}`
        : safeName;

      const resource: Resource = {
        type,
        name,
        properties: res.properties,
        containedIn: res.containedIn,
      };

      resourceMap.set(name, resource);

      if (type === 'vnet' || type === 'hubVnet') {
        vnets.push(resource as VNet);
      } else if (type === 'subnet') {
        subnets.push(resource as Subnet);
      } else {
        otherResources.push(resource);
      }
    }
  }

  // Second pass: organize hierarchy
  // Attach subnets to VNETs
  for (const subnet of subnets) {
    const parentName = (subnet as Resource).containedIn;
    if (parentName) {
      const vnet = vnets.find(v => v.name === parentName);
      if (vnet) {
        vnet.subnets = vnet.subnets || [];
        vnet.subnets.push(subnet);
        subnet.resources = [];
      }
    }
  }

  // Auto-create subnets for hub VNETs if not specified
  for (const vnet of vnets.filter(v => v.type === 'hubVnet')) {
    if (!vnet.subnets || vnet.subnets.length === 0) {
      vnet.subnets = [
        { type: 'subnet', name: 'AzureFirewallSubnet', addressPrefix: '10.0.1.0/24', resources: [] },
        { type: 'subnet', name: 'GatewaySubnet', addressPrefix: '10.0.2.0/24', resources: [] },
        { type: 'subnet', name: 'AzureBastionSubnet', addressPrefix: '10.0.3.0/24', resources: [] },
      ];
    }

    // Auto-add bastion if AzureBastionSubnet is empty
    const bastionSubnet = vnet.subnets?.find(s => s.name === 'AzureBastionSubnet');
    if (bastionSubnet && (!bastionSubnet.resources || bastionSubnet.resources.length === 0)) {
      const suffix = vnet.name.replace(/^vnet-hub-?/, '') || 'main';
      bastionSubnet.resources = bastionSubnet.resources || [];
      bastionSubnet.resources.push({
        type: 'bastion',
        name: `bas-hub-${suffix}`,
      });
    }
  }

  // Attach resources to subnets or keep at RG level
  const rgLevelResources: Resource[] = [];
  
  for (const resource of otherResources) {
    if (resource.containedIn) {
      // Find the subnet
      let placed = false;
      for (const vnet of vnets) {
        const subnet = vnet.subnets?.find(s => s.name === resource.containedIn);
        if (subnet) {
          subnet.resources = subnet.resources || [];
          subnet.resources.push(resource);
          placed = true;
          break;
        }
      }
      if (placed) continue;
    }
    
    // Check if this type should be in a subnet
    const def = RESOURCES[resource.type];
    if (def?.containedBy?.includes('subnet') && !def.containedBy?.includes('resourceGroup')) {
      // Place in first appropriate subnet
      for (const vnet of vnets) {
        if (vnet.subnets && vnet.subnets.length > 0) {
          // Match firewall to AzureFirewallSubnet, bastion to AzureBastionSubnet, etc.
          let targetSubnet = vnet.subnets[0];
          if (resource.type === 'firewall') {
            targetSubnet = vnet.subnets.find(s => s.name === 'AzureFirewallSubnet') || targetSubnet;
          } else if (resource.type === 'bastion') {
            targetSubnet = vnet.subnets.find(s => s.name === 'AzureBastionSubnet') || targetSubnet;
          } else if (resource.type === 'vpnGateway') {
            targetSubnet = vnet.subnets.find(s => s.name === 'GatewaySubnet') || targetSubnet;
          }
          targetSubnet.resources = targetSubnet.resources || [];
          targetSubnet.resources.push(resource);
          break;
        }
      }
    } else {
      rgLevelResources.push(resource);
    }
  }

  // Auto-link NSGs to subnets by naming convention or explicit nsg field
  // e.g., "nsg-web-weu" matches "subnet-web" or "snet-web"
  const nsgResources = rgLevelResources.filter(r => r.type === 'nsg');
  for (const vnet of vnets) {
    if (!vnet.subnets) continue;
    for (const subnet of vnet.subnets) {
      // Skip system subnets that must NOT have NSGs
      if (['GatewaySubnet', 'AzureFirewallSubnet'].includes(subnet.name)) continue;
      // Skip if already has an NSG reference
      if (subnet.nsg) continue;
      // Skip if an NSG is already placed inside the subnet as a resource
      if (subnet.resources?.some(r => r.type === 'nsg')) continue;

      // Try to match by name: extract the subnet's "purpose" part
      // e.g., "subnet-web" → "web", "snet-app" → "app", "AzureBastionSubnet" → "bastion"
      const subnetPurpose = subnet.name
        .replace(/^(subnet|snet)-?/i, '')
        .replace(/subnet$/i, '')
        .toLowerCase();

      if (!subnetPurpose) continue;

      // Find an NSG whose name contains this purpose
      const matchingNsg = nsgResources.find(nsg => {
        const nsgLower = nsg.name.toLowerCase();
        return nsgLower.includes(subnetPurpose);
      });

      if (matchingNsg) {
        subnet.nsg = matchingNsg.name;
      }
    }
  }

  // Group resources by purpose
  const suffix = region ? `-${regionNameToCode(region)}` : '';
  const groups: ResourceGroup[] = [];

  // Hub resources
  const hubVnets = vnets.filter(v => v.type === 'hubVnet');
  if (hubVnets.length > 0) {
    groups.push({
      name: `rg-hub${suffix}`,
      resources: [
        ...hubVnets,
        ...rgLevelResources.filter(r => ['expressRoute', 'publicIp', 'routeTable', 'ddosProtection'].includes(r.type)),
      ],
    });
  }

  // Spoke/workload resources
  const spokeVnets = vnets.filter(v => v.type === 'vnet' || v.type !== 'hubVnet');
  if (spokeVnets.length > 0) {
    groups.push({
      name: `rg-workload${suffix}`,
      resources: [
        ...spokeVnets,
        ...rgLevelResources.filter(r => ['nsg', 'asg'].includes(r.type)),
      ],
    });
  }

  // Shared services (databases, storage, etc.)
  const sharedResources = rgLevelResources.filter(r => 
    ['storageAccount', 'cosmosDb', 'sqlServer', 'sqlDatabase', 'keyVault', 'redis', 
     'containerRegistry', 'recoveryVault', 'openAI', 'machineLearning'].includes(r.type)
  );
  if (sharedResources.length > 0) {
    groups.push({
      name: `rg-shared${suffix}`,
      resources: sharedResources,
    });
  }

  // Catch-all: any remaining resources not yet assigned to a group
  const assignedResources = new Set([
    ...groups.flatMap(g => g.resources.map(r => r.name)),
  ]);
  const unassigned = rgLevelResources.filter(r => !assignedResources.has(r.name));
  if (unassigned.length > 0) {
    // If there are no other groups yet, name it rg-main; otherwise rg-services
    const catchAllName = groups.length === 0 ? `rg-main${suffix}` : `rg-services${suffix}`;
    groups.push({
      name: catchAllName,
      resources: unassigned,
    });
  }

  // If no groups were created, create a default one
  if (groups.length === 0) {
    groups.push({
      name: `rg-main${suffix}`,
      resources: [...vnets, ...rgLevelResources],
    });
  }

  // Post-process: group resources with availabilityZone into AZ containers within subnets
  for (const group of groups) {
    for (const res of group.resources) {
      const vnet = res as VNet;
      if (vnet.subnets) {
        for (const subnet of vnet.subnets) {
          if (!subnet.resources) continue;
          const zonedResources = subnet.resources.filter(r => 
            r.properties?.availabilityZone !== undefined
          );
          if (zonedResources.length === 0) continue;

          // Group by zone
          const zoneMap = new Map<number, Resource[]>();
          for (const r of zonedResources) {
            const zone = Number(r.properties!.availabilityZone);
            if (!zoneMap.has(zone)) zoneMap.set(zone, []);
            zoneMap.get(zone)!.push(r);
          }

          // Only create AZ containers if there are multiple zones
          if (zoneMap.size > 1) {
            // Remove zoned resources from the flat list
            subnet.resources = subnet.resources.filter(r => 
              r.properties?.availabilityZone === undefined
            );
            // Create AZ groups
            subnet.availabilityZones = Array.from(zoneMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([zone, resources]) => ({ zone, resources }));
          }
        }
      }
    }
  }

  return groups;
}

function regionNameToCode(name: string): string {
  const codes: Record<string, string> = {
    'west europe': 'weu',
    'north europe': 'neu',
    'east us': 'eus',
    'east us 2': 'eus2',
    'west us': 'wus',
    'west us 2': 'wus2',
    'central us': 'cus',
    'uk south': 'uks',
    'uk west': 'ukw',
    'germany west central': 'gwc',
    'france central': 'frc',
    'sweden central': 'swc',
    'norway east': 'noe',
    'switzerland north': 'chn',
    'australia east': 'aue',
    'southeast asia': 'sea',
    'japan east': 'jpe',
  };
  return codes[name.toLowerCase()] || name.toLowerCase().replace(/\s+/g, '').substring(0, 3);
}

// ==================== GENERIC ARCHITECTURE SUPPORT ====================

/**
 * System prompt for Generic (non-Azure) architecture diagrams.
 * Instructs the AI to output JSON matching the GenericArchitecture interface.
 */
export const GENERIC_SYSTEM_PROMPT = `You are a generic architecture diagram parser. Convert natural language descriptions into structured JSON for generating Draw.io diagrams. You are NOT limited to Azure — you can model ANY technology stack: AI agent flows, microservices, data pipelines, network topologies, and more.

Output ONLY valid JSON with this structure:
{
  "title": "Architecture Title",
  "description": "A comprehensive explanation of this architecture: what it does, why this design was chosen, key design decisions, and important considerations. This should be 3-6 sentences providing valuable context.",
  "type": "generic|agent-flow|microservices|data-pipeline|network",
  "backgroundColor": "#FFFFFF",
  "animations": {
    "enabled": true,
    "flowAnimation": true
  },
  "systems": [
    {
      "id": "layer-1",
      "name": "Layer Name",
      "type": "system|layer|zone|group|swimlane",
      "style": {
        "fillColor": "#E3F2FD",
        "strokeColor": "#1565C0"
      },
      "nodes": [
        {
          "id": "node-1",
          "type": "user",
          "name": "Display Name",
          "description": "tooltip text",
          "properties": { "key": "value" },
          "badge": "v2"
        }
      ],
      "children": []
    }
  ],
  "connections": [
    {
      "from": "node name or id",
      "to": "node name or id",
      "label": "connection label",
      "style": "solid",
      "color": "#2196F3",
      "animated": true,
      "bidirectional": false
    }
  ]
}

Node types available (use these exact type names):
USER/ACTOR: user, userGroup
AI/AGENT: agent, orchestrator, subAgent, llm
API/WEB: api, webApp, mobileApp
COMPUTE: server, container, microservice, workflow
DATA: database, queue, cache, storage
NETWORKING: gateway, loadBalancer, firewall
MONITORING: monitor, notification, email, chat
DOCUMENTS: document
EXTERNAL: cloud, thirdParty, custom

Container types (for the "systems" array, used as the "type" field on each system block):
- system: High-level system boundary (bold blue border, shadow)
- layer: Architectural layer — presentation, business logic, data (purple dashed border)
- zone: Trust/security/network zone (amber thick border)
- group: Generic grouping (gray border)
- swimlane: Flow diagram swimlane (blue-gray, horizontal)

Container style overrides: Each system block can include a "style" object with optional fields:
  { "fillColor": "#hex", "strokeColor": "#hex", "fontColor": "#hex", "dashed": true/false, "opacity": 0-100 }

Connection styles: solid (default), dashed, dotted, thick, animated
Connection color: Any hex color (e.g. "#2196F3")
Bidirectional connections: Set "bidirectional": true for arrows on both ends.
Animated connections: Set "animated": true to add flowing dot animation along the edge.

Animation config (top-level):
- "animations": { "enabled": true, "flowAnimation": true } — enables flow animation on ALL connections
- When the user asks for "animated", "flowing", "live", or "dynamic" diagrams, set animations.enabled = true
- Individual connections can also set "animated": true independently

Nodes go inside systems via the systems[].nodes array. Systems can have children (nested containers via the systems[].children array). You can nest containers to any depth.

Architecture type hints:
- "generic" — catch-all for any architecture
- "agent-flow" — AI agent orchestration (use orchestrator, agent, subAgent, llm, etc.)
- "microservices" — service mesh / microservice topology (use microservice, gateway, loadBalancer, queue, database, etc.)
- "data-pipeline" — ETL / streaming data flow (use workflow, database, queue, storage, etc.)
- "network" — network topology (use gateway, firewall, loadBalancer, server, etc.)

Rules:
1. Always include a "title" and "description" field.
2. Group related nodes into system blocks for visual clarity.
3. Use meaningful container types: "layer" for horizontal tiers (Frontend, Backend, Data), "zone" for security/trust boundaries, "group" for logical groupings, "system" for top-level system boundaries.
4. Add descriptive labels on connections to show what flows between components.
5. Use nested children when you need sub-groupings within a container.
6. Include "properties" on nodes for relevant metadata (e.g. language, framework, port, protocol, version).
7. Use "badge" for quick status indicators (e.g. "v2", "beta", "3x", "primary").
8. When describing AI/agent architectures, use: orchestrator (main coordinator), agent/subAgent (workers), llm (language models), and connect them to show the control flow.
9. For microservices, use: gateway (API gateway/ingress), microservice (each service), queue (message brokers), database (per-service data stores), loadBalancer, monitor.
10. For data pipelines, use: workflow (ETL steps), database (sources/sinks), queue (streaming), storage (data lake/blob), monitor (observability).
11. Suggest sensible properties even when the user doesn't specify them (e.g. framework, protocol, port, replicas, version).
12. Default backgroundColor is "#FFFFFF". Only change it if the user requests a specific background.

Example 1 — AI Agent Flow:
{
  "title": "Multi-Agent Research System",
  "description": "An AI-powered research system where an orchestrator coordinates specialized sub-agents for web search, analysis, and report generation, all powered by an LLM backbone.",
  "type": "agent-flow",
  "animations": { "enabled": true, "flowAnimation": true },
  "systems": [
    {
      "id": "user-layer", "name": "Users", "type": "layer",
      "style": { "fillColor": "#E3F2FD", "strokeColor": "#1565C0" },
      "nodes": [
        { "id": "user-1", "type": "user", "name": "Researcher", "description": "Submits research queries" }
      ]
    },
    {
      "id": "orchestration", "name": "Orchestration Layer", "type": "system",
      "style": { "fillColor": "#EDE7F6", "strokeColor": "#4527A0" },
      "nodes": [
        { "id": "orch-1", "type": "orchestrator", "name": "Research Orchestrator", "properties": { "framework": "LangGraph" }, "badge": "primary" }
      ],
      "children": [
        {
          "id": "agents", "name": "Specialist Agents", "type": "group",
          "nodes": [
            { "id": "search-agent", "type": "subAgent", "name": "Search Agent", "properties": { "tools": "Brave, Google" } },
            { "id": "analysis-agent", "type": "subAgent", "name": "Analysis Agent" },
            { "id": "writer-agent", "type": "subAgent", "name": "Writer Agent" }
          ]
        }
      ]
    },
    {
      "id": "ai-layer", "name": "AI Services", "type": "zone",
      "nodes": [
        { "id": "llm-1", "type": "llm", "name": "GPT-4", "properties": { "provider": "OpenAI", "tokens": "128k" } }
      ]
    },
    {
      "id": "data-layer", "name": "Data Storage", "type": "layer",
      "nodes": [
        { "id": "db-1", "type": "database", "name": "Vector DB", "properties": { "engine": "Pinecone" } },
        { "id": "cache-1", "type": "cache", "name": "Redis Cache" }
      ]
    }
  ],
  "connections": [
    { "from": "Researcher", "to": "Research Orchestrator", "label": "Query", "animated": true },
    { "from": "Research Orchestrator", "to": "Search Agent", "label": "Search task", "style": "dashed" },
    { "from": "Research Orchestrator", "to": "Analysis Agent", "label": "Analyze task", "style": "dashed" },
    { "from": "Research Orchestrator", "to": "Writer Agent", "label": "Write task", "style": "dashed" },
    { "from": "Search Agent", "to": "GPT-4", "label": "LLM calls", "color": "#9C27B0" },
    { "from": "Analysis Agent", "to": "GPT-4", "label": "LLM calls", "color": "#9C27B0" },
    { "from": "Writer Agent", "to": "GPT-4", "label": "LLM calls", "color": "#9C27B0" },
    { "from": "Research Orchestrator", "to": "Vector DB", "label": "Store/retrieve", "style": "dashed" },
    { "from": "Research Orchestrator", "to": "Redis Cache", "label": "Cache results" }
  ]
}

Example 2 — Microservices:
{
  "title": "E-Commerce Platform",
  "description": "A microservices-based e-commerce platform with an API gateway, domain-specific services, message-driven communication, and per-service databases.",
  "type": "microservices",
  "systems": [
    {
      "id": "clients", "name": "Clients", "type": "layer",
      "nodes": [
        { "id": "web", "type": "webApp", "name": "Web Store", "properties": { "framework": "React" } },
        { "id": "mobile", "type": "mobileApp", "name": "Mobile App", "properties": { "platform": "React Native" } }
      ]
    },
    {
      "id": "edge", "name": "Edge Layer", "type": "zone",
      "nodes": [
        { "id": "gw", "type": "gateway", "name": "API Gateway", "properties": { "tech": "Kong" } },
        { "id": "lb", "type": "loadBalancer", "name": "Load Balancer" }
      ]
    },
    {
      "id": "services", "name": "Services", "type": "system",
      "nodes": [
        { "id": "svc-order", "type": "microservice", "name": "Order Service", "properties": { "lang": "Go", "port": 8080 } },
        { "id": "svc-product", "type": "microservice", "name": "Product Service", "properties": { "lang": "Node.js" } },
        { "id": "svc-user", "type": "microservice", "name": "User Service", "properties": { "lang": "Java" } },
        { "id": "svc-payment", "type": "microservice", "name": "Payment Service", "properties": { "lang": "Go" }, "badge": "PCI" }
      ]
    },
    {
      "id": "messaging", "name": "Messaging", "type": "group",
      "nodes": [
        { "id": "mq", "type": "queue", "name": "Kafka", "properties": { "partitions": 12 } }
      ]
    },
    {
      "id": "data", "name": "Data Layer", "type": "layer",
      "nodes": [
        { "id": "db-orders", "type": "database", "name": "Orders DB", "properties": { "engine": "PostgreSQL" } },
        { "id": "db-products", "type": "database", "name": "Products DB", "properties": { "engine": "MongoDB" } },
        { "id": "db-users", "type": "database", "name": "Users DB", "properties": { "engine": "PostgreSQL" } },
        { "id": "cache", "type": "cache", "name": "Redis", "properties": { "purpose": "Session + cache" } }
      ]
    }
  ],
  "connections": [
    { "from": "Web Store", "to": "API Gateway", "label": "HTTPS" },
    { "from": "Mobile App", "to": "API Gateway", "label": "HTTPS" },
    { "from": "API Gateway", "to": "Load Balancer", "label": "Route" },
    { "from": "Load Balancer", "to": "Order Service", "label": "gRPC" },
    { "from": "Load Balancer", "to": "Product Service", "label": "gRPC" },
    { "from": "Load Balancer", "to": "User Service", "label": "gRPC" },
    { "from": "Order Service", "to": "Payment Service", "label": "Payment flow", "style": "dashed" },
    { "from": "Order Service", "to": "Kafka", "label": "Events", "animated": true },
    { "from": "Product Service", "to": "Kafka", "label": "Events", "animated": true },
    { "from": "Order Service", "to": "Orders DB", "label": "CRUD" },
    { "from": "Product Service", "to": "Products DB", "label": "CRUD" },
    { "from": "User Service", "to": "Users DB", "label": "CRUD" },
    { "from": "User Service", "to": "Redis", "label": "Sessions" }
  ]
}

Example 3 — Data Pipeline:
{
  "title": "Real-Time Analytics Pipeline",
  "description": "A streaming data pipeline that ingests events, processes them in real-time, stores results in a data warehouse, and serves dashboards.",
  "type": "data-pipeline",
  "animations": { "enabled": true, "flowAnimation": true },
  "systems": [
    {
      "id": "sources", "name": "Data Sources", "type": "layer",
      "nodes": [
        { "id": "app-events", "type": "api", "name": "App Events API" },
        { "id": "iot", "type": "thirdParty", "name": "IoT Devices" },
        { "id": "logs", "type": "storage", "name": "Log Files" }
      ]
    },
    {
      "id": "ingestion", "name": "Ingestion", "type": "zone",
      "nodes": [
        { "id": "kafka", "type": "queue", "name": "Kafka", "properties": { "topics": "events, logs, iot" } }
      ]
    },
    {
      "id": "processing", "name": "Processing", "type": "system",
      "nodes": [
        { "id": "stream", "type": "workflow", "name": "Stream Processor", "properties": { "tech": "Flink" } },
        { "id": "batch", "type": "workflow", "name": "Batch ETL", "properties": { "tech": "Spark", "schedule": "hourly" } }
      ]
    },
    {
      "id": "storage-layer", "name": "Storage", "type": "layer",
      "nodes": [
        { "id": "dw", "type": "database", "name": "Data Warehouse", "properties": { "engine": "ClickHouse" } },
        { "id": "lake", "type": "storage", "name": "Data Lake", "properties": { "format": "Parquet" } }
      ]
    },
    {
      "id": "serving", "name": "Serving", "type": "group",
      "nodes": [
        { "id": "dashboard", "type": "monitor", "name": "Grafana Dashboard" },
        { "id": "alerts", "type": "notification", "name": "Alert Manager" }
      ]
    }
  ],
  "connections": [
    { "from": "App Events API", "to": "Kafka", "label": "Events", "animated": true },
    { "from": "IoT Devices", "to": "Kafka", "label": "Telemetry", "animated": true },
    { "from": "Log Files", "to": "Kafka", "label": "Logs" },
    { "from": "Kafka", "to": "Stream Processor", "label": "Real-time", "animated": true, "color": "#4CAF50" },
    { "from": "Kafka", "to": "Batch ETL", "label": "Batch", "style": "dashed" },
    { "from": "Stream Processor", "to": "Data Warehouse", "label": "Write" },
    { "from": "Batch ETL", "to": "Data Lake", "label": "Store" },
    { "from": "Data Lake", "to": "Data Warehouse", "label": "Load", "style": "dashed" },
    { "from": "Data Warehouse", "to": "Grafana Dashboard", "label": "Query" },
    { "from": "Grafana Dashboard", "to": "Alert Manager", "label": "Alerts", "style": "dotted", "color": "#FF9800" }
  ]
}

Only output the JSON, no explanation.`;

/**
 * Generic refinement prompt prefix (analogous to REFINEMENT_PROMPT for Azure).
 */
export const GENERIC_REFINEMENT_PROMPT = `You are refining an existing generic architecture. The previous architecture JSON is provided below. The user wants to make changes to it.

IMPORTANT RULES FOR REFINEMENT:
- Keep ALL existing systems, nodes, and connections unless the user explicitly asks to remove them
- Add new nodes/systems as requested
- Modify properties of existing nodes if asked
- Output a COMPLETE merged JSON (not just the diff)
- Use the same JSON format as a fresh generation
- Maintain all existing connections unless changes are needed

Previous architecture:
`;

/**
 * Parse and validate an AI response as a GenericArchitecture object.
 * Applies defaults for missing fields.
 */
export function parseGenericAIResponse(raw: any): GenericArchitecture {
  const arch: GenericArchitecture = {
    title: raw.title || 'Architecture',
    description: raw.description || undefined,
    type: ['generic', 'agent-flow', 'microservices', 'data-pipeline', 'network'].includes(raw.type)
      ? raw.type
      : 'generic',
    backgroundColor: raw.backgroundColor || '#FFFFFF',
    animations: raw.animations
      ? {
          enabled: raw.animations.enabled ?? false,
          flowAnimation: raw.animations.flowAnimation ?? false,
          speed: raw.animations.speed,
          pulseNodes: raw.animations.pulseNodes,
          sequencePaths: raw.animations.sequencePaths,
        }
      : undefined,
    theme: raw.theme || undefined,
    systems: Array.isArray(raw.systems)
      ? raw.systems.map(parseSystemBlock)
      : undefined,
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.map(parseGenericNode)
      : undefined,
    connections: Array.isArray(raw.connections)
      ? raw.connections.map(parseGenericConnection)
      : undefined,
  };

  return arch;
}

function parseSystemBlock(raw: any): any {
  return {
    id: raw.id || undefined,
    name: raw.name || 'Unnamed',
    type: ['system', 'layer', 'zone', 'group', 'swimlane'].includes(raw.type)
      ? raw.type
      : 'group',
    style: raw.style || undefined,
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.map(parseGenericNode)
      : undefined,
    children: Array.isArray(raw.children)
      ? raw.children.map(parseSystemBlock)
      : undefined,
  };
}

function parseGenericNode(raw: any): any {
  return {
    id: raw.id || undefined,
    type: raw.type || 'custom',
    name: raw.name || 'Unnamed',
    description: raw.description || undefined,
    containedIn: raw.containedIn || undefined,
    properties: raw.properties || undefined,
    badge: raw.badge || undefined,
  };
}

function parseGenericConnection(raw: any): any {
  return {
    from: raw.from,
    to: raw.to,
    label: raw.label || undefined,
    style: ['solid', 'dashed', 'dotted', 'thick', 'animated'].includes(raw.style)
      ? raw.style
      : undefined,
    color: raw.color || undefined,
    bidirectional: raw.bidirectional || undefined,
    animated: raw.animated || undefined,
  };
}
