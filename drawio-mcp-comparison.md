# Draw.io MCP Server vs AI Architecture Generator — Deep Comparison

> Generated: 2026-02-16 | Based on source code analysis of both projects

## TL;DR

**The draw.io MCP is a thin display/transport layer. Mika's tool is a domain-specific generation engine.** They operate at completely different abstraction levels and are complementary, not competitive. The MCP cannot replace even 5% of what the Architecture Generator does. However, the MCP *could* be used as an optional output channel (inline diagram preview in Claude/Copilot chat) alongside the existing web UI.

---

## 1. Architecture Overview

### Draw.io MCP Server (jgraph/drawio-mcp)

The repository contains **three independent approaches**, all doing essentially the same thing:

| Component | What it does |
|-----------|-------------|
| **MCP Tool Server** (`mcp-tool-server/`) | Takes XML/CSV/Mermaid → compresses with pako → generates a `https://app.diagrams.net/#create=...` URL → opens it in the user's browser via `xdg-open`/`open` |
| **MCP App Server** (`mcp-app-server/`) | Takes XML → renders it inline in an MCP Apps-compatible chat interface (Claude.ai) using the draw.io viewer embedded in a sandboxed iframe |
| **Project Instructions** (`project-instructions/`) | Zero-install approach: Claude Project instructions that teach Claude to generate a Python script that compresses diagram code into a draw.io URL, output as an HTML artifact |

**Key insight from source code:** None of these components generate any diagram content. They are purely **transport/display mechanisms**. The LLM (Claude, GPT, etc.) is expected to generate the raw draw.io XML, Mermaid, or CSV. The MCP just compresses it and opens it.

The tool server's `index.js` is ~200 lines. The core logic is:
```javascript
function generateDrawioUrl(data, type, options) {
  const compressedData = compressData(data);  // pako deflateRaw + base64
  const createObj = { type, compressed: true, data: compressedData };
  return DRAWIO_BASE_URL + "?" + params + "#create=" + encodeURIComponent(JSON.stringify(createObj));
}
// Then: exec(`xdg-open "${url}"`);
```

That's it. No XML generation. No layout engine. No resource definitions. No icon mapping.

### AI Architecture Generator (Mika's tool)

A full-stack application with:

| Component | Lines | What it does |
|-----------|-------|-------------|
| `xml-builder.ts` | ~650 | Complete draw.io XML generation engine with nested containers, precise positioning, size calculations, connection routing with obstruction detection, legends, multi-page support |
| `parser.ts` | ~450 | AI prompt engineering + response parsing. 200+ line system prompt defining 128 Azure resource types, containment rules, naming conventions, architecture patterns |
| `resources.ts` | ~1,500 | 128 Azure resource type definitions with official draw.io stencil icon paths, dimensions, containment rules, categories, aliases |
| `types.ts` | ~120 | Full TypeScript type system for architectures (subscriptions, regions, resource groups, VNets, subnets, AZs) |
| `DiagramViewer.tsx` | ~270 | React component embedding draw.io editor via iframe with postMessage API for bi-directional communication, export, auto-panel management |
| Web UI | Full React+Vite app | Config panel, generate panel, history, streaming SSE, iterative refinement |

---

## 2. Feature-by-Feature Comparison

