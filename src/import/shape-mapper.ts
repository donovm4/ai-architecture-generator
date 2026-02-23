/**
 * Shape Mapper — maps Draw.io icon paths, labels, and styles to Azure resource types
 * 
 * Supports:
 * - Exact matching via icon path → resource type reverse map
 * - Fuzzy matching via label text → resource aliases
 * - Container detection via swimlane styles
 */

import { AZURE_ICONS, RESOURCES, RESOURCE_ALIASES, CONTAINER_STYLES } from '../schema/resources.js';

export interface ShapeMatch {
  resourceType: string;
  confidence: 'exact' | 'fuzzy' | 'unrecognized';
  isContainer: boolean;
  containerType?: string; // e.g., 'subscription', 'resourceGroup', 'vnet', 'subnet', 'region'
}

// ==================== Reverse Maps ====================

/** icon path → resource type key (e.g., 'img/lib/azure2/compute/Virtual_Machine.svg' → 'vm') */
const ICON_TO_RESOURCE: Record<string, string> = {};
for (const [type, icon] of Object.entries(AZURE_ICONS)) {
  // Only set if not already mapped (first wins — avoids duplicates like subnet/vnet sharing an icon)
  if (!ICON_TO_RESOURCE[icon]) {
    ICON_TO_RESOURCE[icon] = type;
  }
}

/** Container style substring → container type */
const CONTAINER_STYLE_MAP: Record<string, string> = {};
for (const [containerType, style] of Object.entries(CONTAINER_STYLES)) {
  CONTAINER_STYLE_MAP[style] = containerType;
}

/** displayName (lowered) → resource key */
const DISPLAY_NAME_TO_RESOURCE: Record<string, string> = {};
for (const [key, def] of Object.entries(RESOURCES)) {
  DISPLAY_NAME_TO_RESOURCE[def.displayName.toLowerCase()] = key;
}

// ==================== Public API ====================

/**
 * Given a Draw.io cell's style string and label, determine the Azure resource type.
 */
export function matchShape(style: string, label: string): ShapeMatch {
  // 1. Check if it's a container (swimlane)
  const containerResult = matchContainer(style, label);
  if (containerResult) return containerResult;

  // 2. Try exact icon path match
  const iconPath = extractIconPath(style);
  if (iconPath) {
    const resourceType = ICON_TO_RESOURCE[iconPath];
    if (resourceType) {
      return { resourceType, confidence: 'exact', isContainer: false };
    }
    // Try partial path match (some diagrams use slightly different paths)
    const partialMatch = findPartialIconMatch(iconPath);
    if (partialMatch) {
      return { resourceType: partialMatch, confidence: 'exact', isContainer: false };
    }
  }

  // 3. Try fuzzy match on label text
  if (label) {
    const fuzzyResult = fuzzyMatchLabel(label);
    if (fuzzyResult) {
      return { resourceType: fuzzyResult, confidence: 'fuzzy', isContainer: false };
    }
  }

  return { resourceType: '', confidence: 'unrecognized', isContainer: false };
}

/**
 * Extract the image= path from a Draw.io style string.
 * Example: "...image=img/lib/azure2/compute/Virtual_Machine.svg;..." → "img/lib/azure2/compute/Virtual_Machine.svg"
 */
export function extractIconPath(style: string): string | undefined {
  if (!style) return undefined;
  // Match image=...svg (stop at ; or end of string)
  const match = style.match(/image=(img\/lib\/[^;]+\.svg)/);
  return match?.[1];
}

/**
 * Check if a style represents a container (swimlane).
 */
