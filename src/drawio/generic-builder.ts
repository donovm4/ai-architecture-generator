/**
 * Generic Architecture Draw.io XML Builder
 *
 * Renders GenericArchitecture objects (non-Azure, technology-agnostic)
 * into valid .drawio XML files. Supports system blocks (containers),
 * generic nodes with built-in draw.io shapes, and animated connections.
 */

import { create } from 'xmlbuilder2';
import { generateCellId, resetCounter } from '../utils/id-generator.js';
import {
  GENERIC_RESOURCES,
  GENERIC_CONTAINERS,
  GENERIC_CONTAINER_STYLES,
  resolveGenericResourceType,
  type GenericResourceDefinition,
} from '../schema/generic-resources.js';
import type {
  GenericArchitecture,
  GenericNode,
  GenericConnection,
  SystemBlock,
} from '../schema/generic-types.js';

interface CellInfo {
  id: string;
  parentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContainerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class GenericDiagramBuilder {
  private cellMap: Map<string, CellInfo> = new Map();
  private idCounter = 0;
  private containerAbsBounds: Map<string, ContainerBounds> = new Map();

  constructor() {
    resetCounter();
  }

  /**
   * Generate a complete .drawio XML file from a GenericArchitecture definition.
   */
  public generate(arch: GenericArchitecture): string {
    this.cellMap.clear();
    this.idCounter = 0;
    this.containerAbsBounds.clear();

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('mxfile', {
        host: 'app.diagrams.net',
        modified: new Date().toISOString(),
        agent: 'az-arch-gen-generic',
        version: '1.0.0',
        type: 'device',
      });

    const diagram = doc.ele('diagram', {
      id: generateCellId('diagram'),
      name: arch.title || 'Architecture',
    });

    const pageWidth = this.estimatePageWidth(arch);
    const pageHeight = this.estimatePageHeight(arch);

    const bgColor = arch.backgroundColor || '#FFFFFF';

    const mxGraphModel = diagram.ele('mxGraphModel', {
      dx: '1426',
      dy: '798',
      grid: '1',
      gridSize: '10',
      guides: '1',
      tooltips: '1',
      connect: '1',
      arrows: '1',
      fold: '1',
      page: '1',
      pageScale: '1',
      pageWidth: String(pageWidth),
      pageHeight: String(pageHeight),
      math: '0',
      shadow: '0',
      background: bgColor,
    });

    const root = mxGraphModel.ele('root');

    // Required base cells
    root.ele('mxCell', { id: '0' });
    root.ele('mxCell', { id: '1', parent: '0' });

    // Title block
    let titleOffset = 0;
    if (arch.title) {
      const titleId = this.nextId();
      const titleHeight = 30;
      const titleText = `<b style="font-size:16px">${arch.title}</b>`;
      root.ele('mxCell', {
        id: titleId,
        value: titleText,
        style: 'text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;overflow=hidden;fontSize=14;fontColor=#333333;',
        vertex: '1',
        parent: '1',
      }).ele('mxGeometry', {
        x: '50', y: '10', width: '800', height: String(titleHeight),
        as: 'geometry',
      });
      titleOffset = titleHeight + 10;
    }

    const startY = 50 + titleOffset;

    // Build system blocks (containers)
    if (arch.systems && arch.systems.length > 0) {
      // Decide layout direction based on system types:
      // - If systems are "layer" or "swimlane" type, stack vertically (top-to-bottom flow)
      // - Otherwise, arrange horizontally
      const layerTypes = new Set(['layer', 'swimlane']);
      const isVerticalLayout = arch.systems.some(s => layerTypes.has(s.type))
        || arch.type === 'agent-flow' || arch.type === 'data-pipeline';

      if (isVerticalLayout) {
        // Vertical stacking: each system below the previous one
        // All systems share the same X and are as wide as the widest one
        const maxWidth = Math.max(...arch.systems.map(s => this.calculateSystemBounds(s).width));
        let sysY = startY;
        for (const system of arch.systems) {
          const bounds = this.calculateSystemBounds(system);
          // Use maxWidth so all layers align nicely
          this.buildSystemBlock(root, system, '1', { x: 50, y: sysY }, maxWidth);
          sysY += bounds.height + 40;
        }
      } else {
        // Horizontal arrangement (original behavior)
        let sysX = 50;
        for (const system of arch.systems) {
          const bounds = this.calculateSystemBounds(system);
          this.buildSystemBlock(root, system, '1', { x: sysX, y: startY });
          sysX += bounds.width + 60;
        }
      }
    }

    // Build top-level nodes (not in any container)
    if (arch.nodes && arch.nodes.length > 0) {
      const topLevelNodes = arch.nodes.filter(n => !n.containedIn);
      const containedNodes = arch.nodes.filter(n => n.containedIn);

      // Place top-level nodes
      if (topLevelNodes.length > 0) {
        let nodeX = 50;
        let nodeY = startY;
        // If there are systems, place standalone nodes to the right
        if (arch.systems && arch.systems.length > 0) {
          let maxSysRight = 50;
          for (const sys of arch.systems) {
            const bounds = this.calculateSystemBounds(sys);
            maxSysRight = Math.max(maxSysRight, 50 + bounds.width + 60);
          }
          nodeX = maxSysRight + 40;
        }
        const cols = Math.min(topLevelNodes.length, 4);
        let col = 0;
        for (const node of topLevelNodes) {
          this.buildNode(root, node, '1', { x: nodeX + col * 180, y: nodeY });
          col++;
          if (col >= cols) {
            col = 0;
            nodeY += 140;
          }
        }
      }

      // Place contained nodes inside their parent containers
      for (const node of containedNodes) {
        const parentCell = this.findCell(node.containedIn!);
        if (parentCell) {
          // Find next available position inside the container
          const pos = this.getNextNodePosition(parentCell.id);
          this.buildNode(root, node, parentCell.id, pos);
        } else {
          // Fallback: place as top-level
          this.buildNode(root, node, '1', { x: 50, y: startY });
        }
      }
    }

    // Build connections
    if (arch.connections && arch.connections.length > 0) {
      this.buildConnections(root, arch.connections, arch.animations?.enabled);
    }

    return doc.end({ prettyPrint: true });
  }

  private nextId(): string {
    return `cell-${++this.idCounter}`;
  }

  // ==================== SYSTEM BLOCK BUILDING ====================

  private buildSystemBlock(
    parent: any,
    system: SystemBlock,
    containerId: string,
    pos: { x: number; y: number },
    widthOverride?: number,
  ): void {
    const id = system.id || this.nextId();
    const bounds = this.calculateSystemBounds(system);
    const finalWidth = widthOverride || bounds.width;

    // Determine container style
    let containerStyle = GENERIC_CONTAINER_STYLES[system.type] || GENERIC_CONTAINER_STYLES.group;

    // Apply per-instance style overrides
    if (system.style) {
      if (system.style.fillColor) containerStyle += `fillColor=${system.style.fillColor};`;
      if (system.style.strokeColor) containerStyle += `strokeColor=${system.style.strokeColor};`;
      if (system.style.fontColor) containerStyle += `fontColor=${system.style.fontColor};`;
      if (system.style.dashed !== undefined) containerStyle += `dashed=${system.style.dashed ? 1 : 0};`;
      if (system.style.opacity !== undefined) containerStyle += `opacity=${system.style.opacity};`;
    }

    this.addContainer(parent, {
      id,
      parentId: containerId,
      value: system.name,
      style: containerStyle,
      x: pos.x,
      y: pos.y,
      width: finalWidth,
      height: bounds.height,
    });

    this.cellMap.set(system.name, {
      id,
      parentId: containerId,
      x: pos.x,
      y: pos.y,
      width: finalWidth,
      height: bounds.height,
    });

    let innerY = 40; // Start below container header

    // Build child containers
    if (system.children && system.children.length > 0) {
      let childX = 20;
      for (const child of system.children) {
        const childBounds = this.calculateSystemBounds(child);
        this.buildSystemBlock(parent, child, id, { x: childX, y: innerY });
        childX += childBounds.width + 30;
      }
      // Update innerY to be below all children
      const maxChildHeight = Math.max(
        ...system.children.map(c => this.calculateSystemBounds(c).height),
      );
      innerY += maxChildHeight + 20;
    }

    // Build nodes inside this container
    if (system.nodes && system.nodes.length > 0) {
      let nodeX = 30;
      let nodeY = innerY;
      let col = 0;
      const maxCols = Math.max(2, Math.floor((finalWidth - 60) / 180));

      for (const node of system.nodes) {
        this.buildNode(parent, node, id, { x: nodeX + col * 180, y: nodeY });
        col++;
        if (col >= maxCols) {
          col = 0;
          nodeY += 140;
        }
      }
    }
  }

  // ==================== NODE BUILDING ====================

  private buildNode(
    parent: any,
    node: GenericNode,
    parentId: string,
    pos: { x: number; y: number },
  ): void {
    const typeKey = resolveGenericResourceType(node.type) || node.type;
    const def = GENERIC_RESOURCES[typeKey];

    if (!def) {
      // Fallback: render as a custom box
      this.buildCustomNode(parent, node, parentId, pos);
      return;
    }

    const id = node.id || this.nextId();

    // Build a clean label — just the name, no HTML markup
    const label = node.name;

    // Use the generic style with html=1 for proper rendering
    const style = def.style + 'html=1;verticalLabelPosition=bottom;verticalAlign=top;align=center;whiteSpace=wrap;';

    const obj = parent.ele('object', {
      label,
      id,
    });

    if (node.description || node.badge || (node.properties && Object.keys(node.properties).length > 0)) {
      const tooltipParts: string[] = [];
      if (node.badge) tooltipParts.push(`[${node.badge}]`);
      if (node.description) tooltipParts.push(node.description);
      const props = this.getDisplayProperties(node);
      if (props.length > 0) tooltipParts.push(props.join(' | '));
      obj.att('tooltip', tooltipParts.join('\n'));
    }
    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) {
        if (value !== null && value !== undefined) {
          obj.att(key.replace(/\s+/g, '_'), String(value));
        }
      }
    }

