/**
 * Generic (non-Azure) resource definitions for architecture diagrams.
 *
 * Every resource uses draw.io built-in shapes & stencils so diagrams
 * render without external icon URLs. The `style` property on each
 * definition is a complete mxCell style string ready for the XML builder.
 *
 * Container types (system, layer, zone, group, swimlane) follow the
 * same swimlane pattern used by Azure hierarchy containers.
 */

import type { ResourceDefinition, ResourceCategory } from './resources.js';

// ==================== EXTENDED CATEGORY TYPE ====================

/**
 * Additional categories for generic resources.
 * These extend the Azure ResourceCategory but are kept as a union
 * so existing code doesn't break.
 */
export type GenericResourceCategory =
  | ResourceCategory
  | 'user'
  | 'agent'
  | 'service'
  | 'api'
  | 'database'
  | 'queue'
  | 'cache'
  | 'storage'
  | 'external'
  | 'custom';

// ==================== GENERIC RESOURCE DEFINITION ====================

/**
 * Extends ResourceDefinition with a `style` field.
 *
 * For generic resources the `icon` field is set to '' (empty) because
 * they use inline draw.io shape styles instead of external SVG paths.
 * The `style` field contains the full mxCell style string.
 */
export interface GenericResourceDefinition extends ResourceDefinition {
  /** Complete mxCell style string (draw.io built-in shapes). */
  style: string;
}

// ==================== CONTAINER STYLES ====================

/**
 * Container styles for generic architecture groupings.
 * Each maps to a SystemBlock `type` in generic-types.ts.
 */
export const GENERIC_CONTAINER_STYLES = {
  /** High-level system boundary (analogous to Azure subscription). */
  system:
    'swimlane;whiteSpace=wrap;html=1;fillColor=#E3F2FD;strokeColor=#1565C0;' +
    'rounded=1;fontStyle=1;fontSize=14;arcSize=8;shadow=1;',

  /** Architectural layer (presentation, business logic, data). */
  layer:
    'swimlane;whiteSpace=wrap;html=1;fillColor=#F3E5F5;strokeColor=#7B1FA2;' +
    'rounded=1;fontStyle=1;fontSize=13;dashed=1;dashPattern=8 4;',

  /** Zone / boundary (trust zone, network zone, security zone). */
  zone:
    'swimlane;whiteSpace=wrap;html=1;fillColor=#FFF8E1;strokeColor=#F57F17;' +
    'rounded=1;fontStyle=1;fontSize=12;strokeWidth=2;',

  /** Generic grouping container. */
  group:
    'swimlane;whiteSpace=wrap;html=1;fillColor=#F5F5F5;strokeColor=#9E9E9E;' +
    'rounded=1;fontStyle=1;fontSize=12;',

  /** Swimlane for flow diagrams. */
  swimlane:
    'swimlane;whiteSpace=wrap;html=1;fillColor=#ECEFF1;strokeColor=#546E7A;' +
    'fontStyle=1;fontSize=12;startSize=30;horizontal=1;',
} as const;

// ==================== GENERIC RESOURCES ====================

