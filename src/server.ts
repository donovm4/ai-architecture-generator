/**
 * Express API Server for Azure Architecture Generator
 *
 * Uses Azure CLI credentials — no app registration required.
 * User just runs `az login` before starting the server.
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generate } from './index.js';
import { SYSTEM_PROMPT, parseAIResponse, GENERIC_SYSTEM_PROMPT, GENERIC_REFINEMENT_PROMPT, parseGenericAIResponse } from './ai/parser.js';
import { DrawIOBuilder } from './drawio/xml-builder.js';
import { GenericDiagramBuilder } from './drawio/generic-builder.js';
import { assess } from './assessment/assessor.js';
import type { Pillar } from './assessment/assessor.js';
import { validateArchitecture } from './validation/validator.js';
import { getTemplateList, getTemplateById } from './templates/index.js';
import { importDrawio } from './import/drawio-importer.js';
import { getAllResourceTypes } from './import/shape-mapper.js';
import type { ManualMapping } from './import/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

/**
 * Returns true if the given "hostname:port" combination is explicitly allowed
 * for Azure OpenAI requests. The allow-list is provided via the
 * AZURE_OPENAI_ALLOWED_HOSTS environment variable as a comma-separated list
 * of exact host[:port] values, for example:
 *   AZURE_OPENAI_ALLOWED_HOSTS="myinstance.openai.azure.com:443,other.cognitiveservices.azure.com:443"
 */
function isAllowedAoaiHost(hostWithPort: string): boolean {
  const raw = process.env.AZURE_OPENAI_ALLOWED_HOSTS;
  if (!raw) {
    // If no allowlist is configured, fall back to the hostname suffix check
    // that is already enforced before this function is called.
    return true;
  }
  const entries = raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  return entries.includes(hostWithPort.toLowerCase());
}

/**
 * Returns true if the given endpoint URL belongs to a trusted Azure AI host.
 * This avoids substring checks that can be bypassed with crafted URLs.
 */
function isTrustedAzureAIEndpoint(endpoint: string): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return (
      host === 'openai.azure.com' ||
      host === 'cognitiveservices.azure.com' ||
      host.endsWith('.openai.azure.com') ||
      host.endsWith('.cognitiveservices.azure.com')
    );
  } catch {
    // Malformed URL: treat as untrusted
    return false;
  }
}

