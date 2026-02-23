/**
 * Type definitions for generic (non-Azure) architecture diagrams.
 *
 * These types allow the generator to produce architecture diagrams for
 * ANY technology stack — agent flows, microservices, data pipelines,
 * network topologies, and more — without being tied to Azure resources.
 */

// ==================== THEME ====================

/** Color theme for the entire diagram. */
export interface ArchitectureTheme {
  /** Primary accent color (hex). Used for key containers/edges. */
  primary?: string;
  /** Secondary accent color (hex). */
  secondary?: string;
  /** Background color for the diagram canvas. */
  background?: string;
  /** Default node fill color. */
  nodeFill?: string;
  /** Default node stroke color. */
  nodeStroke?: string;
  /** Default edge/connection color. */
  edgeColor?: string;
  /** Font family override. */
  fontFamily?: string;
  /** Base font size. */
  fontSize?: number;
  /** Predefined palette name (overrides individual colors). */
  preset?: 'light' | 'dark' | 'blueprint' | 'pastel' | 'vibrant';
}

// ==================== STYLE OVERRIDES ====================

/** Allow per-container style tweaks without replacing the whole style string. */
export interface ContainerStyleOverride {
  fillColor?: string;
  strokeColor?: string;
  fontColor?: string;
  rounded?: boolean;
  dashed?: boolean;
  opacity?: number;
}

// ==================== ANIMATIONS (placeholder — another agent implements) ====================

/** Animation configuration attached to the architecture or individual connections. */
export interface AnimationConfig {
  /** Global enable/disable for all animations. */
  enabled?: boolean;
  /** Default speed multiplier (1 = normal). */
  speed?: number;
  /** Animate data flow along connections. */
  flowAnimation?: boolean;
  /** Pulse nodes on hover or periodically. */
  pulseNodes?: boolean;
  /** Sequentially highlight a path of connections. */
  sequencePaths?: AnimationSequencePath[];
}

export interface AnimationSequencePath {
  /** Ordered list of node IDs the animation traverses. */
  path: string[];
  /** Color of the animated particle/highlight. */
  color?: string;
  /** Duration in ms for one full traversal. */
  durationMs?: number;
  /** Loop continuously. */
  loop?: boolean;
}

// ==================== NODES ====================

/**
 * A single node in a generic architecture diagram.
 *
 * `type` should match a key in GENERIC_RESOURCES (e.g. "user", "database",
 * "microservice") or a GENERIC_ALIASES entry.
 */
export interface GenericNode {
  /** Unique identifier. Auto-generated from `name` if omitted. */
  id?: string;
  /** Resource type key (matched against GENERIC_RESOURCES / GENERIC_ALIASES). */
  type: string;
  /** Display name rendered on the diagram. */
  name: string;
  /** Optional description shown as tooltip or subtitle. */
  description?: string;
  /** ID or name of the parent SystemBlock this node belongs to. */
  containedIn?: string;
  /** Arbitrary key-value metadata (rendered as a property table if supported). */
  properties?: Record<string, unknown>;
  /** Small badge text overlaid on the node (e.g. "v2", "beta", "3x"). */
  badge?: string;
}

// ==================== CONNECTIONS ====================

/** A directed (or bidirectional) edge between two nodes. */
export interface GenericConnection {
  /** Source node ID or name. */
  from: string;
  /** Target node ID or name. */
  to: string;
  /** Label rendered on the edge. */
  label?: string;
  /** Visual line style. */
  style?: 'solid' | 'dashed' | 'dotted' | 'thick' | 'animated';
  /** Edge color override (hex). */
  color?: string;
  /** If true, arrows on both ends. */
  bidirectional?: boolean;
  /** Shorthand: adds animated flow particles along this edge. */
  animated?: boolean;
}

// ==================== CONTAINERS / SYSTEM BLOCKS ====================

/**
 * A visual container that groups nodes (and optionally other containers).
 *
 * Maps to container types defined in GENERIC_CONTAINER_STYLES:
 *   system, layer, zone, group, swimlane
 */
export interface SystemBlock {
  /** Unique identifier. Auto-generated from `name` if omitted. */
  id?: string;
  /** Display name for the container header. */
  name: string;
  /** Container type — determines default visual style. */
  type: 'system' | 'layer' | 'zone' | 'group' | 'swimlane';
  /** Nodes directly inside this container. */
  nodes?: GenericNode[];
  /** Nested child containers. */
  children?: SystemBlock[];
  /** Per-instance style overrides. */
  style?: ContainerStyleOverride;
}

// ==================== TOP-LEVEL ARCHITECTURE ====================

/**
 * Root object for a generic architecture diagram.
 *
 * This is the non-Azure counterpart of `Architecture` from types.ts.
 * The `type` field hints at the diagram flavour so the layout engine
 * and AI parser can apply sensible defaults.
 */
export interface GenericArchitecture {
  /** Diagram title (rendered as a header). */
  title?: string;
  /** Human-readable description / subtitle. */
  description?: string;
  /**
   * Diagram flavour.
   *   - generic: catch-all
   *   - agent-flow: AI agent orchestration
   *   - microservices: service mesh / microservice topology
   *   - data-pipeline: ETL / streaming data flow
   *   - network: network topology
   */
  type: 'generic' | 'agent-flow' | 'microservices' | 'data-pipeline' | 'network';
  /** Optional color theme. */
  theme?: ArchitectureTheme;
  /** Top-level system/layer/zone containers. */
  systems?: SystemBlock[];
  /** Flat list of nodes (may reference containers via `containedIn`). */
  nodes?: GenericNode[];
  /** Connections between nodes. */
  connections?: GenericConnection[];
  /** Animation settings (implemented by another agent). */
  animations?: AnimationConfig;
  /** Background color for the diagram canvas (default: #FFFFFF). */
  backgroundColor?: string;
}
