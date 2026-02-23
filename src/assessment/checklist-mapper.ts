/**
 * Checklist Mapper
 *
 * Maps architecture resource types to Microsoft Azure Review Checklist files.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ChecklistItem } from './types.js';

const __dirname_resolved = dirname(fileURLToPath(import.meta.url));
const CHECKLISTS_DIR = join(__dirname_resolved, 'checklists');

/** Map resource type → checklist file(s) */
const RESOURCE_CHECKLIST_MAP: Record<string, string[]> = {
  // Compute
  aks: ['aks_checklist.en.json'],
  containerRegistry: ['acr_checklist.en.json'],
  appService: ['appsvc_checklist.en.json'],
  functionApp: ['azfun_checklist.en.json'],
  containerApp: ['container_apps_checklist.en.json'],
  containerAppEnv: ['container_apps_checklist.en.json'],
  databricks: ['databricks_checklist.en.json'],
  // Data
  storageAccount: ['azure_storage_checklist.en.json'],
  cosmosDb: ['cosmosdb_checklist.en.json'],
  sqlServer: ['sql_checklist.en.json'],
  sqlDatabase: ['sqldb_checklist.en.json'],
  redis: ['redis_checklist.en.json'],
  // Security
  keyVault: ['keyvault_checklist.en.json'],
  // Integration
  serviceBus: ['servicebus_checklist.en.json'],
  eventHub: ['eh_checklist.en.json'],
  apiManagement: ['apim_checklist.en.json'],
  // Networking
  vnet: ['network_appdelivery_checklist.en.json'],
  hubVnet: ['network_appdelivery_checklist.en.json'],
  loadBalancer: ['network_appdelivery_checklist.en.json'],
  applicationGateway: ['network_appdelivery_checklist.en.json'],
  firewall: ['network_appdelivery_checklist.en.json'],
  frontDoor: ['network_appdelivery_checklist.en.json'],
};

/** Normalized type aliases (lowercase, no spaces/dashes) → canonical type */
const TYPE_ALIASES: Record<string, string> = {
  'virtualmachine': 'vm',
  'vm': 'vm',
  'kubernetesservice': 'aks',
  'kubernetes': 'aks',
  'azurekubernetesservice': 'aks',
  'webapp': 'appService',
  'webappservice': 'appService',
  'appservice': 'appService',
  'functionapp': 'functionApp',
  'azurefunctions': 'functionApp',
  'containerregistry': 'containerRegistry',
  'acr': 'containerRegistry',
  'containerapp': 'containerApp',
  'containerappsenvironment': 'containerAppEnv',
  'storageaccount': 'storageAccount',
  'storage': 'storageAccount',
  'cosmosdb': 'cosmosDb',
  'cosmos': 'cosmosDb',
  'sqlserver': 'sqlServer',
  'azuresql': 'sqlServer',
  'sqldatabase': 'sqlDatabase',
  'redis': 'redis',
  'rediscache': 'redis',
  'keyvault': 'keyVault',
  'servicebus': 'serviceBus',
  'eventhub': 'eventHub',
  'eventhubs': 'eventHub',
  'apimanagement': 'apiManagement',
  'apim': 'apiManagement',
  'databricks': 'databricks',
  'vnet': 'vnet',
  'virtualnetwork': 'vnet',
  'hubvnet': 'hubVnet',
  'loadbalancer': 'loadBalancer',
  'applicationgateway': 'applicationGateway',
  'appgateway': 'applicationGateway',
  'firewall': 'firewall',
  'azurefirewall': 'firewall',
  'frontdoor': 'frontDoor',
  'azurefrontdoor': 'frontDoor',
};

/** Cache of loaded checklists */
const checklistCache = new Map<string, ChecklistItem[]>();

/** Load a checklist JSON file (cached) */
export function loadChecklist(filename: string): ChecklistItem[] {
  if (checklistCache.has(filename)) {
    return checklistCache.get(filename)!;
  }

  try {
    const filePath = join(CHECKLISTS_DIR, filename);
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const items: ChecklistItem[] = (raw.items || [])
      .filter((item: any) => item.text && item.severity && item.severity !== 'N/A')
      .map((item: any) => ({
        guid: item.guid || '',
        id: item.id || '',
        category: item.category || 'General',
        subcategory: item.subcategory || '',
        text: item.text,
        waf: item.waf || 'Operations',
        severity: item.severity as 'High' | 'Medium' | 'Low',
        service: item.service || undefined,
        link: item.link || undefined,
      }));
    checklistCache.set(filename, items);
    return items;
  } catch {
    checklistCache.set(filename, []);
    return [];
  }
}

/** Resolve a resource type to its canonical form */
function resolveType(type: string): string {
  // Direct match first
  if (RESOURCE_CHECKLIST_MAP[type]) return type;
  // Try alias
  const normalized = type.toLowerCase().replace(/[\s_-]+/g, '');
  const alias = TYPE_ALIASES[normalized];
  if (alias && RESOURCE_CHECKLIST_MAP[alias]) return alias;
  // Try direct match on normalized
  for (const key of Object.keys(RESOURCE_CHECKLIST_MAP)) {
    if (key.toLowerCase() === normalized) return key;
  }
  return type;
}

/** Get checklist items for a resource type. Returns empty array if no checklist exists. */
export function getChecklistForType(resourceType: string): { files: string[]; items: ChecklistItem[] } {
  const resolved = resolveType(resourceType);
  const files = RESOURCE_CHECKLIST_MAP[resolved];
  if (!files) return { files: [], items: [] };

  const allItems: ChecklistItem[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    for (const item of loadChecklist(file)) {
      if (!seen.has(item.guid)) {
        seen.add(item.guid);
        allItems.push(item);
      }
    }
  }

  return { files, items: allItems };
}

/** Get cross-cutting checklist items. Only High severity, limited to most impactful. */
export function getCrossCuttingItems(): ChecklistItem[] {
  const files = ['security_checklist.en.json', 'resiliency_checklist.en.json'];
  const allItems: ChecklistItem[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    for (const item of loadChecklist(file)) {
      if (item.severity === 'High' && !seen.has(item.guid)) {
        seen.add(item.guid);
        allItems.push(item);
      }
    }
  }

  // Cap at ~50 most relevant (sorted by category for grouping)
  return allItems.slice(0, 50);
}

/** Check if a resource type has a checklist */
export function hasChecklist(resourceType: string): boolean {
  const resolved = resolveType(resourceType);
  return !!RESOURCE_CHECKLIST_MAP[resolved];
}