// Basic validation for Azure OpenAI deployment names to prevent SSRF via path injection.
// Allows only alphanumeric characters, hyphens, and underscores, with a reasonable length limit.
function isValidDeploymentName(name: unknown): name is string {
  if (typeof name !== 'string') {
    return false;
  }
  // Disallow path separators and query/fragment characters implicitly by allow-listing safe chars.
  const DEPLOYMENT_NAME_REGEX = /^[A-Za-z0-9._-]{1,64}$/;
  return DEPLOYMENT_NAME_REGEX.test(name);
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting — uses express-rate-limit (recognized by CodeQL)
const limiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 30, // max 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// Serve static files from built web app (production)
const webDistPath = resolve(__dirname, '../web/dist');
app.use(express.static(webDistPath));

// ==================== Azure CLI helpers ====================

/** Input validation: only allow safe characters in Azure resource IDs, names, etc. */
const SAFE_AZURE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SAFE_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function validateAzureId(value: string, label: string): string | null {
  if (!value || !SAFE_AZURE_ID.test(value)) {
    return `Invalid ${label}`;
  }
  return null;
}

function validateUUID(value: string, label: string): string | null {
  if (!value || !SAFE_UUID.test(value)) {
    return `Invalid ${label} format`;
  }
  return null;
}

/**
 * Run an Azure CLI command safely using execFileSync.
 * Arguments are passed as an array to prevent shell injection.
 * On Windows, `az` is a .cmd batch file that requires a shell to execute,
 * so we enable shell: true there. Input validation (UUID/ID regex) is the
 * primary security layer — all user-controlled values are validated before
 * reaching this function.
 * @param args - Array of arguments to pass to `az` (excluding `-o json`)
 */
const IS_WINDOWS = process.platform === 'win32';

function azCli(args: string[]): any {
  try {
    const output = execFileSync('az', [...args, '-o', 'json'], {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: IS_WINDOWS,
    });
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function getAccessToken(resource: string): string | null {
  try {
    const result = azCli(['account', 'get-access-token', '--resource', resource]);
    return result?.accessToken || null;
  } catch {
    return null;
  }
}

// ==================== Auth routes ====================

/**
 * GET /api/auth/status
 * Check if user is logged in via Azure CLI
 */
app.get('/api/auth/status', (_req, res) => {
  const account = azCli(['account', 'show']);
  if (account) {
    res.json({
      authenticated: true,
      user: {
        name: account.user?.name || 'Unknown',
        type: account.user?.type || 'user',
        tenantId: account.tenantId,
        subscriptionName: account.name,
        subscriptionId: account.id,
      },
    });
  } else {
    res.json({
      authenticated: false,
      message: 'Run "az login" in your terminal to authenticate.',
    });
  }
});

/**
 * GET /api/tenants
 * List available tenants with friendly display names
 */
app.get('/api/tenants', (_req, res) => {
  // az account tenant list doesn't return friendly names,
  // so we cross-reference with az account list which has tenantDisplayName
  const tenants = azCli(['account', 'tenant', 'list']);
  if (!tenants) {
    return res.status(401).json({ error: 'Not authenticated. Run "az login" first.' });
  }

  // Build a tenant name map from subscriptions (which have tenantDisplayName)
  const subs = azCli(['account', 'list']) || [];
  const nameMap = new Map<string, string>();
  for (const s of subs) {
    if (s.tenantId && s.tenantDisplayName && !nameMap.has(s.tenantId)) {
      nameMap.set(s.tenantId, s.tenantDisplayName);
    }
  }

  res.json(
    tenants.map((t: any) => ({
      tenantId: t.tenantId,
      displayName: nameMap.get(t.tenantId) || t.displayName || t.tenantId,
    }))
  );
});

/**
 * POST /api/tenants/:tenantId/select
 * Switch active tenant
 */
app.post('/api/tenants/:tenantId/select', (req, res) => {
  const { tenantId } = req.params;
  const err = validateUUID(tenantId, 'tenantId');
  if (err) return res.status(400).json({ error: err });

  try {
    execFileSync('az', ['login', '--tenant', tenantId, '--allow-no-subscriptions', '-o', 'none'], {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: IS_WINDOWS,
    });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: `Failed to switch tenant: ${error.message}` });
  }
});

/**
 * GET /api/subscriptions
 * List available subscriptions
 */
app.get('/api/subscriptions', (_req, res) => {
  const subs = azCli(['account', 'subscription', 'list']);
  if (!subs) {
    return res.status(401).json({ error: 'Not authenticated. Run "az login" first.' });
  }
  res.json(
    subs.map((s: any) => ({
      subscriptionId: s.subscriptionId,
      displayName: s.displayName,
      state: s.state,
      tenantId: s.tenantId,
    }))
  );
});

// ==================== Model filtering ====================

/**
 * Check if a model name is a chat-completion capable model suitable for
 * architecture generation (i.e. a reasoning / instruction-following LLM).
 * Excludes: embedding, image-generation, TTS, speech, video, and legacy models.
 */
function isChatModel(modelName: string): boolean {
  if (!modelName) return false;
  const m = modelName.toLowerCase();

  // Only allow gpt-5 family models – they have a consistent API surface
  // and are the most capable for architecture generation.
  return m.startsWith('gpt-5');  // gpt-5, gpt-5-nano, gpt-5-mini, etc.
}

/** Parse deployments from a resource and return only chat-capable ones */
function getChatDeployments(subId: string, name: string, rg: string) {
  const deployments = azCli([
    'cognitiveservices', 'account', 'deployment', 'list',
    '--subscription', subId, '--name', name, '--resource-group', rg,
  ]);
  if (!deployments) return [];
  return deployments
    .filter((d: any) => isChatModel(d.properties?.model?.name || ''))
    .map((d: any) => ({
      name: d.name,
      model: d.properties?.model?.name || 'unknown',
      modelVersion: d.properties?.model?.version || '',
      scaleType: d.sku?.name || d.properties?.scaleSettings?.scaleType || 'Standard',
    }));
}

// ==================== Resource & deployment routes ====================

/**
 * GET /api/subscriptions/:subId/openai-resources
 * List Azure OpenAI and AI Services resources that have at least one
 * chat-capable model deployment (gpt-4o, gpt-4.1, gpt-5, o-series, etc.).
 * Resources with only embedding / image / audio / video models are hidden.
 */
app.get('/api/subscriptions/:subId/openai-resources', (req, res) => {
  const { subId } = req.params;
  const err = validateUUID(subId, 'subscriptionId');
  if (err) return res.status(400).json({ error: err });

  // Fetch ALL Cognitive Services accounts and filter client-side for reliability
  const allResources = azCli([
    'cognitiveservices', 'account', 'list', '--subscription', subId,
  ]);
  if (!allResources) {
    return res.status(500).json({ error: 'Failed to list Cognitive Services resources. Check your subscription access.' });
  }

  // Include OpenAI (standalone), AIServices (Foundry/multi-service), and CognitiveServices with OpenAI endpoints
  const openAIKinds = new Set(['OpenAI', 'AIServices']);
  const candidates = allResources.filter((r: any) => {
    if (openAIKinds.has(r.kind)) return true;
    const ep = r.properties?.endpoint || '';
    return isTrustedAzureAIEndpoint(ep);
  });

  // Only return resources that have at least one chat-capable deployment
  const results = candidates
    .map((r: any) => {
      const rg = r.id?.split('/resourceGroups/')?.[1]?.split('/')[0] || '';
      const chatDeploys = getChatDeployments(subId, r.name, rg);
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        location: r.location,
        endpoint: r.properties?.endpoint || `https://${r.name}.openai.azure.com`,
        resourceGroup: rg,
        chatModelCount: chatDeploys.length,
      };
    })
    .filter((r: any) => r.chatModelCount > 0);

  res.json(results);
});