| Feature | Draw.io MCP | AI Architecture Generator | Winner |
|---------|------------|--------------------------|--------|
| **Diagram generation** | None — relies on LLM to produce raw XML/Mermaid/CSV | Full XML generation engine with `DrawIOBuilder` class, calculates positions, sizes, nesting automatically | 🏆 Arch Gen |
| **Input formats** | XML, CSV, Mermaid (pass-through) | Natural language → structured JSON → XML (AI-powered) | 🏆 Arch Gen |
| **Output formats** | Browser URL (opens draw.io), inline iframe (MCP Apps) | .drawio file download, PNG, SVG export via draw.io iframe postMessage API, XML copy | 🏆 Arch Gen |
| **Azure icon support** | None — LLM must know icon paths | 128 Azure service types with correct `img/lib/azure2/...` stencil paths, dimensions, categories | 🏆 Arch Gen |
| **Nested containers** | None — LLM must generate correct parent/child XML | Automatic: Subscription → Region → Resource Group → VNet → Subnet → AZ → Resources, with calculated sizing | 🏆 Arch Gen |
| **Connection routing** | None — LLM must set edge styles | Smart routing with obstruction detection (`findObstructingContainers`), waypoint generation, orthogonal edge styles, named connection styles (expressroute, vpn, peering, dashed) | 🏆 Arch Gen |
| **Layout/positioning** | None — LLM must calculate all x/y coordinates | Automatic layout engine: calculates region/RG/VNet/subnet widths and heights, arranges hub subnets horizontally, spoke subnets vertically, grid placement for resources | 🏆 Arch Gen |
| **CSS animations** | Not relevant (doesn't generate XML) | Not currently implemented, but XML builder could add animation styles | Tie |
| **Dark mode** | Tool server: `dark` parameter on URL. App server: `dark-mode: auto` on viewer | Not directly (draw.io editor has its own dark mode toggle) | 🏆 MCP (minor) |
| **Lightbox mode** | `lightbox=1` parameter for read-only view | Not a separate mode (editor is always editable) | 🏆 MCP (minor) |
| **Interactive editing** | Opens full draw.io editor (tool server) or viewer with "Open in draw.io" button (app server) | Embeds draw.io editor in iframe — fully interactive editing within the app | 🏆 Arch Gen |
| **Inline chat preview** | MCP App Server renders diagram inline in Claude.ai chat | Not applicable (has its own web UI) | 🏆 MCP |
| **Iterative refinement** | Not supported — each call is independent | SSE streaming, modify existing diagrams with natural language follow-ups | 🏆 Arch Gen |
| **Architecture patterns** | LLM must know patterns | Built-in: hub-spoke, multi-region HA, multi-subscription, on-premises hybrid, auto VNet peering | 🏆 Arch Gen |
| **Resource properties** | None | Displays SKU, tier, size, CIDR, bandwidth as labels on resources | 🏆 Arch Gen |
| **Legend generation** | None | Auto-generated legend showing used resource types and connection styles | 🏆 Arch Gen |
| **Multi-page diagrams** | Not supported | Full multi-page support with separate pages per view/region | 🏆 Arch Gen |
| **History/persistence** | None | History panel, session storage | 🏆 Arch Gen |
| **Zero-install** | MCP App Server hosted at `mcp.draw.io/mcp`, project instructions need nothing | Requires cloning repo, `npm install`, running dev server | 🏆 MCP |

---

## 3. Key Questions Answered

### Does the MCP generate draw.io XML directly?

**No.** The MCP is a pass-through. It takes XML/CSV/Mermaid that the LLM has already generated and either:
- Compresses it into a URL and opens it in a browser (tool server)
- Renders it in an inline iframe using the draw.io viewer (app server)

The LLM is responsible for producing the actual diagram content. This means the quality of the output depends entirely on the LLM's knowledge of draw.io XML syntax, which is inconsistent and often produces poorly-laid-out diagrams.

### Can the MCP handle nested Azure architecture diagrams?

**Not on its own.** The MCP doesn't know what Azure is. If you ask Claude "create an Azure hub-spoke architecture" via the MCP, Claude will attempt to generate the raw draw.io XML. The results will be:
- Missing Azure icon stencils (Claude doesn't reliably know all 128 icon paths)
- Poorly positioned (no layout engine)
- Incorrect nesting (parent/child relationships in draw.io XML are tricky)
- Missing legends, connection routing, size calculations

Mika's tool solves this with a dedicated `DrawIOBuilder` that knows exactly how to nest `Subscription → Region → RG → VNet → Subnet → AZ → Resource`, calculates exact dimensions, and uses official Azure stencil paths.

### Does the MCP support CSS animations?

**Not relevant.** The MCP doesn't generate XML, so it doesn't add animations. However, if an LLM generates XML with CSS animation styles embedded, the MCP would pass it through and draw.io would render it. The Architecture Generator also doesn't currently support animations but could — it controls the XML generation and could inject animation styles into edge/cell definitions.

### Can the MCP use custom Azure icon stencils?

**Indirectly.** If the LLM generates XML that references `img/lib/azure2/compute/Virtual_Machine.svg` in the style attribute, draw.io will render the icon. But the MCP has zero knowledge of these paths — the LLM must know them. In contrast, the Architecture Generator has a complete registry (`AZURE_ICONS` object with 120+ paths) that it uses programmatically.

### Would using the MCP simplify or complicate the current workflow?

**It would add no value to the current workflow.** The Architecture Generator already:
1. Generates correct draw.io XML programmatically
2. Embeds the draw.io editor in its web UI
3. Supports PNG/SVG export via the embedded editor's postMessage API
4. Allows .drawio file download

The MCP's main value proposition is "display diagrams in LLM chat interfaces" — but the Architecture Generator has its own purpose-built UI that is far more capable than a chat interface for diagram work.

### Can the MCP do everything the current tool does?

**No. Not even close.** The MCP can do exactly two things:
1. Open draw.io XML/CSV/Mermaid in a browser
2. Render draw.io XML inline in a chat interface

It cannot:
- Generate Azure architecture diagrams from natural language
- Use correct Azure stencil icons
- Calculate layout and positioning
- Route connections intelligently
- Handle nested container hierarchies
- Generate legends
- Support multi-page diagrams
- Provide iterative refinement
- Export to PNG/SVG
- Maintain history

### What can the MCP do that the current tool CANNOT?

| MCP Capability | Arch Gen Equivalent |
|---------------|-------------------|
| Inline diagram rendering in Claude.ai chat | Has its own web UI (different context) |
| Accept Mermaid syntax and display as draw.io | Doesn't support Mermaid input |
| Accept CSV data and display as draw.io | Doesn't support CSV input |
| Dark mode URL parameter | Draw.io editor in iframe has its own dark mode |
| Lightbox (read-only) mode | Not a separate mode |
| Hosted service (`mcp.draw.io/mcp`) — zero install | Requires local setup |

The MCP's unique advantage is **zero-install inline diagram rendering in MCP-compatible chat interfaces** (Claude.ai, potentially others). This is a nice UX feature for quick diagrams but irrelevant for the Architecture Generator's use case.

### What can the current tool do that the MCP CANNOT?

Everything domain-specific:
- Natural language → Azure architecture parsing (128 resource types, 200+ aliases)
- Intelligent XML generation with automatic layout
- Nested container hierarchy (6 levels deep)
- Connection routing with obstruction detection
- Azure icon stencil registry with correct dimensions
- Resource property labels (SKU, tier, CIDR, etc.)
- Multi-region, hub-spoke, HA pattern recognition
- Auto-generation of subnets, bastion, firewall placement
- Legend generation
- Multi-page diagram support
- Iterative refinement
- History and session management
- PNG/SVG export

---

## 4. Could They Be Combined? (Hybrid Analysis)

### Scenario: Use MCP App Server as an alternative output channel

**Feasible but low value.** The Architecture Generator could theoretically:
1. Generate XML with `DrawIOBuilder` (as it does now)
2. Send the XML to the MCP App Server's `create_diagram` tool
3. Get an inline preview in a Claude.ai conversation

But this would mean:
- The Architecture Generator would need to be an MCP client (added complexity)
- The user would be in Claude.ai, not the Architecture Generator's web UI
- They'd lose all the custom UI features (refinement, history, resource list, description panel)
- The draw.io viewer in the MCP app is read-only — no editing without opening draw.io separately

**Verdict: Not worth it.** The Architecture Generator's own web UI with embedded draw.io editor is strictly superior.

### Scenario: Use MCP Tool Server to open diagrams in desktop draw.io

**Trivially replaceable.** The MCP tool server's core function is:
```javascript
exec(`xdg-open "${drawioUrl}"`);
```

The Architecture Generator could add this as a one-line feature: "Open in draw.io desktop" button that constructs the same URL. No need for the MCP server.

### Scenario: Add MCP server interface to the Architecture Generator

**This is the interesting direction** — but it's about making the Architecture Generator *itself* an MCP server, not about using draw.io's MCP. The Architecture Generator could expose:
- `generate_architecture` tool (takes natural language prompt, returns draw.io XML)
- `refine_architecture` tool (takes existing XML + modification prompt)
- `validate_architecture` tool (future — per Idea 1 in future-plans.md)

This would let any MCP client (Claude Desktop, VS Code Copilot, etc.) use the Architecture Generator as a backend. But this has nothing to do with draw.io's MCP.

---

## 5. Source Code Complexity Comparison

| Metric | Draw.io MCP (Tool Server) | AI Architecture Generator |
|--------|--------------------------|--------------------------|
| Core logic lines | ~200 (index.js) | ~3,000+ (builder + parser + resources + types) |
| Dependencies | pako, @modelcontextprotocol/sdk | xmlbuilder2, pako (indirect via draw.io), React, Vite, Express |
| Resource type definitions | 0 | 128 with full metadata |
| Layout calculations | 0 | 20+ methods for size/position calculation |
| Connection intelligence | 0 | Obstruction detection, waypoint generation, ancestor traversal |
| Test coverage | Unknown | Unknown |
| Build complexity | Simple Node.js script | Full-stack TypeScript (backend + React frontend) |

---

## 6. Recommendation

### Clear Verdict: **Keep the current approach. Do not adopt the draw.io MCP.**

**Reasoning:**

1. **Different abstraction levels.** The MCP is a display pipe. The Architecture Generator is a domain engine. Using the MCP would be like using a TV remote to build a TV.

2. **No feature overlap to consolidate.** The MCP does nothing the Architecture Generator needs. The one overlap (opening draw.io in a browser) is a one-line feature addition, not worth an MCP dependency.

3. **The MCP's value proposition doesn't apply.** The MCP shines when you want to display diagrams inline in Claude.ai conversations. The Architecture Generator has its own superior UI purpose-built for architecture work.

4. **Adding the MCP as a dependency would add complexity for zero benefit.** You'd need to manage an MCP client connection, handle its error states, and deal with the sandboxed iframe limitations — all to get a worse viewer than you already have.

### What *would* be interesting (future consideration):

- **Making the Architecture Generator itself an MCP server** — so Claude Desktop, Copilot Chat, etc. can call `generate_azure_architecture("hub-spoke with ExpressRoute")` and get back professional diagrams. This is the right direction but involves making *your tool* the MCP server, not consuming draw.io's MCP.

- **Using the draw.io MCP's Project Instructions as inspiration** — the Python compression snippet is a clean pattern. If you ever want to generate draw.io URLs (e.g., shareable links without downloading a file), the compression approach (`pako deflateRaw → base64 → #create=`) is well-documented in the MCP repo and already used similarly in your XML builder workflow.

### Summary

| Question | Answer |
|----------|--------|
| Should Mika adopt the draw.io MCP? | **No** |
| Should Mika replace any current functionality with it? | **No** |
| Should Mika use it as an additional output channel? | **No** — adds complexity, inferior UX |
| Should Mika be inspired by any part of it? | **Yes** — the `#create=` URL pattern for shareable diagram links; the idea of becoming an MCP server yourself |
| Is the draw.io MCP a competitor? | **No** — completely different layer |

---

*Analysis based on: drawio-mcp commit history as of 2026-02-16, AI Architecture Generator source code at `~/github/AI-architecture-generator/`*
