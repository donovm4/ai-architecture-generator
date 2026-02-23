/**
 * Types for Draw.io diagram import & reverse engineering
 */

import type { Architecture } from '../schema/types.js';

/** Result of importing a .drawio file */
export interface ImportResult {
  architecture: Architecture;
  xml: string;
  mapping: ImportMapping;
}

/** Mapping summary from import parsing */
export interface ImportMapping {
  mapped: MappedShape[];
  unrecognized: UnrecognizedShape[];
  totalShapes: number;
}

/** A shape that was successfully mapped to an Azure resource type */
export interface MappedShape {
  cellId: string;
  label: string;
  resourceType: string;
  confidence: 'exact' | 'fuzzy';
}

/** A shape that couldn't be automatically mapped */
export interface UnrecognizedShape {
  cellId: string;
  label: string;
  style: string;
  suggestedType?: string;
}

/** User-provided manual mapping for unrecognized shapes */
export interface ManualMapping {
  cellId: string;
  resourceType: string;
}

/** Intermediate parsed cell from Draw.io XML */
export interface ParsedCell {
  id: string;
  value: string;       // label text
  style: string;
  parent: string;
  vertex: boolean;
  edge: boolean;
  source?: string;
  target?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isContainer: boolean;
  iconPath?: string;     // extracted image path from style
}