export const GENERIC_RESOURCES: Record<string, GenericResourceDefinition> = {
  // ==================== USER / ACTOR ====================
  'user': {
    type: 'user',
    displayName: 'User',
    icon: '',
    style:
      'shape=mxgraph.azure.user;fillColor=#E3F2FD;strokeColor=#1565C0;' +
      'fontColor=#0D47A1;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 50,
    height: 50,
    category: 'other' as ResourceCategory,
  },
  'userGroup': {
    type: 'userGroup',
    displayName: 'User Group',
    icon: '',
    style:
      'shape=mxgraph.azure.users;fillColor=#E3F2FD;strokeColor=#1565C0;' +
      'fontColor=#0D47A1;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 60,
    height: 50,
    category: 'other' as ResourceCategory,
  },

  // ==================== AGENT / AI ====================
  'agent': {
    type: 'agent',
    displayName: 'Agent',
    icon: '',
    style:
      'shape=mxgraph.signs.tech.robot;fillColor=#E8EAF6;strokeColor=#283593;' +
      'fontColor=#1A237E;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 56,
    height: 56,
    category: 'other' as ResourceCategory,
  },
  'orchestrator': {
    type: 'orchestrator',
    displayName: 'Orchestrator',
    icon: '',
    style:
      'shape=mxgraph.signs.tech.robot;fillColor=#C5CAE9;strokeColor=#1A237E;' +
      'fontColor=#0D47A1;fontStyle=1;fontSize=12;whiteSpace=wrap;shadow=1;strokeWidth=2;',
    width: 72,
    height: 72,
    category: 'other' as ResourceCategory,
  },
  'subAgent': {
    type: 'subAgent',
    displayName: 'Sub-Agent',
    icon: '',
    style:
      'shape=mxgraph.signs.tech.robot;fillColor=#E8EAF6;strokeColor=#5C6BC0;' +
      'fontColor=#283593;fontStyle=0;fontSize=10;whiteSpace=wrap;',
    width: 48,
    height: 48,
    category: 'other' as ResourceCategory,
  },
  'llm': {
    type: 'llm',
    displayName: 'LLM',
    icon: '',
    style:
      'shape=mxgraph.signs.nature.lightning;fillColor=#EDE7F6;strokeColor=#4527A0;' +
      'fontColor=#311B92;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 56,
    height: 56,
    category: 'other' as ResourceCategory,
  },

  // ==================== API / WEB ====================
  'api': {
    type: 'api',
    displayName: 'API',
    icon: '',
    style:
      'shape=mxgraph.signs.tech.antenna_2;fillColor=#E0F7FA;strokeColor=#00695C;' +
      'fontColor=#004D40;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 50,
    height: 50,
    category: 'other' as ResourceCategory,
  },
  'webApp': {
    type: 'webApp',
    displayName: 'Web App',
    icon: '',
    style:
      'shape=mxgraph.mockup.containers.browserWindow;fillColor=#E0F7FA;strokeColor=#00838F;' +
      'fontColor=#006064;fontStyle=1;fontSize=11;whiteSpace=wrap;mainText=;',
    width: 64,
    height: 48,
    category: 'other' as ResourceCategory,
  },
  'mobileApp': {
    type: 'mobileApp',
    displayName: 'Mobile App',
    icon: '',
    style:
      'shape=mxgraph.android.phone2;fillColor=#E0F2F1;strokeColor=#00695C;' +
      'fontColor=#004D40;fontStyle=1;fontSize=10;whiteSpace=wrap;',
    width: 36,
    height: 60,
    category: 'other' as ResourceCategory,
  },

  // ==================== COMPUTE ====================
  'server': {
    type: 'server',
    displayName: 'Server',
    icon: '',
    style:
      'shape=mxgraph.cisco.servers.standard_server;fillColor=#E8F5E9;strokeColor=#2E7D32;' +
      'fontColor=#1B5E20;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 50,
    height: 56,
    category: 'compute',
  },
  'container': {
    type: 'container',
    displayName: 'Container',
    icon: '',
    style:
      'shape=mxgraph.cisco.servers.generic_building_block_(one);fillColor=#E0F2F1;strokeColor=#00796B;' +
      'fontColor=#004D40;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 50,
    height: 44,
    category: 'compute',
  },
  'microservice': {
    type: 'microservice',
    displayName: 'Microservice',
    icon: '',
    style:
      'shape=hexagon;perimeter=hexagonPerimeter2;fillColor=#E8F5E9;strokeColor=#2E7D32;' +
      'fontColor=#1B5E20;fontStyle=1;fontSize=11;whiteSpace=wrap;size=0.25;',
    width: 64,
    height: 56,
    category: 'compute',
  },
  'workflow': {
    type: 'workflow',
    displayName: 'Workflow',
    icon: '',
    style:
      'shape=process;fillColor=#E8F5E9;strokeColor=#388E3C;' +
      'fontColor=#1B5E20;fontStyle=1;fontSize=11;whiteSpace=wrap;size=0.1;',
    width: 64,
    height: 40,
    category: 'compute',
  },

  // ==================== DATA ====================
  'database': {
    type: 'database',
    displayName: 'Database',
    icon: '',
    style:
      'shape=cylinder3;fillColor=#FFF3E0;strokeColor=#E65100;' +
      'fontColor=#BF360C;fontStyle=1;fontSize=11;whiteSpace=wrap;size=15;',
    width: 56,
    height: 64,
    category: 'other' as ResourceCategory,
  },
  'queue': {
    type: 'queue',
    displayName: 'Message Queue',
    icon: '',
    style:
      'shape=mxgraph.cisco.misc.queue;fillColor=#FFF3E0;strokeColor=#EF6C00;' +
      'fontColor=#E65100;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 64,
    height: 40,
    category: 'other' as ResourceCategory,
  },
  'cache': {
    type: 'cache',
    displayName: 'Cache',
    icon: '',
    style:
      'shape=mxgraph.signs.nature.lightning;fillColor=#FFF8E1;strokeColor=#F9A825;' +
      'fontColor=#F57F17;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 48,
    height: 48,
    category: 'other' as ResourceCategory,
  },
  'storage': {
    type: 'storage',
    displayName: 'Storage',
    icon: '',
    style:
      'shape=mxgraph.cisco.storage.disk_group;fillColor=#FFF3E0;strokeColor=#E65100;' +
      'fontColor=#BF360C;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 56,
    height: 48,
    category: 'storage',
  },

  // ==================== NETWORKING ====================
  'gateway': {
    type: 'gateway',
    displayName: 'Gateway',
    icon: '',
    style:
      'shape=mxgraph.cisco.routers.wireless_router;fillColor=#E3F2FD;strokeColor=#1565C0;' +
      'fontColor=#0D47A1;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 56,
    height: 48,
    category: 'networking',
  },
  'loadBalancer': {
    type: 'loadBalancer',
    displayName: 'Load Balancer',
    icon: '',
    style:
      'shape=mxgraph.cisco.switches.layer_3_switch;fillColor=#E3F2FD;strokeColor=#1565C0;' +
      'fontColor=#0D47A1;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 56,
    height: 48,
    category: 'networking',
  },
  'firewall': {
    type: 'firewall',
    displayName: 'Firewall',
    icon: '',
    style:
      'shape=mxgraph.cisco.firewalls.firewall;fillColor=#FFEBEE;strokeColor=#C62828;' +
      'fontColor=#B71C1C;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 56,
    height: 48,
    category: 'security',
  },

  // ==================== MONITORING / NOTIFICATION ====================
  'monitor': {
    type: 'monitor',
    displayName: 'Monitor',
    icon: '',
    style:
      'shape=mxgraph.mockup.graphics.barChart;fillColor=#E8F5E9;strokeColor=#2E7D32;' +
      'fontColor=#1B5E20;fontStyle=1;fontSize=11;whiteSpace=wrap;strokeWidth=1;',
    width: 56,
    height: 48,
    category: 'monitoring',
  },
  'notification': {
    type: 'notification',
    displayName: 'Notification',
    icon: '',
    style:
      'shape=mxgraph.signs.warning.bell;fillColor=#FFF8E1;strokeColor=#F9A825;' +
      'fontColor=#F57F17;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 44,
    height: 48,
    category: 'other' as ResourceCategory,
  },
  'email': {
    type: 'email',
    displayName: 'Email',
    icon: '',
    style:
      'shape=message;fillColor=#E3F2FD;strokeColor=#1565C0;' +
      'fontColor=#0D47A1;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 56,
    height: 40,
    category: 'other' as ResourceCategory,
  },
  'chat': {
    type: 'chat',
    displayName: 'Chat',
    icon: '',
    style:
      'shape=mxgraph.basic.rounded_frame;fillColor=#E8F5E9;strokeColor=#2E7D32;' +
      'fontColor=#1B5E20;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 56,
    height: 48,
    category: 'other' as ResourceCategory,
  },

  // ==================== DOCUMENTS / MISC ====================
  'document': {
    type: 'document',
    displayName: 'Document',
    icon: '',
    style:
      'shape=document;fillColor=#ECEFF1;strokeColor=#546E7A;' +
      'fontColor=#37474F;fontStyle=1;fontSize=11;whiteSpace=wrap;size=0.3;',
    width: 56,
    height: 56,
    category: 'other' as ResourceCategory,
  },

  // ==================== EXTERNAL ====================
  'cloud': {
    type: 'cloud',
    displayName: 'Cloud Service',
    icon: '',
    style:
      'shape=cloud;fillColor=#ECEFF1;strokeColor=#607D8B;' +
      'fontColor=#37474F;fontStyle=1;fontSize=11;whiteSpace=wrap;',
    width: 72,
    height: 48,
    category: 'other' as ResourceCategory,
  },
  'thirdParty': {
    type: 'thirdParty',
    displayName: 'Third-Party Service',
    icon: '',
    style:
      'rounded=1;fillColor=#F3E5F5;strokeColor=#7B1FA2;' +
      'fontColor=#4A148C;fontStyle=1;fontSize=11;whiteSpace=wrap;dashed=1;dashPattern=4 4;',
    width: 64,
    height: 48,
    category: 'other' as ResourceCategory,
  },

  // ==================== CUSTOM ====================
  'custom': {
    type: 'custom',
    displayName: 'Custom',
    icon: '',
    style:
      'rounded=1;fillColor=#FAFAFA;strokeColor=#BDBDBD;' +
      'fontColor=#424242;fontStyle=0;fontSize=11;whiteSpace=wrap;',
    width: 60,
    height: 48,
    category: 'other' as ResourceCategory,
  },
};

