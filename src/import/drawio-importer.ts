/**
 * Draw.io Importer — parses .drawio XML files into Architecture model
 * 
 * Handles:
 * - mxCell parsing with style/label/position/parent extraction
 * - Icon path → resource type mapping via shape-mapper
 * - Container hierarchy reconstruction (subscription → region → RG → VNet → subnet → resources)
 * - Edge/connection extraction
 * - Manual mapping override for unrecognized shapes
 */

import { convert } from 'xmlbuilder2';
import { matchShape, extractIconPath } from './shape-mapper.js';
import { RESOURCES } from '../schema/resources.js';
import { generateCellId } from '../utils/id-generator.js';
import type {
  ImportResult,
  ImportMapping,
  MappedShape,
  UnrecognizedShape,
  ManualMapping,
  ParsedCell,
} from './types.js';
import type {
  Architecture,
  Resource,
  VNet,
  Subnet,
  ResourceGroup,
  Region,
  Subscription,
  Connection,
  OnPremises,
} from '../schema/types.js';

// ==================== XML Parsing ====================

/**
 * Parse .drawio XML string into an array of ParsedCells.
 */
function parseCells(xml: string): ParsedCell[] {
  let obj: any;
  try {
    obj = convert(xml, { format: 'object' });
  } catch {
    throw new Error('Invalid XML: could not parse the .drawio file');
  }

  // Navigate to root cells: mxGraphModel > root > mxCell (or mxfile > diagram > mxGraphModel > root > mxCell)
  const root = findRoot(obj);
  if (!root) {
    throw new Error('Invalid .drawio file: could not find mxGraphModel root');
  }

  const rawCells = Array.isArray(root.mxCell) ? root.mxCell : root.mxCell ? [root.mxCell] : [];
  
  // Also check for UserObject elements (Draw.io sometimes wraps cells)
  const userObjects = Array.isArray(root.UserObject) ? root.UserObject : root.UserObject ? [root.UserObject] : [];
  
  const cells: ParsedCell[] = [];

  for (const raw of rawCells) {
    const cell = extractCell(raw);
    if (cell) cells.push(cell);
  }

  for (const uo of userObjects) {
    // UserObject has label in @label and contains mxCell child
    const innerCell = uo.mxCell || {};
    const cell = extractCell({
      ...innerCell,
      '@id': uo['@id'] || innerCell['@id'],
      '@value': uo['@label'] || uo['@value'] || innerCell['@value'] || '',
      '@style': innerCell['@style'] || uo['@style'] || '',
      '@parent': innerCell['@parent'] || uo['@parent'] || '',
      '@vertex': innerCell['@vertex'] || uo['@vertex'],
      '@edge': innerCell['@edge'] || uo['@edge'],
      '@source': innerCell['@source'] || uo['@source'],
      '@target': innerCell['@target'] || uo['@target'],
    });
    if (cell) cells.push(cell);
  }

  return cells;
}

/**
 * Find the root element containing mxCell arrays.
 */
function findRoot(obj: any): any {
  // Case 1: <mxGraphModel><root>...</root></mxGraphModel>
  if (obj.mxGraphModel?.root) return obj.mxGraphModel.root;

  // Case 2: <mxfile><diagram><mxGraphModel><root>...</root></mxGraphModel></diagram></mxfile>
  if (obj.mxfile) {
    const diagrams = obj.mxfile.diagram;
    const diagramArr = Array.isArray(diagrams) ? diagrams : diagrams ? [diagrams] : [];
    for (const d of diagramArr) {
      if (d.mxGraphModel?.root) return d.mxGraphModel.root;
      // Sometimes the content is compressed/encoded — try the text content
      if (typeof d === 'string' || typeof d['#'] === 'string') {
        const text = typeof d === 'string' ? d : d['#'];
        try {
          const decoded = decodeDrawioContent(text);
          const inner = convert(decoded, { format: 'object' }) as any;
          if (inner.mxGraphModel?.root) return inner.mxGraphModel.root;
        } catch { /* skip */ }
      }
    }
  }

  return null;
}

/**
 * Decode compressed Draw.io diagram content (base64 + inflate).
 */