/**
 * GET /api/subscriptions/:subId/openai-resources/:name/deployments
 * List only chat-capable model deployments for an Azure OpenAI / AI Services resource.
 */
app.get('/api/subscriptions/:subId/openai-resources/:name/deployments', (req, res) => {
  const { subId, name } = req.params;
  const rg = (req.query.rg as string) || '';

  const subErr = validateUUID(subId, 'subscriptionId');
  if (subErr) return res.status(400).json({ error: subErr });
  const nameErr = validateAzureId(name, 'resource name');
  if (nameErr) return res.status(400).json({ error: nameErr });
  if (rg) {
    const rgErr = validateAzureId(rg, 'resource group');
    if (rgErr) return res.status(400).json({ error: rgErr });
  }

  const chatDeploys = getChatDeployments(subId, name, rg);
  if (chatDeploys.length === 0) {
    return res.json([]);
  }
  res.json(chatDeploys);
});

// ==================== Template routes ====================

/**
 * GET /api/templates
 * Returns metadata for all available reference architecture templates.
 */
app.get('/api/templates', (_req, res) => {
  res.json(getTemplateList());
});

/**
 * GET /api/templates/:id
 * Returns the full template (metadata + architecture JSON) for a given template ID.
 */
app.get('/api/templates/:id', (req, res) => {
  const { id } = req.params;
  // Validate template ID format to prevent log injection / error message abuse
  if (!/^[a-z0-9-]{1,64}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid template ID format' });
  }
  const template = getTemplateById(id);
  if (!template) {
    return res.status(404).json({ error: `Template "${id}" not found` });
  }
  res.json(template);
});

// ==================== Generation routes ====================