// ==================== GENERIC CONTAINER DEFINITIONS ====================

/**
 * Container ResourceDefinitions for generic system blocks.
 * These parallel the Azure hierarchy containers (subscription, resourceGroup, etc.)
 * but are technology-agnostic.
 */
export const GENERIC_CONTAINERS: Record<string, GenericResourceDefinition> = {
  'system': {
    type: 'system',
    displayName: 'System',
    icon: '',
    style: '',
    width: 0,
    height: 0,
    isContainer: true,
    containerStyle: GENERIC_CONTAINER_STYLES.system,
    canContain: ['layer', 'zone', 'group', 'swimlane'],
    category: 'other' as ResourceCategory,
  },
  'layer': {
    type: 'layer',
    displayName: 'Layer',
    icon: '',
    style: '',
    width: 0,
    height: 0,
    isContainer: true,
    containerStyle: GENERIC_CONTAINER_STYLES.layer,
    containedBy: ['system'],
    canContain: ['group', 'zone'],
    category: 'other' as ResourceCategory,
  },
  'zone': {
    type: 'zone',
    displayName: 'Zone',
    icon: '',
    style: '',
    width: 0,
    height: 0,
    isContainer: true,
    containerStyle: GENERIC_CONTAINER_STYLES.zone,
    containedBy: ['system', 'layer'],
    canContain: ['group'],
    category: 'other' as ResourceCategory,
  },
  'group': {
    type: 'group',
    displayName: 'Group',
    icon: '',
    style: '',
    width: 0,
    height: 0,
    isContainer: true,
    containerStyle: GENERIC_CONTAINER_STYLES.group,
    containedBy: ['system', 'layer', 'zone', 'swimlane'],
    category: 'other' as ResourceCategory,
  },
  'swimlane': {
    type: 'swimlane',
    displayName: 'Swimlane',
    icon: '',
    style: '',
    width: 0,
    height: 0,
    isContainer: true,
    containerStyle: GENERIC_CONTAINER_STYLES.swimlane,
    containedBy: ['system'],
    canContain: ['group'],
    category: 'other' as ResourceCategory,
  },
};