function decodeDrawioContent(encoded: string): string {
  // Draw.io can store diagram data as base64-encoded, deflated XML
  // For our purposes, we handle plain XML. Compressed content would need pako.
  // If it looks like base64, try decoding
  if (/^[A-Za-z0-9+/=]+$/.test(encoded.trim()) && encoded.length > 50) {
    try {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    } catch { /* not base64 */ }
  }
  return encoded;
}

/**
 * Extract a ParsedCell from a raw XML object.
 */
function extractCell(raw: any): ParsedCell | null {
  const id = raw['@id'] ?? raw['@_id'] ?? '';
  if (!id || id === '0' || id === '1') return null; // Skip root cells

  const style = raw['@style'] ?? raw['@_style'] ?? '';
  const value = stripHtml(raw['@value'] ?? raw['@_value'] ?? '');
  const parent = raw['@parent'] ?? raw['@_parent'] ?? '1';
  const vertex = raw['@vertex'] === '1' || raw['@_vertex'] === '1';
  const edge = raw['@edge'] === '1' || raw['@_edge'] === '1';
  const source = raw['@source'] ?? raw['@_source'];
  const target = raw['@target'] ?? raw['@_target'];

  // Extract geometry
  let x = 0, y = 0, width = 0, height = 0;
  const geo = raw.mxGeometry || {};
  x = parseFloat(geo['@x'] ?? geo['@_x'] ?? '0') || 0;
  y = parseFloat(geo['@y'] ?? geo['@_y'] ?? '0') || 0;
  width = parseFloat(geo['@width'] ?? geo['@_width'] ?? '0') || 0;
  height = parseFloat(geo['@height'] ?? geo['@_height'] ?? '0') || 0;

  const isContainer = style.includes('swimlane') || (width > 150 && height > 150 && !edge && style.includes('group'));
  const iconPath = extractIconPath(style);

  return {
    id: String(id),
    value,
    style,
    parent: String(parent),
    vertex,
    edge,
    source: source ? String(source) : undefined,
    target: target ? String(target) : undefined,
    x, y, width, height,
    isContainer,
    iconPath,
  };
}

/**
 * Strip basic HTML tags from cell value text.
 */
function stripHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ==================== Architecture Reconstruction ====================

/**
 * Import a .drawio XML string and produce an ImportResult.
 */
export function importDrawio(xml: string, manualMappings?: ManualMapping[]): ImportResult {
  const cells = parseCells(xml);

  if (cells.length === 0) {
    return {
      architecture: { title: 'Imported Diagram', connections: [] },
      xml,
      mapping: { mapped: [], unrecognized: [], totalShapes: 0 },
    };
  }

  // Build manual mapping lookup
  const manualMap = new Map<string, string>();
  if (manualMappings) {
    for (const m of manualMappings) {
      manualMap.set(m.cellId, m.resourceType);
    }
  }

  // Separate vertices and edges
  const vertices = cells.filter(c => c.vertex && !c.edge);
  const edges = cells.filter(c => c.edge);

  // Map each vertex to a resource type
  const mapped: MappedShape[] = [];
  const unrecognized: UnrecognizedShape[] = [];
  const cellTypeMap = new Map<string, { type: string; isContainer: boolean; containerType?: string }>();

  for (const cell of vertices) {
    // Check manual mapping first
    if (manualMap.has(cell.id)) {
      const resourceType = manualMap.get(cell.id)!;
      mapped.push({ cellId: cell.id, label: cell.value, resourceType, confidence: 'exact' });
      const resDef = RESOURCES[resourceType];
      cellTypeMap.set(cell.id, {
        type: resourceType,
        isContainer: resDef?.isContainer || false,
        containerType: resDef?.isContainer ? resourceType : undefined,
      });
      continue;
    }

    const match = matchShape(cell.style, cell.value);

    if (match.confidence === 'unrecognized') {
      // Only add if it has a label (skip pure decoration)
      if (cell.value || cell.iconPath) {
        unrecognized.push({
          cellId: cell.id,
          label: cell.value || '(unnamed)',
          style: cell.style.substring(0, 200), // truncate for display
          suggestedType: undefined,
        });
      }
    } else {
      mapped.push({
        cellId: cell.id,
        label: cell.value,
        resourceType: match.resourceType,
        confidence: match.confidence,
      });
      cellTypeMap.set(cell.id, {
        type: match.resourceType,
        isContainer: match.isContainer,
        containerType: match.containerType,
      });
    }
  }

  // Build parent→children map
  const childrenMap = new Map<string, ParsedCell[]>();
  for (const cell of vertices) {
    const parent = cell.parent || '1';
    if (!childrenMap.has(parent)) childrenMap.set(parent, []);
    childrenMap.get(parent)!.push(cell);
  }

  // Build the architecture hierarchy
  const architecture = buildArchitecture(vertices, edges, cellTypeMap, childrenMap);

  return {
    architecture,
    xml,
    mapping: {
      mapped,
      unrecognized,
      totalShapes: vertices.length,
    },
  };
}

