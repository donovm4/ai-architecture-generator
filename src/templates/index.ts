/**
 * Template Registry — Pre-built Azure architecture patterns
 * 
 * Each template provides a valid Architecture JSON that can be loaded
 * directly into the generator or customized via AI refinement.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Architecture } from '../schema/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTemplate(filename: string): Architecture {
  // Try loading from current directory (works in both src/ for tsx and dist/ if files are copied)
  let filePath = resolve(__dirname, filename);
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Architecture;
  } catch {
    // Fallback: when running from dist/, load from src/templates/ instead
    const srcPath = resolve(__dirname, '../../src/templates', filename);
    const raw = readFileSync(srcPath, 'utf-8');
    return JSON.parse(raw) as Architecture;
  }
}

export type TemplateCategory = 'Networking' | 'Compute' | 'Data' | 'Web' | 'Hybrid';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;           // Emoji icon for the card
  resourceCount: number;  // Approximate number of resources
  tags: string[];
}

export interface TemplateEntry {
  metadata: TemplateMetadata;
  architecture: Architecture;
}

function countResources(arch: Architecture): number {
  let count = 0;

  const countInResources = (resources: any[] | undefined) => {
    if (!resources) return;
    for (const r of resources) {
      count++;
      // Count subnets and their resources for VNets
      if (r.subnets) {
        for (const s of r.subnets) {
          count++;
          if (s.resources) count += s.resources.length;
        }
      }
    }
  };

  if (arch.regions) {
    for (const region of arch.regions) {
      countInResources(region.resources);
      if (region.resourceGroups) {
        for (const rg of region.resourceGroups) {
          countInResources(rg.resources);
        }
      }
    }
  }

  if (arch.onPremises) {
    for (const op of arch.onPremises) {
      if (op.resources) count += op.resources.length;
    }
  }

  if (arch.globalResources) count += arch.globalResources.length;

  return count;
}

const TEMPLATE_DEFS: Array<{ filename: string; metadata: Omit<TemplateMetadata, 'resourceCount'> }> = [
  {
    filename: 'hub-spoke.json',
    metadata: {
      id: 'hub-spoke',
      name: 'Hub-Spoke Network',
      description: 'Hub VNet with Firewall, Bastion, and VPN Gateway connected to two spoke VNets via peering.',
      category: 'Networking',
      icon: '🔀',
      tags: ['networking', 'firewall', 'bastion', 'vpn', 'peering'],
    },
  },
  {
    filename: 'three-tier-web.json',
    metadata: {
      id: 'three-tier-web',
      name: 'Three-Tier Web App',
      description: 'Web, App, and Data tiers with Application Gateway, VM Scale Sets, and Azure SQL.',
      category: 'Web',
      icon: '🏗️',
      tags: ['web', 'vmss', 'sql', 'load-balancing', 'redis'],
    },
  },
  {
    filename: 'aks-private.json',
    metadata: {
      id: 'aks-private',
      name: 'Private AKS Cluster',
      description: 'AKS with private endpoints, Container Registry, Key Vault, and Application Gateway ingress.',
      category: 'Compute',
      icon: '☸️',
      tags: ['kubernetes', 'aks', 'containers', 'private-endpoint', 'acr'],
    },
  },
  {
    filename: 'multi-region-ha.json',
    metadata: {
      id: 'multi-region-ha',
      name: 'Multi-Region HA',
      description: 'Dual-region active-passive setup with Traffic Manager and geo-replicated SQL Database.',
      category: 'Web',
      icon: '🌍',
      tags: ['multi-region', 'high-availability', 'traffic-manager', 'geo-replication'],
    },
  },
  {
    filename: 'expressroute-hybrid.json',
    metadata: {
      id: 'expressroute-hybrid',
      name: 'ExpressRoute Hybrid',
      description: 'On-premises datacenter connected via ExpressRoute with hub-spoke topology and VPN backup.',
      category: 'Hybrid',
      icon: '🔌',
      tags: ['hybrid', 'expressroute', 'on-premises', 'vpn', 'hub-spoke'],
    },
  },
  {
    filename: 'data-platform.json',
    metadata: {
      id: 'data-platform',
      name: 'Data Platform',
      description: 'Data Factory, Databricks, Synapse Analytics, and ADLS Gen2 with Purview governance.',
      category: 'Data',
      icon: '📊',
      tags: ['data', 'databricks', 'synapse', 'data-factory', 'data-lake'],
    },
  },
  {
    filename: 'microservices.json',
    metadata: {
      id: 'microservices',
      name: 'Microservices',
      description: 'AKS with API Management, Service Bus, Cosmos DB, and Front Door for global routing.',
      category: 'Compute',
      icon: '🧩',
      tags: ['microservices', 'aks', 'apim', 'service-bus', 'cosmos-db'],
    },
  },
  {
    filename: 'simple-web-app.json',
    metadata: {
      id: 'simple-web-app',
      name: 'Simple Web App',
      description: 'App Service with SQL Database, Key Vault, and Application Insights. Great starting point.',
      category: 'Web',
      icon: '🌐',
      tags: ['web', 'app-service', 'sql', 'simple', 'beginner'],
    },
  },
];

// Load all templates at startup
const TEMPLATES: TemplateEntry[] = TEMPLATE_DEFS.map(def => {
  const architecture = loadTemplate(def.filename);
  return {
    metadata: {
      ...def.metadata,
      resourceCount: countResources(architecture),
    },
    architecture,
  };
});

/** Get metadata for all templates (without the full architecture JSON) */
export function getTemplateList(): TemplateMetadata[] {
  return TEMPLATES.map(t => t.metadata);
}

/** Get a full template by ID */
export function getTemplateById(id: string): TemplateEntry | undefined {
  return TEMPLATES.find(t => t.metadata.id === id);
}

/** Get all unique categories */
export function getCategories(): TemplateCategory[] {
  return [...new Set(TEMPLATES.map(t => t.metadata.category))];
}