// ==================== ALIASES ====================

/**
 * Human-friendly aliases that map to GENERIC_RESOURCES keys.
 * Used by the AI parser and CLI to resolve fuzzy input.
 */
export const GENERIC_ALIASES: Record<string, string> = {
  // User / Actor
  'person': 'user',
  'actor': 'user',
  'end user': 'user',
  'client': 'user',
  'customer': 'user',
  'people': 'userGroup',
  'users': 'userGroup',
  'team': 'userGroup',

  // Agent / AI
  'robot': 'agent',
  'bot': 'agent',
  'ai agent': 'agent',
  'assistant': 'agent',
  'coordinator': 'orchestrator',
  'hub': 'orchestrator',
  'controller': 'orchestrator',
  'worker': 'subAgent',
  'sub agent': 'subAgent',
  'child agent': 'subAgent',
  'ai': 'llm',
  'language model': 'llm',
  'gpt': 'llm',
  'model': 'llm',
  'brain': 'llm',

  // API / Web
  'endpoint': 'api',
  'rest api': 'api',
  'graphql': 'api',
  'grpc': 'api',
  'web application': 'webApp',
  'website': 'webApp',
  'frontend': 'webApp',
  'spa': 'webApp',
  'ui': 'webApp',
  'mobile': 'mobileApp',
  'ios': 'mobileApp',
  'android': 'mobileApp',
  'app': 'mobileApp',
  'phone': 'mobileApp',

  // Compute
  'host': 'server',
  'instance': 'server',
  'machine': 'server',
  'vm': 'server',
  'node': 'server',
  'docker': 'container',
  'pod': 'container',
  'k8s': 'container',
  'kubernetes': 'container',
  'svc': 'microservice',
  'service': 'microservice',
  'lambda': 'microservice',
  'function': 'microservice',
  'process': 'workflow',
  'pipeline': 'workflow',
  'flow': 'workflow',
  'step': 'workflow',

  // Data
  'db': 'database',
  'datastore': 'database',
  'data store': 'database',
  'sql': 'database',
  'nosql': 'database',
  'postgres': 'database',
  'mysql': 'database',
  'mongo': 'database',
  'redis': 'cache',
  'memcached': 'cache',
  'in-memory': 'cache',
  'message queue': 'queue',
  'mq': 'queue',
  'broker': 'queue',
  'kafka': 'queue',
  'rabbitmq': 'queue',
  'sqs': 'queue',
  'pub/sub': 'queue',
  'pubsub': 'queue',
  'event bus': 'queue',
  'blob': 'storage',
  's3': 'storage',
  'bucket': 'storage',
  'file storage': 'storage',
  'disk': 'storage',
  'object storage': 'storage',

  // Networking
  'router': 'gateway',
  'api gateway': 'gateway',
  'reverse proxy': 'gateway',
  'proxy': 'gateway',
  'ingress': 'gateway',
  'lb': 'loadBalancer',
  'load-balancer': 'loadBalancer',
  'balancer': 'loadBalancer',
  'nginx': 'loadBalancer',
  'haproxy': 'loadBalancer',
  'waf': 'firewall',
  'security': 'firewall',
  'shield': 'firewall',

  // Monitoring / Notification
  'dashboard': 'monitor',
  'metrics': 'monitor',
  'observability': 'monitor',
  'logging': 'monitor',
  'logs': 'monitor',
  'alerting': 'notification',
  'alert': 'notification',
  'bell': 'notification',
  'push notification': 'notification',
  'mail': 'email',
  'smtp': 'email',
  'inbox': 'email',
  'messaging': 'chat',
  'im': 'chat',
  'slack': 'chat',
  'teams': 'chat',

  // Documents / Misc
  'doc': 'document',
  'file': 'document',
  'pdf': 'document',
  'report': 'document',
  'template': 'document',

  // External
  'external': 'thirdParty',
  'third party': 'thirdParty',
  '3rd party': 'thirdParty',
  'external service': 'thirdParty',
  'saas': 'thirdParty',
  'cloud service': 'cloud',
  'aws': 'cloud',
  'azure': 'cloud',
  'gcp': 'cloud',

  // Container types (aliases for system blocks)
  'boundary': 'system',
  'system boundary': 'system',
  'domain': 'system',
  'tier': 'layer',
  'level': 'layer',
  'trust zone': 'zone',
  'network zone': 'zone',
  'segment': 'zone',
  'cluster': 'group',
  'pool': 'group',
  'lane': 'swimlane',
};