/**
 * Build an Architecture object from parsed cells and their mappings.
 */
function buildArchitecture(
  vertices: ParsedCell[],
  edges: ParsedCell[],
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
  childrenMap: Map<string, ParsedCell[]>,
): Architecture {
  // Find top-level containers (parent = '1' which is the root)
  const topLevelCells = childrenMap.get('1') || [];
  
  const regions: Region[] = [];
  const resourceGroups: ResourceGroup[] = [];
  const globalResources: Resource[] = [];
  const onPremises: OnPremises[] = [];
  let subscription: Subscription | undefined;

  for (const cell of topLevelCells) {
    const mapping = cellTypeMap.get(cell.id);
    if (!mapping) {
      // Unrecognized top-level cell — if it's big enough, treat as container
      if (cell.isContainer) {
        const rg = buildResourceGroup(cell, cellTypeMap, childrenMap);
        resourceGroups.push(rg);
      }
      continue;
    }

    switch (mapping.containerType) {
      case 'subscription':
        subscription = buildSubscription(cell, cellTypeMap, childrenMap);
        break;
      case 'region':
        regions.push(buildRegion(cell, cellTypeMap, childrenMap));
        break;
      case 'resourceGroup':
        resourceGroups.push(buildResourceGroup(cell, cellTypeMap, childrenMap));
        break;
      case 'vnet':
      case 'vnetHub':
        // VNet at top level — wrap in a resource group
        resourceGroups.push({
          name: 'Imported Resources',
          resources: [buildVNet(cell, cellTypeMap, childrenMap)],
        });
        break;
      case 'onPremises':
        onPremises.push(buildOnPremises(cell, cellTypeMap, childrenMap));
        break;
      default:
        if (mapping.isContainer) {
          resourceGroups.push(buildResourceGroup(cell, cellTypeMap, childrenMap));
        } else {
          globalResources.push(buildResource(cell, mapping.type));
        }
    }
  }

  // Handle flat structures (all resources at root level with no containers)
  if (!subscription && regions.length === 0 && resourceGroups.length === 0) {
    const flatResources: (Resource | VNet)[] = [];
    for (const cell of topLevelCells) {
      const mapping = cellTypeMap.get(cell.id);
      if (mapping && !mapping.isContainer) {
        flatResources.push(buildResource(cell, mapping.type));
      }
    }
    if (flatResources.length > 0) {
      resourceGroups.push({
        name: 'Imported Resources',
        resources: flatResources,
      });
    }
  }

  // Build connections from edges
  const connections = buildConnections(edges, cellTypeMap, vertices);

  const title = extractTitle(vertices, cellTypeMap) || 'Imported Architecture';

  const architecture: Architecture = { title, connections };

  if (subscription) {
    architecture.subscription = subscription;
  }
  if (regions.length > 0) {
    architecture.regions = regions;
  }
  if (resourceGroups.length > 0) {
    if (!architecture.subscription) {
      architecture.subscription = { name: 'Azure Subscription', resourceGroups };
    } else {
      architecture.subscription.resourceGroups = [
        ...(architecture.subscription.resourceGroups || []),
        ...resourceGroups,
      ];
    }
  }
  if (globalResources.length > 0) {
    architecture.globalResources = globalResources;
  }
  if (onPremises.length > 0) {
    architecture.onPremises = onPremises;
  }

  return architecture;
}

