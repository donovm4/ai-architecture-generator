/**
 * Animation Styles for Draw.io Diagrams
 *
 * Draw.io supports CSS-based animations through style properties on edges:
 *   - `animate=1`       → "marching ants" (dashed lines moving along the path)
 *   - `flowAnimation=1` → flowing dot that pulses along the path
 *   - Both can be combined with strokeColor, strokeWidth, shadow, etc.
 *
 * These animations play automatically when the diagram is opened in
 * draw.io (desktop app or web).
 */

// ==================== INTERFACES ====================

/**
 * Top-level animation configuration for an entire architecture.
 * When `enabled` is true, ALL connections default to animated
 * unless a connection explicitly sets `animated: false`.
 */
export interface AnimationConfig {
  enabled: boolean;
  defaultStyle?: AnimationStyleName;
  speed?: AnimationSpeed;
}

/** Named animation presets */
export type AnimationStyleName = 'flow' | 'pulse' | 'marching' | 'glow';

/** Speed doesn't map to a draw.io property directly — it's
 *  expressed via strokeWidth variation (wider = feels "heavier/slower"). */
export type AnimationSpeed = 'slow' | 'normal' | 'fast';

/**
 * Per-connection animation settings.
 * Attached to a single Connection to override the architecture-level defaults.
 */
export interface ConnectionAnimation {
  type: AnimationStyleName | 'none';
  color?: string;           // Override the connection's stroke color
  speed?: AnimationSpeed;
  strokeWidth?: number;     // Override stroke width (default varies by preset)
}

// ==================== PRESET STYLES ====================

/**
 * Pre-defined draw.io style fragments for each animation preset.
 *
 * - **flow**: The most visually impressive — a glowing dot flows along the
 *   edge combined with marching-ant dashes.
 * - **pulse**: Marching-ant dashes with extra stroke width and shadow for a
 *   "pulsing" feel.
 * - **marching**: Classic dashed-line animation with a custom dash pattern.
 * - **glow**: Flow animation plus shadow and thicker strokes for a neon-glow
 *   effect.
 */
export const ANIMATION_STYLES: Record<AnimationStyleName, string> = {
  flow: 'flowAnimation=1;animate=1;',
  pulse: 'animate=1;strokeWidth=3;shadow=1;',
  marching: 'animate=1;dashPattern=8 4;',
  glow: 'flowAnimation=1;shadow=1;strokeWidth=3;',
};

// ==================== FLOW COLORS ====================

/**
 * Semantic color palette for animated connections.
 * Use these to convey meaning through color — e.g. green for success paths,
 * red for error paths, purple for data flow.
 */
export const FLOW_COLORS = {
  primary: '#2196F3',   // Blue   — main data flow
  success: '#4CAF50',   // Green  — success / healthy path
  warning: '#FF9800',   // Orange — warning / slow path
  error: '#F44336',     // Red    — error / failure path
  data: '#9C27B0',      // Purple — data flow
  control: '#00BCD4',   // Cyan   — control flow
  async: '#FF5722',     // Deep orange — async / event-driven
  ai: '#E91E63',        // Pink   — AI / ML flow
} as const;

export type FlowColorName = keyof typeof FLOW_COLORS;

// ==================== SPEED → STROKE WIDTH MAPPING ====================

/**
 * Map animation speed to stroke width.
 * Thinner lines feel "faster"; thicker lines feel "heavier/slower".
 */
const SPEED_STROKE_WIDTH: Record<AnimationSpeed, number> = {
  fast: 1,
  normal: 2,
  slow: 3,
};

// ==================== BUILDER ====================

/**
 * Build a draw.io style string fragment for an animated edge.
 *
 * @param animation  Per-connection animation config
 * @param baseStyle  Optional existing style string to prepend to
 * @returns          A style string ready to be appended to a draw.io mxCell style
 *
 * @example
 * ```ts
 * const extra = buildAnimatedEdgeStyle({ type: 'flow', color: '#2196F3' });
 * // → "flowAnimation=1;animate=1;strokeColor=#2196F3;strokeWidth=2;"
 * ```
 */
export function buildAnimatedEdgeStyle(
  animation: ConnectionAnimation,
  baseStyle?: string,
): string {
  if (animation.type === 'none') {
    return baseStyle ?? '';
  }

  const parts: string[] = [];

  // Start with any caller-supplied base style
  if (baseStyle) {
    parts.push(baseStyle.endsWith(';') ? baseStyle : `${baseStyle};`);
  }

  // Append the preset's style fragment
  const preset = ANIMATION_STYLES[animation.type];
  parts.push(preset);

  // Apply color override
  if (animation.color) {
    parts.push(`strokeColor=${animation.color};`);
  }

  // Apply stroke width — explicit value wins, otherwise derive from speed
  if (animation.strokeWidth !== undefined) {
    parts.push(`strokeWidth=${animation.strokeWidth};`);
  } else if (animation.speed) {
    parts.push(`strokeWidth=${SPEED_STROKE_WIDTH[animation.speed]};`);
  }

  return parts.join('');
}