// ==================== RESOLUTION ====================

/**
 * Resolve a human-friendly name to a generic resource type key.
 *
 * Checks GENERIC_RESOURCES first, then GENERIC_ALIASES, then
 * GENERIC_CONTAINERS. Returns `undefined` if no match.
 */
export function resolveGenericResourceType(input: string): string | undefined {
  const normalized = input.toLowerCase().trim();

  // Direct match against resource keys
  if (GENERIC_RESOURCES[normalized]) return normalized;

  // Direct match against container keys
  if (GENERIC_CONTAINERS[normalized]) return normalized;

  // Check aliases
  if (GENERIC_ALIASES[normalized]) return GENERIC_ALIASES[normalized];

  return undefined;
}

/**
 * Get the GenericResourceDefinition for a type key.
 * Searches both resources and containers.
 */
export function getGenericResource(typeKey: string): GenericResourceDefinition | undefined {
  return GENERIC_RESOURCES[typeKey] ?? GENERIC_CONTAINERS[typeKey];
}

/**
 * List all generic resource type keys (excluding containers).
 */
export function listGenericResources(): string[] {
  return Object.keys(GENERIC_RESOURCES);
}

/**
 * List all generic container type keys.
 */
export function listGenericContainers(): string[] {
  return Object.keys(GENERIC_CONTAINERS);
}
