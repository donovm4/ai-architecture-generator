/**
 * Azure Architecture Validation Types
 *
 * Types for validating generated architectures against real Azure constraints:
 * subnet sizing, service placement, naming requirements, network topology, etc.
 */

export interface ValidationFinding {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'subnet' | 'placement' | 'naming' | 'sizing' | 'config' | 'network';
  resourceId: string;
  resourceName: string;
  title: string;
  description: string;
  sourceUrl?: string;           // Microsoft Learn link
  autoFixPrompt?: string;       // Natural language fix instruction for refinement
}

export interface ValidationResult {
  findings: ValidationFinding[];
  summary: { errors: number; warnings: number; info: number };
  validatedAt: string;
  duration: number;
}

/**
 * Context provided to each resource during architecture traversal.
 * This lets rules understand where a resource sits in the hierarchy.
 */
export interface ResourceContext {
  subscriptionName?: string;
  regionName?: string;
  resourceGroupName?: string;
  vnetName?: string;
  vnetAddressSpace?: string;
  subnetName?: string;
  subnetAddressPrefix?: string;
}

/**
 * Flattened view of the architecture for easier rule evaluation.
 */
export interface WalkedResource {
  resource: import('../schema/types.js').Resource;
  context: ResourceContext;
}

export interface WalkedVNet {
  vnet: import('../schema/types.js').VNet;
  context: ResourceContext;
}

export interface WalkedSubnet {
  subnet: import('../schema/types.js').Subnet;
  vnetName: string;
  vnetAddressSpace?: string;
  context: ResourceContext;
}

export interface WalkResult {
  resources: WalkedResource[];
  vnets: WalkedVNet[];
  subnets: WalkedSubnet[];
  connections: import('../schema/types.js').Connection[];
  globalResources: import('../schema/types.js').Resource[];
}

/**
 * A validation rule function.
 * Takes the walked architecture and returns findings.
 */
export type ValidationRule = (walk: WalkResult) => ValidationFinding[];