    obj.ele('mxCell', {
      style,
      vertex: '1',
      parent: parentId,
    }).ele('mxGeometry', {
      x: String(pos.x),
      y: String(pos.y),
      width: String(def.width),
      height: String(def.height),
      as: 'geometry',
    });

    this.cellMap.set(node.name, {
      id,
      parentId,
      x: pos.x,
      y: pos.y,
      width: def.width,
      height: def.height,
    });

    // Also register by id if different from name
    if (node.id && node.id !== node.name) {
      this.cellMap.set(node.id, {
        id,
        parentId,
        x: pos.x,
        y: pos.y,
        width: def.width,
        height: def.height,
      });
    }
  }

  private buildCustomNode(
    parent: any,
    node: GenericNode,
    parentId: string,
    pos: { x: number; y: number },
  ): void {
    const id = node.id || this.nextId();
    const style = 'rounded=1;fillColor=#FAFAFA;strokeColor=#BDBDBD;fontColor=#424242;fontSize=11;html=1;whiteSpace=wrap;verticalLabelPosition=bottom;verticalAlign=top;align=center;';

    parent.ele('mxCell', {
      id,
      value: node.name,
      style,
      vertex: '1',
      parent: parentId,
    }).ele('mxGeometry', {
      x: String(pos.x),
      y: String(pos.y),
      width: '60',
      height: '48',
      as: 'geometry',
    });

    this.cellMap.set(node.name, {
      id,
      parentId,
      x: pos.x,
      y: pos.y,
      width: 60,
      height: 48,
    });
  }

  // ==================== CONNECTIONS ====================

  private buildConnections(
    parent: any,
    connections: GenericConnection[],
    globalAnimation?: boolean,
  ): void {
    for (const conn of connections) {
      const from = this.findCell(conn.from);
      const to = this.findCell(conn.to);

      if (!from || !to) {
        console.warn(`Cannot create connection: ${conn.from} -> ${conn.to} (node not found)`);
        continue;
      }

      // Base edge style
      let style = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;fontSize=10;labelBackgroundColor=#FFFFFF;fontColor=#333333;';

      // Connection style
      const isAnimated = conn.animated || conn.style === 'animated' || globalAnimation;

      switch (conn.style) {
        case 'dashed':
          style += 'dashed=1;dashPattern=8 4;';
          break;
        case 'dotted':
          style += 'dashed=1;dashPattern=2 4;';
          break;
        case 'thick':
          style += 'strokeWidth=3;';
          break;
        case 'animated':
          // Handled below
          break;
      }

      // Apply animation
      if (isAnimated) {
        style += 'flowAnimation=1;';
        if (!conn.style || conn.style === 'animated') {
          style += 'strokeWidth=2;';
        }
      }

      // Color override
      if (conn.color) {
        style += `strokeColor=${conn.color};`;
      } else if (isAnimated && !conn.color) {
        // Default animated color: magenta (matching CSA accent)
        style += 'strokeColor=#E3008C;';
      }

      // Bidirectional
      if (conn.bidirectional) {
        style += 'startArrow=classic;startFill=1;';
      }
      style += 'endArrow=classic;endFill=1;';

      parent.ele('mxCell', {
        id: this.nextId(),
        value: conn.label || '',
        style,
        edge: '1',
        parent: '1',
        source: from.id,
        target: to.id,
      }).ele('mxGeometry', {
        relative: '1',
        as: 'geometry',
      });
    }
  }

  // ==================== HELPERS ====================

  private getDisplayProperties(node: GenericNode): string[] {
    if (!node.properties) return [];
    const labels: string[] = [];
    for (const [key, value] of Object.entries(node.properties)) {
      if (value !== null && value !== undefined && typeof value !== 'object') {
        labels.push(`${key}: ${value}`);
      }
    }
    return labels.slice(0, 3);
  }

  private addContainer(parent: any, opts: {
    id: string;
    parentId: string;
    value: string;
    style: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    parent.ele('mxCell', {
      id: opts.id,
      value: opts.value,
      style: opts.style,
      vertex: '1',
      parent: opts.parentId,
    }).ele('mxGeometry', {
      x: String(opts.x),
      y: String(opts.y),
      width: String(opts.width),
      height: String(opts.height),
      as: 'geometry',
    });

    // Track absolute bounds
    const parentBounds = this.containerAbsBounds.get(opts.parentId);
    const absX = opts.x + (parentBounds?.x ?? 0);
    const absY = opts.y + (parentBounds?.y ?? 0);
    this.containerAbsBounds.set(opts.id, {
      x: absX, y: absY, width: opts.width, height: opts.height,
    });
  }

  private findCell(name: string): CellInfo | undefined {
    if (this.cellMap.has(name)) return this.cellMap.get(name);

    // Case-insensitive
    const lower = name.toLowerCase();
    for (const [key, val] of this.cellMap) {
      if (key.toLowerCase() === lower) return val;
    }

    // Partial match
    for (const [key, val] of this.cellMap) {
      if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return val;
    }

    return undefined;
  }

  /** Track node positions per container for auto-layout */
  private containerNodePositions: Map<string, { nextX: number; nextY: number; col: number }> = new Map();

  private getNextNodePosition(containerId: string): { x: number; y: number } {
    if (!this.containerNodePositions.has(containerId)) {
      this.containerNodePositions.set(containerId, { nextX: 30, nextY: 40, col: 0 });
    }
    const pos = this.containerNodePositions.get(containerId)!;
    const x = pos.nextX + pos.col * 180;
    const y = pos.nextY;
    pos.col++;
    if (pos.col >= 4) {
      pos.col = 0;
      pos.nextY += 140;
    }
    return { x, y };
  }

  // ==================== SIZE CALCULATIONS ====================

  private calculateSystemBounds(system: SystemBlock): { width: number; height: number } {
    let contentWidth = 0;
    let contentHeight = 40; // Header space

    // Child containers (arranged horizontally)
    if (system.children && system.children.length > 0) {
      let childrenTotalWidth = 0;
      let maxChildHeight = 0;
      for (const child of system.children) {
        const childBounds = this.calculateSystemBounds(child);
        childrenTotalWidth += childBounds.width + 30;
        maxChildHeight = Math.max(maxChildHeight, childBounds.height);
      }
      contentWidth = Math.max(contentWidth, childrenTotalWidth + 20);
      contentHeight += maxChildHeight + 20;
    }

    // Nodes (arranged in grid)
    if (system.nodes && system.nodes.length > 0) {
      const nodeCount = system.nodes.length;
      const maxCols = Math.min(nodeCount, 4);
      const rows = Math.ceil(nodeCount / maxCols);
      const nodesWidth = maxCols * 180 + 60;
      const nodesHeight = rows * 140;
      contentWidth = Math.max(contentWidth, nodesWidth);
      contentHeight += nodesHeight;
    }

    return {
      width: Math.max(300, contentWidth),
      height: Math.max(150, contentHeight),
    };
  }

  private estimatePageWidth(arch: GenericArchitecture): number {
    let total = 100;
    if (arch.systems) {
      const layerTypes = new Set(['layer', 'swimlane']);
      const isVertical = arch.systems.some(s => layerTypes.has(s.type))
        || arch.type === 'agent-flow' || arch.type === 'data-pipeline';

      if (isVertical) {
        // Vertical layout: width is the widest system + margins
        const maxW = Math.max(...arch.systems.map(s => this.calculateSystemBounds(s).width));
        total = maxW + 100;
      } else {
        for (const sys of arch.systems) {
          total += this.calculateSystemBounds(sys).width + 60;
        }
      }
    }
    // Account for standalone nodes
    if (arch.nodes) {
      const topLevel = arch.nodes.filter(n => !n.containedIn);
      if (topLevel.length > 0) {
        total += Math.min(topLevel.length, 4) * 180 + 100;
      }
    }
    return Math.max(1200, total);
  }

  private estimatePageHeight(arch: GenericArchitecture): number {
    let max = 600;
    if (arch.systems) {
      const layerTypes = new Set(['layer', 'swimlane']);
      const isVertical = arch.systems.some(s => layerTypes.has(s.type))
        || arch.type === 'agent-flow' || arch.type === 'data-pipeline';

      if (isVertical) {
        // Vertical layout: height is the sum of all systems + gaps
        let totalH = 200; // margins + title
        for (const sys of arch.systems) {
          totalH += this.calculateSystemBounds(sys).height + 40;
        }
        max = Math.max(max, totalH);
      } else {
        for (const sys of arch.systems) {
          max = Math.max(max, this.calculateSystemBounds(sys).height + 200);
        }
      }
    }
    if (arch.nodes) {
      const topLevel = arch.nodes.filter(n => !n.containedIn);
      const rows = Math.ceil(topLevel.length / 4);
      max = Math.max(max, rows * 140 + 200);
    }
    return max;
  }
}
