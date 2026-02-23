/**
 * Cost Estimator
 *
 * Maps Azure resource types to estimated monthly costs in EUR.
 * Uses hardcoded pricing data — no external API calls.
 */

import type { CostLineItem, CostAssessment, AssessmentFinding } from '../types.js';
import type { WalkResult, WalkedResource } from '../../validation/types.js';
import { getCostRecommendations } from './cost-rules.js';

/** Pricing data in EUR/month — Western Europe baseline */
const VM_PRICING: Record<string, number> = {
  'b1s': 8,
  'b1ms': 15,
  'b2s': 34,
  'b2ms': 61,
  'b4ms': 122,
  'd2s': 71,
  'd2s_v3': 71,
  'd2s_v4': 71,
  'd2s_v5': 71,
  'd2as_v5': 65,
  'd4s': 142,
  'd4s_v3': 142,
  'd4s_v4': 142,
  'd4s_v5': 142,
  'd4as_v5': 130,
  'd8s': 284,
  'd8s_v3': 284,
  'd8s_v4': 284,
  'd8s_v5': 284,
  'd8as_v5': 260,
  'd16s': 568,
  'd16s_v3': 568,
  'd16s_v4': 568,
  'd16s_v5': 568,
  'e2s_v3': 91,
  'e4s_v3': 182,
  'e8s_v3': 365,
  'e16s_v3': 730,
  'f2s_v2': 60,
  'f4s_v2': 120,
  'f8s_v2': 240,
  'f16s_v2': 480,
};

/** Default VM price when size is unknown */
const DEFAULT_VM_PRICE = 142; // ~D4s equivalent

/** Pricing for network appliances */
const FIREWALL_PRICING: Record<string, number> = {
  'basic': 365,
  'standard': 912,
  'premium': 1277,
};

const APP_GATEWAY_PRICING: Record<string, number> = {
  'standard_v2': 182,
  'waf_v2': 328,
  'standard': 120,
  'waf': 250,
};

const VPN_GATEWAY_PRICING: Record<string, number> = {
  'vpngw1': 132,
  'vpngw2': 337,
  'vpngw3': 674,
  'vpngw1az': 184,
  'vpngw2az': 472,
  'ergw1az': 184,
  'ergw2az': 472,
};

const BASTION_PRICING: Record<string, number> = {
  'basic': 137,
  'standard': 310,
};

const APP_SERVICE_PRICING: Record<string, number> = {
  'f1': 0,
  'b1': 10,
  'b2': 20,
  'b3': 40,
  's1': 55,
  's2': 110,
  's3': 220,
  'p1v3': 82,
  'p2v3': 164,
  'p3v3': 328,
  'p1v2': 73,
  'p2v2': 146,
  'p3v2': 292,
};