function matchContainer(style: string, label: string): ShapeMatch | null {
  if (!style) return null;

  const isSwimlane = style.includes('swimlane');
  if (!isSwimlane) return null;

  // Try to match the exact container style
  for (const [containerStyle, containerType] of Object.entries(CONTAINER_STYLE_MAP)) {
    // Compare key style properties (fillColor, strokeColor) rather than exact string
    const fillMatch = extractStyleProp(containerStyle, 'fillColor');
    const strokeMatch = extractStyleProp(containerStyle, 'strokeColor');

    if (fillMatch && strokeMatch) {
      const cellFill = extractStyleProp(style, 'fillColor');
      const cellStroke = extractStyleProp(style, 'strokeColor');
      if (cellFill === fillMatch && cellStroke === strokeMatch) {
        return {
          resourceType: containerType,
          confidence: 'exact',
          isContainer: true,
          containerType,
        };
      }
    }
  }

  // Fall back to label-based container detection
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('subscription')) {
    return { resourceType: 'subscription', confidence: 'fuzzy', isContainer: true, containerType: 'subscription' };
  }
  if (lowerLabel.includes('resource group') || lowerLabel.match(/\brg\b/)) {
    return { resourceType: 'resourceGroup', confidence: 'fuzzy', isContainer: true, containerType: 'resourceGroup' };
  }
  if (lowerLabel.includes('hub') && (lowerLabel.includes('vnet') || lowerLabel.includes('virtual network'))) {
    return { resourceType: 'hubVnet', confidence: 'fuzzy', isContainer: true, containerType: 'vnetHub' };
  }
  if (lowerLabel.includes('vnet') || lowerLabel.includes('virtual network')) {
    return { resourceType: 'vnet', confidence: 'fuzzy', isContainer: true, containerType: 'vnet' };
  }
  if (lowerLabel.includes('subnet') || lowerLabel.includes('snet')) {
    return { resourceType: 'subnet', confidence: 'fuzzy', isContainer: true, containerType: 'subnet' };
  }
  if (lowerLabel.includes('region') || lowerLabel.match(/\b(west|east|north|south|central)\b.*\b(us|europe|asia|uk|japan|australia|canada|brazil|india|korea|france|germany|norway|switzerland|uae)\b/i)) {
    return { resourceType: 'region', confidence: 'fuzzy', isContainer: true, containerType: 'region' };
  }
  if (lowerLabel.includes('availability zone') || lowerLabel.match(/\baz\s*\d/)) {
    return { resourceType: 'availabilityZone', confidence: 'fuzzy', isContainer: true, containerType: 'availabilityZone' };
  }
  if (lowerLabel.includes('on-prem') || lowerLabel.includes('on prem') || lowerLabel.includes('datacenter') || lowerLabel.includes('data center')) {
    return { resourceType: 'onPremises', confidence: 'fuzzy', isContainer: true, containerType: 'onPremises' };
  }

  // Generic swimlane — treat as resourceGroup by default
  return { resourceType: 'resourceGroup', confidence: 'fuzzy', isContainer: true, containerType: 'resourceGroup' };
}

/**
 * Try to match a label to a known resource type using aliases and display names.
 */
function fuzzyMatchLabel(label: string): string | undefined {
  const lower = label.toLowerCase().trim();

  // Strip common prefixes like "Azure " for matching
  const stripped = lower.replace(/^azure\s+/i, '');

  // 1. Exact alias match
  if (RESOURCE_ALIASES[lower]) return RESOURCE_ALIASES[lower];
  if (RESOURCE_ALIASES[stripped]) return RESOURCE_ALIASES[stripped];

  // 2. Direct resource key match
  if (RESOURCES[lower]) return lower;
  if (RESOURCES[stripped]) return stripped;

  // 3. Display name match
  if (DISPLAY_NAME_TO_RESOURCE[lower]) return DISPLAY_NAME_TO_RESOURCE[lower];
  if (DISPLAY_NAME_TO_RESOURCE[stripped]) return DISPLAY_NAME_TO_RESOURCE[stripped];

  // 4. Partial word matching — check if label contains a known display name
  for (const [displayName, key] of Object.entries(DISPLAY_NAME_TO_RESOURCE)) {
    if (lower.includes(displayName) || displayName.includes(lower)) {
      return key;
    }
  }

  // 5. Try aliases with partial matching
  for (const [alias, key] of Object.entries(RESOURCE_ALIASES)) {
    if (alias.length >= 3 && (lower.includes(alias) || alias.includes(lower))) {
      return key;
    }
  }

  return undefined;
}

/**
 * Try to find a partial icon path match (e.g., matching the filename portion).
 */
function findPartialIconMatch(iconPath: string): string | undefined {
  // Extract just the filename
  const filename = iconPath.split('/').pop()?.replace('.svg', '').toLowerCase();
  if (!filename) return undefined;

  for (const [path, resourceType] of Object.entries(ICON_TO_RESOURCE)) {
    const knownFilename = path.split('/').pop()?.replace('.svg', '').toLowerCase();
    if (knownFilename && knownFilename === filename) {
      return resourceType;
    }
  }

  return undefined;
}

/**
 * Extract a specific property value from a Draw.io style string.
 */
function extractStyleProp(style: string, prop: string): string | undefined {
  const regex = new RegExp(`${prop}=([^;]+)`);
  return style.match(regex)?.[1];
}

/**
 * Get all known resource types for dropdown population in the UI.
 */
export function getAllResourceTypes(): Array<{ key: string; displayName: string; category: string }> {
  return Object.entries(RESOURCES).map(([key, def]) => ({
    key,
    displayName: def.displayName,
    category: def.category,
  }));
}