// ==================== Hierarchy Builders ====================

function buildSubscription(
  cell: ParsedCell,
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
  childrenMap: Map<string, ParsedCell[]>,
): Subscription {
  const children = childrenMap.get(cell.id) || [];
  const rgs: ResourceGroup[] = [];
  const regions: Region[] = [];

  for (const child of children) {
    const mapping = cellTypeMap.get(child.id);
    if (mapping?.containerType === 'region') {
      regions.push(buildRegion(child, cellTypeMap, childrenMap));
    } else if (mapping?.containerType === 'resourceGroup') {
      rgs.push(buildResourceGroup(child, cellTypeMap, childrenMap));
    } else if (mapping?.isContainer) {
      rgs.push(buildResourceGroup(child, cellTypeMap, childrenMap));
    } else if (mapping) {
      // Non-container resource directly in subscription — add to default RG
      if (rgs.length === 0 || rgs[rgs.length - 1].name !== 'Default') {
        rgs.push({ name: 'Default', resources: [] });
      }
      rgs[rgs.length - 1].resources.push(buildResource(child, mapping.type));
    }
  }

  return {
    name: cell.value || 'Azure Subscription',
    resourceGroups: rgs.length > 0 ? rgs : undefined,
    regions: regions.length > 0 ? regions : undefined,
  };
}

function buildRegion(
  cell: ParsedCell,
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
  childrenMap: Map<string, ParsedCell[]>,
): Region {
  const children = childrenMap.get(cell.id) || [];
  const rgs: ResourceGroup[] = [];
  const resources: (Resource | VNet)[] = [];

  for (const child of children) {
    const mapping = cellTypeMap.get(child.id);
    if (mapping?.containerType === 'resourceGroup') {
      rgs.push(buildResourceGroup(child, cellTypeMap, childrenMap));
    } else if (mapping?.containerType === 'vnet' || mapping?.containerType === 'vnetHub') {
      resources.push(buildVNet(child, cellTypeMap, childrenMap));
    } else if (mapping?.isContainer) {
      rgs.push(buildResourceGroup(child, cellTypeMap, childrenMap));
    } else if (mapping) {
      resources.push(buildResource(child, mapping.type));
    }
  }

  return {
    name: cell.value || 'Region',
    resourceGroups: rgs.length > 0 ? rgs : undefined,
    resources: resources.length > 0 ? resources : undefined,
  };
}

function buildResourceGroup(
  cell: ParsedCell,
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
  childrenMap: Map<string, ParsedCell[]>,
): ResourceGroup {
  const children = childrenMap.get(cell.id) || [];
  const resources: (Resource | VNet)[] = [];

  for (const child of children) {
    const mapping = cellTypeMap.get(child.id);
    if (mapping?.containerType === 'vnet' || mapping?.containerType === 'vnetHub') {
      resources.push(buildVNet(child, cellTypeMap, childrenMap));
    } else if (mapping?.isContainer) {
      // Nested container inside RG — could be a subnet without a VNet parent, etc.
      resources.push(buildVNet(child, cellTypeMap, childrenMap));
    } else if (mapping) {
      resources.push(buildResource(child, mapping.type));
    }
  }

  return {
    name: cell.value || 'Resource Group',
    resources,
  };
}

function buildVNet(
  cell: ParsedCell,
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
  childrenMap: Map<string, ParsedCell[]>,
): VNet {
  const children = childrenMap.get(cell.id) || [];
  const subnets: Subnet[] = [];
  const mapping = cellTypeMap.get(cell.id);
  const isHub = mapping?.containerType === 'vnetHub' || mapping?.type === 'hubVnet';

  for (const child of children) {
    const childMapping = cellTypeMap.get(child.id);
    if (childMapping?.containerType === 'subnet') {
      subnets.push(buildSubnet(child, cellTypeMap, childrenMap));
    } else if (childMapping?.isContainer) {
      // Treat unknown containers inside VNet as subnets
      subnets.push(buildSubnet(child, cellTypeMap, childrenMap));
    } else if (childMapping) {
      // Resource directly in VNet without a subnet — put in a default subnet
      if (subnets.length === 0 || subnets[subnets.length - 1].name !== 'default') {
        subnets.push({
          id: generateCellId('subnet'),
          type: 'subnet',
          name: 'default',
          resources: [],
        });
      }
      subnets[subnets.length - 1].resources!.push(buildResource(child, childMapping.type));
    }
  }

  return {
    id: cell.id,
    type: isHub ? 'hubVnet' : 'vnet',
    name: cell.value || (isHub ? 'Hub VNet' : 'Virtual Network'),
    subnets: subnets.length > 0 ? subnets : undefined,
  };
}