const REFINEMENT_PROMPT = `You are refining an existing Azure architecture. The previous architecture JSON is provided below. The user wants to make changes to it.

IMPORTANT RULES FOR REFINEMENT:
- Keep ALL existing resources unless the user explicitly asks to remove them
- Add new resources as requested
- Modify properties of existing resources if asked
- Output a COMPLETE merged JSON (not just the diff)
- Use the same JSON format as a fresh generation
- Maintain all existing connections unless changes are needed
- When applying multiple fixes, apply ALL of them in a single pass — do not skip any
- Follow all Azure architectural constraints (subnet naming, sizing, NSG rules, etc.) from the system prompt

Previous architecture:
`;

/**
 * POST /api/generate/stream
 * Generate a Draw.io diagram with SSE streaming progress.
 */
app.post('/api/generate/stream', async (req, res) => {
  try {
    const { prompt, title, endpoint, deploymentName, previousArchitecture, mode } = req.body;
    const diagramMode: 'azure' | 'generic' = mode === 'generic' ? 'generic' : 'azure';

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    if (!endpoint || !deploymentName) {
      return res.status(400).json({ error: 'Azure OpenAI endpoint and deploymentName are required.' });
    }
    // Inline endpoint validation so static analysis can trace the URL to the fetch call
    let aoaiUrl: string;
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:') {
        return res.status(400).json({ error: 'Invalid Azure OpenAI endpoint protocol. Only https is allowed.' });
      }
      const host = url.hostname.toLowerCase();
      if (!host.endsWith('.openai.azure.com') && !host.endsWith('.cognitiveservices.azure.com')) {
        return res.status(400).json({ error: 'Invalid Azure OpenAI endpoint host. Must be *.openai.azure.com or *.cognitiveservices.azure.com.' });
      }
      const port = url.port || '443';
      const hostWithPort = `${host}:${port}`;
      if (!isAllowedAoaiHost(hostWithPort)) {
        return res.status(400).json({
          error: 'Azure OpenAI endpoint host is not in the allowed list.',
        });
      }
      if (!isValidDeploymentName(deploymentName)) {
        return res.status(400).json({ error: 'Invalid deploymentName. Must contain only letters, numbers, hyphens, or underscores, and be at most 64 characters long.' });
      }
      url.hash = '';
      url.pathname = `/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions`;
      url.search = '';
      url.searchParams.set('api-version', '2024-02-01');
      aoaiUrl = url.toString();
    } catch {
      return res.status(400).json({ error: 'Invalid Azure OpenAI endpoint URL.' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    const sendEvent = (type: string, data: any) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('status', { message: 'Acquiring credentials...' });

    const token = getAccessToken('https://cognitiveservices.azure.com');
    if (!token) {
      sendEvent('error', { error: 'Could not acquire Cognitive Services token. Run "az login" first.' });
      res.end();
      return;
    }

    // Build messages array
    const systemPrompt = diagramMode === 'generic' ? GENERIC_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const refinementPrompt = diagramMode === 'generic' ? GENERIC_REFINEMENT_PROMPT : REFINEMENT_PROMPT;
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (previousArchitecture) {
      // Iterative refinement mode
      sendEvent('status', { message: 'Refining architecture...' });
      messages.push({
        role: 'user',
        content: refinementPrompt + JSON.stringify(previousArchitecture, null, 2) + '\n\nUser changes: ' + prompt,
      });
    } else {
      sendEvent('status', { message: 'Analysing your architecture...' });
      messages.push({ role: 'user', content: prompt });
    }

    console.log(`  [AI/Stream] Generating with Azure OpenAI: ${deploymentName}`);

    const aiResponse = await fetch(aoaiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        max_completion_tokens: 50000,
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('  [AI/Stream] Azure OpenAI error:', aiResponse.status, errorText);

      if (aiResponse.status === 401 || aiResponse.status === 403) {
        sendEvent('error', { error: 'Access denied to Azure OpenAI. Run "az login" and ensure you have the "Cognitive Services OpenAI User" role.' });
      } else {
        sendEvent('error', { error: `Azure OpenAI returned ${aiResponse.status}: ${errorText}` });
      }
      res.end();
      return;
    }

    sendEvent('status', { message: 'AI is generating architecture...' });

    // Read SSE stream from Azure OpenAI
    let fullContent = '';
    let tokenCount = 0;

    const reader = aiResponse.body as any;
    if (!reader || typeof reader[Symbol.asyncIterator] !== 'function') {
      // Fallback: read entire body as text  
      const bodyText = await aiResponse.text();
      // Parse SSE lines
      for (const line of bodyText.split('\n')) {
        if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            fullContent += delta;
            tokenCount++;
          } catch { /* skip invalid lines */ }
        }
      }
    } else {
      // Node.js readable stream
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of reader) {
        buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(6));
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                tokenCount++;
                if (tokenCount % 40 === 0) {
                  sendEvent('progress', { tokens: tokenCount });
                }
              }
            } catch { /* skip invalid SSE lines */ }
          }
        }
      }
    }

    if (!fullContent) {
      sendEvent('error', { error: 'No response from Azure OpenAI' });
      res.end();
      return;
    }

    sendEvent('status', { message: 'Parsing architecture...' });

    // Extract JSON
    let jsonStr = fullContent.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('  [AI/Stream] Failed to parse:', fullContent.substring(0, 500));
      sendEvent('error', { error: 'AI returned invalid JSON. Try rephrasing your prompt.' });
      res.end();
      return;
    }

    sendEvent('status', { message: 'Building diagram...' });

    let xml: string;
    let architecture: any;

    if (diagramMode === 'generic') {
      architecture = parseGenericAIResponse(parsed);
      const builder = new GenericDiagramBuilder();
      xml = builder.generate(architecture);
    } else {
      architecture = parseAIResponse(parsed, title);
      const builder = new DrawIOBuilder();
      xml = builder.generate(architecture);
    }

    console.log(`  [AI/Stream] Generated ${diagramMode === 'generic' ? (parsed.systems?.length || 0) + ' systems' : (parsed.resources?.length || 0) + ' resources'}, ${tokenCount} tokens`);

    sendEvent('result', { xml, architecture, parsed });
    sendEvent('done', {});
    res.end();

  } catch (error: any) {
    console.error('  [Error/Stream] Generation failed:', error);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || 'Internal server error' })}\n\n`);
    } catch { /* response already ended */ }
    res.end();
  }
});

/**
 * POST /api/generate
 * Generate a Draw.io diagram (non-streaming).
 *
 * Body:
 *   { prompt: string, title?: string, endpoint: string, deploymentName: string, previousArchitecture?: object }
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, title, endpoint, deploymentName, previousArchitecture, mode } = req.body;
    const diagramMode: 'azure' | 'generic' = mode === 'generic' ? 'generic' : 'azure';

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // AI mode: use Azure OpenAI with CLI-acquired bearer token
    if (endpoint && deploymentName) {
      // Inline endpoint validation so static analysis can trace the URL to the fetch call
      let aoaiUrl: string;
      try {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:') {
          return res.status(400).json({ error: 'Invalid Azure OpenAI endpoint protocol. Only https is allowed.' });
        }
        const host = url.hostname.toLowerCase();
        if (!host.endsWith('.openai.azure.com') && !host.endsWith('.cognitiveservices.azure.com')) {
          return res.status(400).json({ error: 'Invalid Azure OpenAI endpoint host. Must be *.openai.azure.com or *.cognitiveservices.azure.com.' });
        }
        const port = url.port || '443';
        const hostWithPort = `${host}:${port}`;
        if (!isAllowedAoaiHost(hostWithPort)) {
          return res.status(400).json({
            error: 'Azure OpenAI endpoint host is not in the allowed list.',
          });
        }
        if (!isValidDeploymentName(deploymentName)) {
          return res.status(400).json({ error: 'Invalid deploymentName. Must contain only letters, numbers, hyphens, or underscores, and be at most 64 characters long.' });
        }
        url.hash = '';
        url.pathname = `/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions`;
        url.search = '';
        url.searchParams.set('api-version', '2024-02-01');
        aoaiUrl = url.toString();
      } catch {
        return res.status(400).json({ error: 'Invalid Azure OpenAI endpoint URL.' });
      }
      console.log(`  [AI] Generating with Azure OpenAI: ${deploymentName}`);

      const token = getAccessToken('https://cognitiveservices.azure.com');
      if (!token) {
        return res.status(401).json({
          error: 'Could not acquire Cognitive Services token. Run "az login" first.',
        });
      }

      // Build messages array (with optional refinement)
      const systemPrompt = diagramMode === 'generic' ? GENERIC_SYSTEM_PROMPT : SYSTEM_PROMPT;
      const refinementPrompt = diagramMode === 'generic' ? GENERIC_REFINEMENT_PROMPT : REFINEMENT_PROMPT;
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      if (previousArchitecture) {
        console.log('  [AI] Refinement mode - building on previous architecture');
        messages.push({
          role: 'user',
          content: refinementPrompt + JSON.stringify(previousArchitecture, null, 2) + '\n\nUser changes: ' + prompt,
        });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const aiResponse = await fetch(aoaiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        // gpt-5 models: no temperature (only default=1 supported),
        // use max_completion_tokens instead of max_tokens
        body: JSON.stringify({
          messages,
          max_completion_tokens: 50000,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('  [AI] Azure OpenAI error:', aiResponse.status, errorText);

        // Provide actionable guidance for common errors
        if (aiResponse.status === 401 || aiResponse.status === 403) {
          const isRbac = errorText.includes('PermissionDenied') || errorText.includes('lacks the required');
          const hint = isRbac
            ? '\n\nFix: Assign the "Cognitive Services OpenAI User" role to your account on this Azure OpenAI resource.\n' +
              'Run: az role assignment create --assignee "<your-email>" --role "Cognitive Services OpenAI User" ' +
              '--scope "<resource-id>"'
            : '\n\nEnsure you have data-plane access to this resource. Try running "az login" again.';
          return res.status(aiResponse.status === 401 ? 401 : 403).json({
            error: `Access denied to Azure OpenAI.${hint}`,
          });
        }

        return res.status(502).json({
          error: `Azure OpenAI returned ${aiResponse.status}: ${errorText}`,
        });
      }

      const aiData = (await aiResponse.json()) as any;
      console.log('  [AI] Response keys:', JSON.stringify(Object.keys(aiData)));
      console.log('  [AI] Choice:', JSON.stringify(aiData.choices?.[0]?.message)?.substring(0, 300));
      console.log('  [AI] Finish reason:', aiData.choices?.[0]?.finish_reason);

      // GPT-5 may return content in different fields
      const message = aiData.choices?.[0]?.message;
      const content = message?.content
        || message?.refusal
        || (typeof aiData.output === 'string' ? aiData.output : null)
        || aiData.choices?.[0]?.text;

      if (!content) {
        console.error('  [AI] Full response:', JSON.stringify(aiData).substring(0, 1000));
        return res.status(502).json({
          error: 'No response from Azure OpenAI',
          debug: {
            finishReason: aiData.choices?.[0]?.finish_reason,
            keys: Object.keys(aiData),
            messageKeys: message ? Object.keys(message) : [],
          },
        });
      }

      // Extract JSON from the response (handle markdown code blocks)
      let jsonStr = content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        console.error('  [AI] Failed to parse AI response:', content);
        return res.status(502).json({
          error: 'AI returned invalid JSON. Try rephrasing your prompt.',
        });
      }

      let xml: string;
      let architecture: any;

      if (diagramMode === 'generic') {
        architecture = parseGenericAIResponse(parsed);
        const builder = new GenericDiagramBuilder();
        xml = builder.generate(architecture);
      } else {
        architecture = parseAIResponse(parsed, title);
        const builder = new DrawIOBuilder();
        xml = builder.generate(architecture);
      }

      console.log(`  [AI] Generated ${diagramMode === 'generic' ? (parsed.systems?.length || 0) + ' systems' : (parsed.resources?.length || 0) + ' resources'}`);
      return res.json({ xml, architecture, parsed });
    }

    // No endpoint/deployment provided
    return res.status(400).json({
      error: 'Azure OpenAI endpoint and deploymentName are required. Select a model in the UI.',
    });
  } catch (error: any) {
    console.error('  [Error] Generation failed:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ==================== Validation route ====================

/**
 * POST /api/validate
 * Validate an architecture against Azure best practices and constraints.
 *
 * Body:
 *   { architecture: Architecture }
 *
 * Returns: ValidationResult
 */
app.post('/api/validate', (req, res) => {
  try {
    const { architecture } = req.body;
    if (!architecture || typeof architecture !== 'object' || Array.isArray(architecture)) {
      return res.status(400).json({ error: 'architecture must be a non-null object in request body' });
    }

    const result = validateArchitecture(architecture);
    console.log(`  [Validation] ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.info} info (${result.duration}ms)`);
    res.json(result);
  } catch (error: any) {
    console.error('  [Validation] Error:', error);
    res.status(500).json({ error: error.message || 'Validation failed' });
  }
});

// ==================== Import routes ====================

/**
 * POST /api/import/drawio
 * Parse a .drawio XML file and map shapes to Azure resource types.
 * Body: { xml: string }
 * Returns: ImportResult
 */
app.post('/api/import/drawio', (req, res) => {
  try {
    const { xml } = req.body;
    if (!xml || typeof xml !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "xml" field. Provide the .drawio file content as a string.' });
    }
    // Limit import size to 2MB to prevent XML bomb / DoS
    if (xml.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Maximum import size is 2MB.' });
    }

    const result = importDrawio(xml);
    console.log(`  [Import] Parsed ${result.mapping.totalShapes} shapes: ${result.mapping.mapped.length} mapped, ${result.mapping.unrecognized.length} unrecognized`);
    return res.json(result);
  } catch (error: any) {
    console.error('  [Import] Error:', error.message);
    return res.status(400).json({ error: error.message || 'Failed to parse .drawio file' });
  }
});

/**
 * POST /api/import/resolve
 * Re-import with manual mappings for previously unrecognized shapes.
 * Body: { xml: string, mappings: Array<{ cellId: string, resourceType: string }> }
 * Returns: ImportResult
 */
app.post('/api/import/resolve', (req, res) => {
  try {
    const { xml, mappings } = req.body;
    if (!xml || typeof xml !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "xml" field.' });
    }
    // Limit import size to 2MB to prevent XML bomb / DoS
    if (xml.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Maximum import size is 2MB.' });
    }
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: 'Missing or invalid "mappings" array.' });
    }
    if (mappings.length > 500) {
      return res.status(400).json({ error: 'Too many mappings. Maximum is 500.' });
    }

    // Validate mappings
    const manualMappings: ManualMapping[] = mappings
      .filter((m: any) => m.cellId && m.resourceType)
      .map((m: any) => ({ cellId: String(m.cellId), resourceType: String(m.resourceType) }));

    const result = importDrawio(xml, manualMappings);
    console.log(`  [Import/Resolve] Re-parsed with ${manualMappings.length} manual mappings`);
    return res.json(result);
  } catch (error: any) {
    console.error('  [Import/Resolve] Error:', error.message);
    return res.status(400).json({ error: error.message || 'Failed to re-import with mappings' });
  }
});

/**
 * GET /api/import/resource-types
 * Get all known resource types for the manual mapping dropdown.
 * Returns: Array<{ key: string, displayName: string, category: string }>
 */
app.get('/api/import/resource-types', (_req, res) => {
  res.json(getAllResourceTypes());
});

// ==================== Assessment routes ====================

/**
 * POST /api/assess
 * Run WAF-style assessment on an architecture.
 *
 * Body:
 *   { architecture: Architecture, pillars?: ('cost'|'security'|'reliability'|'performance')[] }
 * Returns: AssessmentResult
 */
app.post('/api/assess', (req, res) => {
  try {
    const { architecture, pillars } = req.body;

    if (!architecture || typeof architecture !== 'object' || Array.isArray(architecture)) {
      return res.status(400).json({ error: 'Architecture must be a non-null object.' });
    }

    // Validate pillars if provided
    const validPillars: Pillar[] = ['cost', 'security', 'reliability', 'performance'];
    if (pillars) {
      if (!Array.isArray(pillars)) {
        return res.status(400).json({ error: 'pillars must be an array.' });
      }
      for (const p of pillars) {
        if (!validPillars.includes(p as Pillar)) {
          return res.status(400).json({ error: `Invalid pillar: "${p}". Valid: ${validPillars.join(', ')}` });
        }
      }
    }

    const result = assess(architecture, pillars as Pillar[] | undefined);
    res.json(result);
  } catch (error: any) {
    console.error('  [Error] Assessment failed:', error);
    res.status(500).json({ error: error.message || 'Assessment failed' });
  }
});

// ==================== IaC Export routes ====================

import { generateBicep } from './iac/bicep/bicep-generator.js';
import { generateTerraform } from './iac/terraform/tf-generator.js';
import { generateReadme } from './iac/readme-generator.js';
import type { IaCExportOptions } from './iac/types.js';

/**
 * POST /api/export/bicep
 * Generate Bicep IaC templates from an architecture.
 * Body: { architecture: Architecture, options: IaCExportOptions }
 * Returns: IaCExportResult
 */
app.post('/api/export/bicep', (req, res) => {
  try {
    const { architecture, options } = req.body;
    if (!architecture || typeof architecture !== 'object' || Array.isArray(architecture)) {
      return res.status(400).json({ error: 'architecture must be a non-null object' });
    }

    const exportOptions: IaCExportOptions = {
      format: 'bicep',
      environments: options?.environments || ['production'],
      useAVM: options?.useAVM !== false,
      includeReadme: options?.includeReadme !== false,
      includePipeline: options?.includePipeline || null,
    };

    const result = generateBicep(architecture, exportOptions);

    // Optionally include README
    if (exportOptions.includeReadme) {
      const readme = generateReadme(architecture, exportOptions, result);
      result.files.push(readme);
      result.summary.totalFiles = result.files.length;
    }

    console.log(`  [IaC] Generated Bicep: ${result.summary.totalFiles} files, ${result.summary.resourceCount} resources`);
    res.json(result);
  } catch (error: any) {
    console.error('  [IaC/Bicep] Export failed:', error);
    res.status(500).json({ error: error.message || 'Bicep export failed' });
  }
});

/**
 * POST /api/export/terraform
 * Generate Terraform IaC templates from an architecture.
 * Body: { architecture: Architecture, options: IaCExportOptions }
 * Returns: IaCExportResult
 */
app.post('/api/export/terraform', (req, res) => {
  try {
    const { architecture, options } = req.body;
    if (!architecture || typeof architecture !== 'object' || Array.isArray(architecture)) {
      return res.status(400).json({ error: 'architecture must be a non-null object' });
    }

    const exportOptions: IaCExportOptions = {
      format: 'terraform',
      environments: options?.environments || ['production'],
      useAVM: options?.useAVM !== false,
      includeReadme: options?.includeReadme !== false,
      includePipeline: options?.includePipeline || null,
    };

    const result = generateTerraform(architecture, exportOptions);

    // Optionally include README
    if (exportOptions.includeReadme) {
      const readme = generateReadme(architecture, exportOptions, result);
      result.files.push(readme);
      result.summary.totalFiles = result.files.length;
    }

    console.log(`  [IaC] Generated Terraform: ${result.summary.totalFiles} files, ${result.summary.resourceCount} resources`);
    res.json(result);
  } catch (error: any) {
    console.error('  [IaC/Terraform] Export failed:', error);
    res.status(500).json({ error: error.message || 'Terraform export failed' });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(resolve(webDistPath, 'index.html'));
});

app.listen(PORT, () => {
  // Check Azure CLI auth on startup
  const account = azCli(['account', 'show']);
  const authStatus = account
    ? `Logged in as ${account.user?.name}`
    : 'Not authenticated — run "az login"';

  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │   Azure Architecture Generator              │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log(`  │   API:   http://localhost:${PORT}                 │`);
  console.log('  │   Web:   http://localhost:5173                │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log(`  │   Auth:  ${authStatus.padEnd(34)}│`);
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
  if (!account) {
    console.log('  Run "az login" in another terminal, then refresh the app.');
    console.log('');
  }
});
