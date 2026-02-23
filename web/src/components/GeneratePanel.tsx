import { useState, useRef, useEffect } from 'react';
import type { AuthStatus, GenerateResponse } from '../types';
import { TemplateGrid } from './TemplateGrid';

interface GeneratePanelProps {
  auth: AuthStatus | null;
  config: {
    endpoint: string;
    deploymentName: string;
    modelInfo: string;
  } | null;
  previousResult: GenerateResponse | null;
  diagramMode: 'azure' | 'generic';
  validationEnabled?: boolean;
  isValidating?: boolean;
  autoFixPrompt?: string | null;
  onAutoFixConsumed?: () => void;
  onGenerated: (result: GenerateResponse, prompt: string, title: string) => void;
  onError: (error: string) => void;
}

const EXAMPLE_PROMPTS = [
  '3 VMs with VNET, storage account, and CosmosDB backend',
  'Hub and spoke network with firewall, bastion, and VPN gateway',
  'HA dual region hub-spoke with ExpressRoute and on-premises connectivity',
  'Web app with App Gateway, AKS cluster, SQL Database, and Key Vault',
  'Microservices with AKS, API Management, Service Bus, and CosmosDB',
];

const GENERIC_EXAMPLE_PROMPTS = [
  'Multi-agent research system with orchestrator, search agent, and analysis agent using GPT-4',
  'Microservices e-commerce platform with API gateway, order service, payment service, and Kafka',
  'Real-time data pipeline with Kafka ingestion, Flink processing, and ClickHouse warehouse',
  'CI/CD pipeline with GitHub, build server, container registry, and Kubernetes deployment',
  'Chat application with WebSocket gateway, message queue, user service, and Redis cache',
];

interface ConversationEntry {
  role: 'user' | 'assistant';
  prompt?: string;
  parsed?: any;
}

