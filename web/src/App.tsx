import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ConfigPanel } from './components/ConfigPanel';
import { GeneratePanel } from './components/GeneratePanel';
import { DiagramViewer } from './components/DiagramViewer';
import { HistoryPanel } from './components/HistoryPanel';
import { ValidationToggle } from './components/ValidationToggle';
import { ValidationPanel } from './components/ValidationPanel';
import { ValidationSummaryBar } from './components/ValidationSummaryBar';
import { ImportModal } from './components/ImportModal';
import { ImportAnalysis } from './components/ImportAnalysis';
import { getAuthStatus } from './services/azureDiscovery';
import { saveToHistory } from './services/historyService';
import type { AuthStatus, GenerateResponse, ValidationResult } from './types';
import type { AssessmentResult } from './components/AssessmentPanel';

function WelcomeBanner({ auth }: { auth: AuthStatus | null }) {
  if (auth?.authenticated) return null;

  return (
    <div className="welcome-banner">
      <div className="welcome-content">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="10" fill="#0078d4" />
          <path d="M12 36L24 12L36 36H12Z" fill="white" opacity="0.9" />
          <rect x="21" y="27" width="6" height="6" rx="1.5" fill="#0078d4" />
        </svg>
        <div>
          <h2>Welcome to Azure Architecture Generator</h2>
          <p>
            Generate Draw.io Azure architecture diagrams using natural language.
            Run <code>az login</code> to connect to your Azure account and use
            your own OpenAI models to generate architecture diagrams.
          </p>
          <div className="welcome-actions">
            <code className="auth-command-inline">az login</code>
            <span className="welcome-or">then refresh this page</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [config, setConfig] = useState<{
    endpoint: string;
    deploymentName: string;
    modelInfo: string;
  } | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState('');
  const [diagramMode, setDiagramMode] = useState<'azure' | 'generic'>('azure');
  const [validationEnabled, setValidationEnabled] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validationPanelExpanded, setValidationPanelExpanded] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [isAssessing, setIsAssessing] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  // Check server-side auth status on mount
  const refreshAuth = useCallback(() => {
    getAuthStatus()
      .then(setAuth)
      .catch(() =>
        setAuth({ authenticated: false, message: 'Cannot reach API server.' })
      );
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const handleConfigChange = useCallback(
    (cfg: typeof config) => {
      setConfig(cfg);
    },
    []
  );

  // Run validation against the current architecture
  const runValidation = useCallback(async (architecture: any) => {
    if (!architecture) return;
    setIsValidating(true);
    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ architecture }),
      });
      if (res.ok) {
        const result: ValidationResult = await res.json();
        setValidationResult(result);
        // Auto-expand if there are errors
        if (result.summary.errors > 0) {
          setValidationPanelExpanded(true);
        }
      }
    } catch {
      // Silently fail — validation is optional
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Run WAF assessment
  const runAssessment = useCallback(async (pillars: string[]) => {
    if (!result?.architecture) return;
    setIsAssessing(true);
    try {
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          architecture: result.architecture,
          pillars,
        }),
      });
      if (res.ok) {
        const assessment: AssessmentResult = await res.json();
        setAssessmentResult(assessment);
      } else {
        const err = await res.json();
        setError(err.error || 'Assessment failed');
      }
    } catch {
      setError('Failed to connect to assessment API');
    } finally {
      setIsAssessing(false);
    }
  }, [result]);

  // Handle auto-fix from validation panel
  const handleAutoFix = useCallback((prompt: string) => {
    // We need to trigger the GeneratePanel with this prompt
    // Set it as a pending auto-fix prompt via state
    setAutoFixPrompt(prompt);
  }, []);

  const [autoFixPrompt, setAutoFixPrompt] = useState<string | null>(null);

  // Import state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importAnalysisOpen, setImportAnalysisOpen] = useState(false);
  const [importData, setImportData] = useState<{
    mapping: any;
    xml: string;
    architecture: any;
  } | null>(null);

  const handleHighlightResource = useCallback((_resourceName: string) => {
    // Future: could highlight in diagram viewer
    // For now, just scroll to validation panel showing the resource
  }, []);

  const handleImportResult = useCallback((importResult: any) => {
    // Check if there are unrecognized shapes that need analysis
    if (importResult.mapping?.unrecognized?.length > 0) {
      setImportData({
        mapping: importResult.mapping,
        xml: importResult.xml,
        architecture: importResult.architecture,
      });
      setImportAnalysisOpen(true);
    } else {
      // All shapes mapped — use directly
      acceptImport(importResult);
    }
  }, []);

  const acceptImport = useCallback((importResult: any) => {
    // Build a GenerateResponse-compatible result from the import
    const genResult: GenerateResponse = {
      xml: importResult.xml,
      architecture: importResult.architecture,
      parsed: {
        title: importResult.architecture?.title,
        description: importResult.architecture?.description,
        resources: importResult.mapping?.mapped?.map((m: any) => ({
          type: m.resourceType,
          name: m.label,
        })) || [],
        connections: importResult.architecture?.connections?.map((c: any) => ({
          from: c.from,
          to: c.to,
        })) || [],
      },
    };

    // We need to re-generate XML from the architecture using DrawIOBuilder
    // The import already provides the original XML, but for refinement to work,
    // we need to regenerate from our model. Use the original XML for display.
    setResult(genResult);
    setError('');
    setValidationResult(null);
    setValidationPanelExpanded(false);

    // Save to history
    saveToHistory({
      prompt: '[Imported from .drawio file]',
      title: importResult.architecture?.title || 'Imported Diagram',
      xml: importResult.xml,
      parsed: genResult.parsed,
      modelInfo: 'Import',
    });

    // Run validation if enabled
    if (validationEnabled && diagramMode === 'azure' && importResult.architecture) {
      runValidation(importResult.architecture);
    }

    setImportAnalysisOpen(false);
    setImportData(null);
  }, [validationEnabled, diagramMode, runValidation]);

  return (
    <div className="app">
      <Header auth={auth} theme={theme} onToggleTheme={toggleTheme} onImportClick={() => setImportModalOpen(true)} />

      <main className="main">
        <div className="sidebar">
          <WelcomeBanner auth={auth} />
          <ConfigPanel auth={auth} onConfigChange={handleConfigChange} onAuthRefresh={refreshAuth} />

          {/* Diagram Mode Toggle */}
          <div className="mode-toggle-panel">
            <div className="panel-header">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14.5c-3.58 0-6.5-2.92-6.5-6.5S6.42 3.5 10 3.5s6.5 2.92 6.5 6.5-2.92 6.5-6.5 6.5z" fill="#0078d4"/>
                <path d="M10 5.5v4.25l3.5 2.08-.75 1.23L8.75 10.5V5.5H10z" fill="#0078d4"/>
              </svg>
              <h2>Diagram Mode</h2>
            </div>
            <div className="mode-toggle">
              <button
                className={`mode-btn ${diagramMode === 'azure' ? 'active' : ''}`}
                onClick={() => setDiagramMode('azure')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8.47 1.04L3.66 13.05h2.05l.97-2.57h4.64l.97 2.57h2.05L9.53 1.04H8.47zM7.33 8.98l1.67-4.43 1.67 4.43H7.33z" fill="currentColor"/>
                </svg>
                Azure
              </button>
              <button
                className={`mode-btn ${diagramMode === 'generic' ? 'active' : ''}`}
                onClick={() => setDiagramMode('generic')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none"/>
                  <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none"/>
                  <rect x="5.5" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none"/>
                  <line x1="4.5" y1="7" x2="4.5" y2="9" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1"/>
                  <line x1="11.5" y1="7" x2="11.5" y2="9" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1"/>
                </svg>
                Generic
              </button>
            </div>
            <p className="mode-hint">
              {diagramMode === 'azure'
                ? 'Generate Azure cloud architecture diagrams with Azure-specific resources.'
                : 'Generate technology-agnostic diagrams: agent flows, microservices, data pipelines, and more.'}
            </p>
          </div>

          {/* Azure Validation Toggle */}
          <ValidationToggle
            enabled={validationEnabled}
            onToggle={setValidationEnabled}
            diagramMode={diagramMode}
          />

          <GeneratePanel
            auth={auth}
            config={config}
            previousResult={result}
            diagramMode={diagramMode}
            validationEnabled={validationEnabled}
            isValidating={isValidating}
            autoFixPrompt={autoFixPrompt}
            onAutoFixConsumed={() => setAutoFixPrompt(null)}
            onGenerated={(res, prompt, title) => {
              setResult(res);
              setValidationResult(null);
              setValidationPanelExpanded(false);
              setAssessmentResult(null);
              saveToHistory({
                prompt,
                title: title || res.architecture?.title || 'Untitled',
                xml: res.xml,
                parsed: res.parsed,
                modelInfo: config?.modelInfo || '',
              });
              // Run validation if enabled and in Azure mode
              if (validationEnabled && diagramMode === 'azure' && res.architecture) {
                runValidation(res.architecture);
              }
            }}
            onError={setError}
          />
          <HistoryPanel onLoad={setResult} />
          {error && (
            <div className="alert alert-error sidebar-alert">
              <strong>Error:</strong> {error}
              <button
                className="alert-dismiss"
                onClick={() => setError('')}
              >
                ×
              </button>
            </div>
          )}
        </div>

        <div className={`content ${validationPanelExpanded && validationResult ? 'content-with-validation' : ''}`}>
          <div className="content-diagram">
            <ValidationSummaryBar
              result={validationResult}
              isExpanded={validationPanelExpanded}
              onToggle={() => setValidationPanelExpanded(prev => !prev)}
            />
            <DiagramViewer
              result={result}
              assessment={assessmentResult}
              isAssessing={isAssessing}
              onAssess={runAssessment}
              onCloseAssessment={() => setAssessmentResult(null)}
              diagramMode={diagramMode}
            />
          </div>
          {validationPanelExpanded && validationResult && (
            <div className="content-validation">
              <ValidationPanel
                result={validationResult}
                onAutoFix={handleAutoFix}
                onHighlightResource={handleHighlightResource}
                onClose={() => setValidationPanelExpanded(false)}
              />
            </div>
          )}
        </div>
      </main>

      {/* Import Modals */}
      <ImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={handleImportResult}
        onError={setError}
      />

      {importData && (
        <ImportAnalysis
          isOpen={importAnalysisOpen}
          mapping={importData.mapping}
          xml={importData.xml}
          architecture={importData.architecture}
          onAccept={acceptImport}
          onClose={() => {
            setImportAnalysisOpen(false);
            setImportData(null);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}