function buildSubnet(
  cell: ParsedCell,
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
  childrenMap: Map<string, ParsedCell[]>,
): Subnet {
  const children = childrenMap.get(cell.id) || [];
  const resources: Resource[] = [];

  for (const child of children) {
    const childMapping = cellTypeMap.get(child.id);
    if (childMapping && !childMapping.isContainer) {
      resources.push(buildResource(child, childMapping.type));
    }
  }

  return {
    id: cell.id,
    type: 'subnet',
    name: cell.value || 'Subnet',
    resources: resources.length > 0 ? resources : undefined,
  };
}

function buildOnPremises(
  cell: ParsedCell,
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
  childrenMap: Map<string, ParsedCell[]>,
): OnPremises {
  const children = childrenMap.get(cell.id) || [];
  const resources: Resource[] = [];

  for (const child of children) {
    const mapping = cellTypeMap.get(child.id);
    if (mapping) {
      resources.push(buildResource(child, mapping.type));
    }
  }

  return {
    name: cell.value || 'On-Premises',
    resources: resources.length > 0 ? resources : undefined,
  };
}

function buildResource(cell: ParsedCell, type: string): Resource {
  return {
    id: cell.id,
    type,
    name: cell.value || RESOURCES[type]?.displayName || type,
  };
}

// ==================== Connections ====================

function buildConnections(
  edges: ParsedCell[],
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
  vertices: ParsedCell[],
): Connection[] {
  const connections: Connection[] = [];
  const vertexMap = new Map(vertices.map(v => [v.id, v]));

  for (const edge of edges) {
    if (!edge.source || !edge.target) continue;

    // Find the resource names for from/to
    const sourceCell = vertexMap.get(edge.source);
    const targetCell = vertexMap.get(edge.target);

    const from = sourceCell?.value || edge.source;
    const to = targetCell?.value || edge.target;

    const connection: Connection = { from, to };

    // Add label if present
    if (edge.value) {
      connection.label = edge.value;
    }

    // Detect connection style
    if (edge.style.includes('dashed')) {
      connection.style = 'dashed';
    } else if (edge.value?.toLowerCase().includes('peering') || edge.value?.toLowerCase().includes('vnet peering')) {
      connection.style = 'peering';
    } else if (edge.value?.toLowerCase().includes('vpn')) {
      connection.style = 'vpn';
    } else if (edge.value?.toLowerCase().includes('expressroute')) {
      connection.style = 'expressroute';
    }

    connections.push(connection);
  }

  return connections;
}

// ==================== Helpers ====================

/**
 * Try to extract a title from the diagram content.
 */
function extractTitle(
  vertices: ParsedCell[],
  cellTypeMap: Map<string, { type: string; isContainer: boolean; containerType?: string }>,
): string | undefined {
  // Look for a text-only cell (no icon, not a container) that looks like a title
  for (const cell of vertices) {
    const mapping = cellTypeMap.get(cell.id);
    if (!mapping && cell.value && !cell.iconPath && !cell.isContainer) {
      // Large text or positioned at top — likely a title
      if (cell.style.includes('fontSize') && cell.value.length < 100) {
        const fontSizeMatch = cell.style.match(/fontSize=(\d+)/);
        if (fontSizeMatch && parseInt(fontSizeMatch[1]) >= 16) {
          return cell.value;
        }
      }
    }
  }

  // Fall back to the first subscription or top-level container name
  for (const cell of vertices) {
    const mapping = cellTypeMap.get(cell.id);
    if (mapping?.containerType === 'subscription' && cell.value) {
      return cell.value;
    }
  }

  return undefined;
}