/** Map resource type (lowercase) → pricing function */
function estimateResourceCost(resource: WalkedResource): CostLineItem | null {
  const type = (resource.resource.type || '').toLowerCase().replace(/\s+/g, '');
  const name = resource.resource.name || 'Unknown';
  const props = resource.resource.properties || {};
  const region = resource.context.regionName || 'West Europe';

  // Helper: extract SKU from properties
  const sku = (
    (props.sku as string) ||
    (props.size as string) ||
    (props.tier as string) ||
    (props.vmSize as string) ||
    ''
  ).toLowerCase();

  // VMs
  if (type === 'vm' || type === 'virtualmachine' || type === 'virtual machine'
      || type === 'microsoft.compute/virtualmachines') {
    const vmSize = sku || 'd2s_v3';
    const price = VM_PRICING[vmSize] || DEFAULT_VM_PRICE;
    return {
      resourceName: name,
      resourceType: 'Virtual Machine',
      sku: vmSize.toUpperCase(),
      region,
      monthlyEstimate: price,
      category: 'compute',
    };
  }

  // VMSS
  if (type === 'vmss' || type === 'vmscaleset' || type === 'vm scale set'
      || type === 'microsoft.compute/virtualmachinescalesets') {
    const vmSize = sku || 'd2s_v3';
    const price = VM_PRICING[vmSize] || DEFAULT_VM_PRICE;
    const instanceCount = (props.instanceCount as number) || (props.capacity as number) || 2;
    return {
      resourceName: name,
      resourceType: 'VM Scale Set',
      sku: `${vmSize.toUpperCase()} ×${instanceCount}`,
      region,
      monthlyEstimate: price * instanceCount,
      category: 'compute',
    };
  }

  // Azure Firewall
  if (type === 'firewall' || type === 'azurefirewall' || type === 'azure firewall'
      || type === 'microsoft.network/azurefirewalls') {
    const tier = sku || 'standard';
    const price = FIREWALL_PRICING[tier] || FIREWALL_PRICING['standard'];
    return {
      resourceName: name,
      resourceType: 'Azure Firewall',
      sku: tier.charAt(0).toUpperCase() + tier.slice(1),
      region,
      monthlyEstimate: price,
      category: 'networking',
    };
  }

  // Application Gateway
  if (type === 'applicationgateway' || type === 'application gateway' || type === 'appgateway'
      || type === 'app gateway' || type === 'waf' || type === 'webapplicationfirewall'
      || type === 'microsoft.network/applicationgateways') {
    const tier = sku || 'standard_v2';
    const price = APP_GATEWAY_PRICING[tier] || APP_GATEWAY_PRICING['standard_v2'];
    return {
      resourceName: name,
      resourceType: 'Application Gateway',
      sku: tier.toUpperCase(),
      region,
      monthlyEstimate: price,
      category: 'networking',
    };
  }

  // VPN Gateway
  if (type === 'vpngateway' || type === 'vpn gateway' || type === 'virtualnetworkgateway'
      || type === 'virtual network gateway' || type === 'microsoft.network/virtualnetworkgateways') {
    const tier = sku || 'vpngw1';
    const price = VPN_GATEWAY_PRICING[tier] || VPN_GATEWAY_PRICING['vpngw1'];
    return {
      resourceName: name,
      resourceType: 'VPN Gateway',
      sku: tier.toUpperCase(),
      region,
      monthlyEstimate: price,
      category: 'networking',
    };
  }

  // ExpressRoute Gateway
  if (type === 'expressroutegateway' || type === 'expressroute gateway'
      || type === 'microsoft.network/expressroutegateways') {
    return {
      resourceName: name,
      resourceType: 'ExpressRoute Gateway',
      sku: sku.toUpperCase() || 'STANDARD',
      region,
      monthlyEstimate: 184,
      category: 'networking',
    };
  }

  // Load Balancer
  if (type === 'loadbalancer' || type === 'load balancer'
      || type === 'microsoft.network/loadbalancers') {
    const isStandard = !sku || sku !== 'basic';
    return {
      resourceName: name,
      resourceType: 'Load Balancer',
      sku: isStandard ? 'Standard' : 'Basic',
      region,
      monthlyEstimate: isStandard ? 18 : 0,
      category: 'networking',
    };
  }

  // Bastion
  if (type === 'bastion' || type === 'azurebastion' || type === 'azure bastion'
      || type === 'microsoft.network/bastionhosts') {
    const tier = sku || 'standard';
    const price = BASTION_PRICING[tier] || BASTION_PRICING['standard'];
    return {
      resourceName: name,
      resourceType: 'Azure Bastion',
      sku: tier.charAt(0).toUpperCase() + tier.slice(1),
      region,
      monthlyEstimate: price,
      category: 'networking',
    };
  }

  // SQL Database
  if (type === 'sqldatabase' || type === 'sql database' || type === 'sql'
      || type === 'azuresql' || type === 'azure sql' || type === 'sqlserver'
      || type === 'microsoft.sql/servers') {
    const tier = sku || 'general purpose';
    let price = 150; // General Purpose default
    if (tier.includes('basic')) price = 5;
    else if (tier.includes('standard') || tier.includes('s0')) price = 15;
    else if (tier.includes('s1')) price = 25;
    else if (tier.includes('s2')) price = 50;
    else if (tier.includes('premium') || tier.includes('business')) price = 465;
    else if (tier.includes('hyperscale')) price = 350;
    return {
      resourceName: name,
      resourceType: 'SQL Database',
      sku: tier.charAt(0).toUpperCase() + tier.slice(1),
      region,
      monthlyEstimate: price,
      category: 'databases',
    };
  }

  // CosmosDB
  if (type === 'cosmosdb' || type === 'cosmos db' || type === 'cosmos'
      || type === 'microsoft.documentdb/databaseaccounts') {
    return {
      resourceName: name,
      resourceType: 'Cosmos DB',
      sku: sku || 'Provisioned',
      region,
      monthlyEstimate: 24, // 400 RU/s baseline
      category: 'databases',
    };
  }

  // Storage Account
  if (type === 'storageaccount' || type === 'storage account' || type === 'storage'
      || type === 'microsoft.storage/storageaccounts') {
    return {
      resourceName: name,
      resourceType: 'Storage Account',
      sku: sku || 'Standard LRS',
      region,
      monthlyEstimate: 21,
      category: 'storage',
    };
  }

  // AKS (control plane free, nodes priced as VMs)
  if (type === 'aks' || type === 'kubernetes' || type === 'azure kubernetes service'
      || type === 'microsoft.containerservice/managedclusters') {
    const vmSize = sku || 'd2s_v3';
    const nodeCount = (props.nodeCount as number) || (props.nodes as number) || 3;
    const nodePrice = VM_PRICING[vmSize] || DEFAULT_VM_PRICE;
    return {
      resourceName: name,
      resourceType: 'AKS',
      sku: `${vmSize.toUpperCase()} ×${nodeCount} nodes`,
      region,
      monthlyEstimate: nodePrice * nodeCount,
      category: 'compute',
    };
  }

  // App Service / Web App
  if (type === 'appservice' || type === 'app service' || type === 'webapp'
      || type === 'web app' || type === 'microsoft.web/sites') {
    const tier = sku || 'p1v3';
    const price = APP_SERVICE_PRICING[tier] || APP_SERVICE_PRICING['p1v3'];
    return {
      resourceName: name,
      resourceType: 'App Service',
      sku: tier.toUpperCase(),
      region,
      monthlyEstimate: price,
      category: 'compute',
    };
  }

  // Azure Functions
  if (type === 'functionapp' || type === 'function app' || type === 'functions'
      || type === 'azure functions' || type === 'microsoft.web/sites/functions') {
    return {
      resourceName: name,
      resourceType: 'Azure Functions',
      sku: sku || 'Consumption',
      region,
      monthlyEstimate: sku.includes('premium') ? 140 : 0, // Consumption: pay-per-use ≈ €0
      category: 'compute',
    };
  }

  // Key Vault
  if (type === 'keyvault' || type === 'key vault'
      || type === 'microsoft.keyvault/vaults') {
    return {
      resourceName: name,
      resourceType: 'Key Vault',
      sku: 'Standard',
      region,
      monthlyEstimate: 3,
      category: 'security',
    };
  }

  // Log Analytics / Monitor
  if (type === 'loganalytics' || type === 'log analytics' || type === 'loganalyticsworkspace'
      || type === 'monitor' || type === 'azure monitor'
      || type === 'microsoft.operationalinsights/workspaces') {
    return {
      resourceName: name,
      resourceType: 'Log Analytics',
      sku: 'Pay-as-you-go',
      region,
      monthlyEstimate: 50, // ~5GB/day baseline
      category: 'monitoring',
    };
  }

  // Azure Front Door
  if (type === 'frontdoor' || type === 'front door' || type === 'azure front door'
      || type === 'microsoft.cdn/profiles') {
    return {
      resourceName: name,
      resourceType: 'Front Door',
      sku: sku || 'Standard',
      region: 'Global',
      monthlyEstimate: sku.includes('premium') ? 330 : 35,
      category: 'networking',
    };
  }

  // CDN
  if (type === 'cdn' || type === 'azure cdn' || type === 'microsoft.cdn/profiles') {
    return {
      resourceName: name,
      resourceType: 'CDN',
      sku: 'Standard',
      region: 'Global',
      monthlyEstimate: 20,
      category: 'networking',
    };
  }

  // Traffic Manager
  if (type === 'trafficmanager' || type === 'traffic manager'
      || type === 'microsoft.network/trafficmanagerprofiles') {
    return {
      resourceName: name,
      resourceType: 'Traffic Manager',
      sku: 'Standard',
      region: 'Global',
      monthlyEstimate: 5,
      category: 'networking',
    };
  }

  // Redis Cache
  if (type === 'redis' || type === 'rediscache' || type === 'redis cache'
      || type === 'azure cache for redis' || type === 'microsoft.cache/redis') {
    let price = 55; // C1 default
    if (sku.includes('basic') || sku.includes('c0')) price = 13;
    else if (sku.includes('premium') || sku.includes('p1')) price = 186;
    return {
      resourceName: name,
      resourceType: 'Redis Cache',
      sku: sku || 'C1 Standard',
      region,
      monthlyEstimate: price,
      category: 'databases',
    };
  }

  // Container Registry
  if (type === 'containerregistry' || type === 'container registry' || type === 'acr'
      || type === 'microsoft.containerregistry/registries') {
    let price = 5; // Basic
    if (sku.includes('standard')) price = 20;
    else if (sku.includes('premium')) price = 50;
    return {
      resourceName: name,
      resourceType: 'Container Registry',
      sku: sku || 'Basic',
      region,
      monthlyEstimate: price,
      category: 'compute',
    };
  }

  // API Management
  if (type === 'apimanagement' || type === 'api management' || type === 'apim'
      || type === 'microsoft.apimanagement/service') {
    let price = 47; // Developer
    if (sku.includes('basic')) price = 112;
    else if (sku.includes('standard')) price = 465;
    else if (sku.includes('premium')) price = 2083;
    else if (sku.includes('consumption')) price = 3;
    return {
      resourceName: name,
      resourceType: 'API Management',
      sku: sku || 'Developer',
      region,
      monthlyEstimate: price,
      category: 'networking',
    };
  }

  // Service Bus
  if (type === 'servicebus' || type === 'service bus'
      || type === 'microsoft.servicebus/namespaces') {
    let price = 10; // Basic
    if (sku.includes('standard')) price = 10;
    else if (sku.includes('premium')) price = 677;
    return {
      resourceName: name,
      resourceType: 'Service Bus',
      sku: sku || 'Standard',
      region,
      monthlyEstimate: price,
      category: 'other',
    };
  }

  // Event Hub
  if (type === 'eventhub' || type === 'event hub' || type === 'eventhubs'
      || type === 'microsoft.eventhub/namespaces') {
    return {
      resourceName: name,
      resourceType: 'Event Hub',
      sku: sku || 'Standard',
      region,
      monthlyEstimate: 11,
      category: 'other',
    };
  }

  // DDoS Protection
  if (type === 'ddosprotection' || type === 'ddos protection' || type === 'ddos'
      || type === 'microsoft.network/ddosprotectionplans') {
    return {
      resourceName: name,
      resourceType: 'DDoS Protection',
      sku: 'Standard',
      region: 'Global',
      monthlyEstimate: 2944,
      category: 'security',
    };
  }

  // NSG (free)
  if (type === 'nsg' || type === 'networksecuritygroup' || type === 'network security group'
      || type === 'microsoft.network/networksecuritygroups') {
    return null; // NSGs are free
  }

  // VNet (free)
  if (type === 'vnet' || type === 'hubvnet' || type === 'virtualnetwork' || type === 'virtual network'
      || type === 'microsoft.network/virtualnetworks') {
    return null; // VNets are free
  }

  // Subnet (free)
  if (type === 'subnet') {
    return null;
  }

  // Private Endpoint — small cost
  if (type === 'privateendpoint' || type === 'private endpoint'
      || type === 'microsoft.network/privateendpoints') {
    return {
      resourceName: name,
      resourceType: 'Private Endpoint',
      sku: 'Standard',
      region,
      monthlyEstimate: 7,
      category: 'networking',
    };
  }

  // Public IP
  if (type === 'publicip' || type === 'public ip' || type === 'publicipaddress'
      || type === 'microsoft.network/publicipaddresses') {
    return {
      resourceName: name,
      resourceType: 'Public IP',
      sku: 'Standard',
      region,
      monthlyEstimate: 4,
      category: 'networking',
    };
  }

  // Catch-all for unrecognized resource types
  return {
    resourceName: name,
    resourceType: resource.resource.type || 'Unknown',
    sku: sku || 'N/A',
    region,
    monthlyEstimate: 0,
    category: 'other',
  };
}

/**
 * Estimate costs for the entire architecture.
 */
export function assessCost(walk: WalkResult): CostAssessment {
  const breakdown: CostLineItem[] = [];

  for (const wr of walk.resources) {
    const item = estimateResourceCost(wr);
    if (item && item.monthlyEstimate > 0) {
      breakdown.push(item);
    }
  }

  // Sort by cost descending
  breakdown.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);

  const totalMonthly = breakdown.reduce((sum, item) => sum + item.monthlyEstimate, 0);
  const recommendations = getCostRecommendations(walk, breakdown, totalMonthly);

  // Score: 5 = optimized, 1 = very expensive with many issues
  const criticalCount = recommendations.filter(r => r.severity === 'critical').length;
  const warningCount = recommendations.filter(r => r.severity === 'warning').length;
  let score = 5;
  score -= criticalCount * 1.0;
  score -= warningCount * 0.5;
  score = Math.max(1, Math.min(5, Math.round(score)));

  return {
    score,
    totalMonthly,
    currency: 'EUR',
    breakdown,
    recommendations,
  };
}
