/**
 * Types for Infrastructure as Code export (Bicep & Terraform)
 */

export interface IaCExportOptions {
  format: 'bicep' | 'terraform';
  environments: ('production' | 'development' | 'staging')[];
  useAVM: boolean;
  includeReadme: boolean;
  includePipeline?: 'github-actions' | 'azure-devops' | null;
}

export interface GeneratedFile {
  path: string;       // e.g., "main.bicep", "modules/networking.bicep"
  content: string;
  description: string;
}

export interface IaCExportResult {
  files: GeneratedFile[];
  summary: {
    totalFiles: number;
    resourceCount: number;
    moduleCount: number;
    format: string;
  };
}

/** Represents a resolved IaC resource ready for code generation */
export interface IaCResource {
  /** Original resource type key (e.g. 'vm', 'vnet', 'keyVault') */
  resourceType: string;
  /** Display name from architecture */
  name: string;
  /** Generated IaC-safe identifier (e.g. 'vm_web_prod_weu_01') */
  identifier: string;
  /** IaC naming convention name (e.g. 'vm-web-prod-weu-01') */
  iacName: string;
  /** Resource category for module grouping */
  category: IaCCategory;
  /** Resource properties from the architecture */
  properties: Record<string, unknown>;
  /** Resource IDs this depends on */
  dependsOn: string[];
  /** Connections to other resources */
  connectedTo: string[];
  /** Parent container info */
  containedIn?: string;
  /** Whether this resource uses an AVM module (true) or raw resource declaration (false) */
  isAvmModule?: boolean;
  /** Parent VNet identifier (for subnet resources) */
  parentVNetIdentifier?: string;
  /** Subnet definitions from architecture (for VNet resources) */
  architectureSubnets?: { name: string; addressPrefix?: string; resources?: { type: string; name: string }[] }[];
  /** Address space from architecture (for VNet resources) */
  addressSpace?: string;
}

export type IaCCategory =
  | 'networking'
  | 'compute'
  | 'security'
  | 'databases'
  | 'storage'
  | 'monitoring'
  | 'integration'
  | 'ai'
  | 'analytics'
  | 'identity'
  | 'management'
  | 'web'
  | 'iot'
  | 'other';

/** AVM module reference for Bicep */
export interface AvmBicepModuleRef {
  module: string;
  requiredParams: string[];
  optionalParams: string[];
  apiVersion?: string;
  /** Fallback ARM resource type for raw declarations */
  armResourceType?: string;
}

/** AVM module reference for Terraform */
export interface AvmTerraformModuleRef {
  source: string;
  version: string;
  requiredVars: string[];
  optionalVars: string[];
  /** Fallback azurerm resource type for raw declarations */
  azurermResourceType?: string;
}

/** Dependency graph node */
export interface DependencyNode {
  id: string;
  resourceType: string;
  dependsOn: string[];
}

/** Module grouping for IaC output */
export interface IaCModule {
  name: string;
  category: IaCCategory;
  resources: IaCResource[];
  dependsOnModules: string[];
  outputs: IaCOutput[];
}

export interface IaCOutput {
  name: string;
  value: string;
  description: string;
}

/** Environment-specific parameter overrides */
export interface EnvironmentConfig {
  environment: 'production' | 'development' | 'staging';
  skuOverrides: Record<string, string>;
  instanceCounts: Record<string, number>;
  extras: Record<string, unknown>;
}