export function GeneratePanel({
  auth,
  config,
  previousResult,
  diagramMode,
  validationEnabled,
  isValidating,
  autoFixPrompt,
  onAutoFixConsumed,
  onGenerated,
  onError,
}: GeneratePanelProps) {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'prompt' | 'templates'>('prompt');
  const [templateArch, setTemplateArch] = useState<any>(null);
  const [templateMessage, setTemplateMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const canGenerate = prompt.trim().length > 0 && config;
  const isRefineMode = previousResult !== null && conversation.length > 0;

  // Handle auto-fix prompts from validation panel
  useEffect(() => {
    if (autoFixPrompt) {
      setPrompt(autoFixPrompt);
      onAutoFixConsumed?.();
    }
  }, [autoFixPrompt, onAutoFixConsumed]);

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setGenerationStatus('Connecting...');
    onError('');
    abortRef.current = new AbortController();

    const currentPrompt = prompt;
    const currentTitle = title;

    try {
      const body: any = {
        prompt: currentPrompt,
        title: currentTitle || undefined,
        endpoint: config!.endpoint,
        deploymentName: config!.deploymentName,
        mode: diagramMode,
      };

      // Iterative refinement: include previous architecture
      // Template architecture takes precedence if loaded, otherwise use previous result
      if (templateArch) {
        body.previousArchitecture = templateArch;
      } else if (isRefineMode && previousResult) {
        body.previousArchitecture = previousResult.parsed;
      }

      // Try streaming endpoint first
      let res: Response;
      try {
        res = await fetch('/api/generate/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError') throw fetchErr;
        // If streaming endpoint fails, fall back
        res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });
      }

      if (!res.ok) {
        // If streaming returns 404, fall back to standard endpoint
        if (res.status === 404) {
          setGenerationStatus('Generating architecture...');
          const fallback = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: abortRef.current.signal,
          });
          if (!fallback.ok) {
            const text = await fallback.text();
            throw new Error(text);
          }
          const result: GenerateResponse = await fallback.json();
          finishGeneration(result, currentPrompt, currentTitle);
          return;
        }
        const text = await res.text();
        throw new Error(text);
      }

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') && res.body) {
        // SSE streaming
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let currentEvent = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                switch (currentEvent) {
                  case 'status':
                    setGenerationStatus(data.message || '');
                    break;
                  case 'progress':
                    setGenerationStatus(`Generating... (${data.tokens} tokens)`);
                    break;
                  case 'error':
                    throw new Error(data.error || 'Generation failed');
                  case 'result':
                    finishGeneration(data as GenerateResponse, currentPrompt, currentTitle);
                    break;
                }
              } catch (e: any) {
                if (currentEvent === 'error') throw e;
              }
            }
          }
        }
      } else {
        // Standard JSON response
        const result: GenerateResponse = await res.json();
        finishGeneration(result, currentPrompt, currentTitle);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Generation failed');
      }
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const finishGeneration = (result: GenerateResponse, usedPrompt: string, usedTitle: string) => {
    setConversation(prev => [
      ...prev,
      { role: 'user', prompt: usedPrompt },
      { role: 'assistant', parsed: result.parsed },
    ]);
    setPrompt('');
    setTemplateArch(null);
    setTemplateMessage('');
    onGenerated(result, usedPrompt, usedTitle);
  };

  const handleNewDiagram = () => {
    setConversation([]);
    setPrompt('');
    setTitle('');
    setTemplateArch(null);
    setTemplateMessage('');
    setActiveTab('prompt');
  };

  const handleSelectTemplate = async (templateId: string) => {
    try {
      const res = await fetch(`/api/templates/${templateId}`);
      if (!res.ok) throw new Error('Failed to load template');
      const data = await res.json();
      setTemplateArch(data.architecture);
      setPrompt(data.metadata.description);
      setTitle(data.metadata.name);
      setTemplateMessage(`📐 Template "${data.metadata.name}" loaded. Customize below or generate as-is.`);
      setActiveTab('prompt');
    } catch {
      onError('Failed to load template. Please try again.');
    }
  };

  return (
    <div className="generate-panel">
      <div className="panel-header">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="3" width="16" height="14" rx="2" stroke="#0078d4" strokeWidth="1.5" fill="none" />
          <path d="M5 8H15M5 12H11" stroke="#0078d4" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <h2>{isRefineMode ? 'Refine Architecture' : 'Generate Architecture'}</h2>
        {isRefineMode && (
          <button className="btn btn-sm btn-text" onClick={handleNewDiagram} title="Start a new diagram">
            New
          </button>
        )}
      </div>

      {/* Conversation history */}
      {conversation.length > 0 && (
        <div className="conversation-history">
          {conversation.filter(e => e.role === 'user').map((entry, i) => (
            <div key={i} className="conversation-entry">
              <span className="conversation-icon">→</span>
              <span className="conversation-text">{entry.prompt}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab switcher — only show when not in refine mode and in azure mode */}
      {!isRefineMode && diagramMode === 'azure' && (
        <div className="generate-tabs">
          <button
            className={`generate-tab${activeTab === 'prompt' ? ' active' : ''}`}
            onClick={() => setActiveTab('prompt')}
          >
            ✏️ Prompt
          </button>
          <button
            className={`generate-tab${activeTab === 'templates' ? ' active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            📐 Templates
          </button>
        </div>
      )}

      {/* Template loaded message */}
      {templateMessage && activeTab === 'prompt' && (
        <div className="alert alert-info template-loaded-alert">
          <span>{templateMessage}</span>
          <button
            className="alert-dismiss"
            onClick={() => { setTemplateArch(null); setTemplateMessage(''); }}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Templates tab */}
      {activeTab === 'templates' && !isRefineMode && diagramMode === 'azure' ? (
        <TemplateGrid
          onSelectTemplate={handleSelectTemplate}
          isLoading={isGenerating}
        />
      ) : (
        <>
          {!isRefineMode && (
            <div className="form-group">
              <label>
                Diagram Title <span className="optional">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Azure Architecture"
              />
            </div>
          )}

          <div className="form-group">
            <label>{isRefineMode ? 'Describe your changes' : 'Describe your architecture'}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={isRefineMode
                ? (diagramMode === 'generic'
                  ? 'e.g., Add a Redis cache between the API and database, and add a monitoring dashboard...'
                  : 'e.g., Add a Redis cache and move the database behind a private endpoint...')
                : (diagramMode === 'generic'
                  ? 'e.g., Multi-agent system with orchestrator, 3 sub-agents, LLM backbone, and vector database...'
                  : 'e.g., Hub and spoke network with 3 VMs, firewall, and CosmosDB backend...')
              }
              rows={isRefineMode ? 3 : 4}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleGenerate();
                }
              }}
            />
          </div>

          {!isRefineMode && (
            <div className="example-prompts">
              <span className="example-label">Examples:</span>
              <div className="example-chips">
                {(diagramMode === 'generic' ? GENERIC_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS).map((ex, i) => (
                  <button key={i} className="chip" onClick={() => setPrompt(ex)}>
                    {ex.length > 55 ? ex.slice(0, 55) + '...' : ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn btn-primary btn-generate"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating || isValidating}
          >
            {isValidating ? (
              <>
                <span className="spinner" />
                Validating architecture...
              </>
            ) : isGenerating ? (
              <>
                <span className="spinner" />
                {generationStatus || 'Generating...'}
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2L11 7H16L12 10L13 15L9 12L5 15L6 10L2 7H7L9 2Z" fill="currentColor" />
                </svg>
                {isRefineMode ? 'Refine Diagram' : 'Generate Diagram'}
              </>
            )}
          </button>

          {/* Validation status indicator */}
          {validationEnabled && diagramMode === 'azure' && !isGenerating && !isValidating && (
            <div className="validation-enabled-hint">
              🔍 Azure validation will run after generation
            </div>
          )}
        </>
      )}
    </div>
  );
}
