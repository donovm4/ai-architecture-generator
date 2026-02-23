import { useRef, useEffect, useState, useCallback } from 'react';
import type { GenerateResponse } from '../types';
import { ExportDropdown } from './ExportDropdown';
import type { ExportFormat, PngExportOptions } from './ExportDropdown';
import { IaCExportModal } from './IaCExportModal';
import { jsPDF } from 'jspdf';
import { AssessmentButton } from './AssessmentButton';
import { AssessmentPanel } from './AssessmentPanel';
import type { AssessmentResult } from './AssessmentPanel';
import { CostSlaPanel } from './CostSlaPanel';
import type { CostSlaResult } from './CostSlaPanel';

interface DiagramViewerProps {
  result: GenerateResponse | null;
  assessment?: AssessmentResult | null;
  isAssessing?: boolean;
  onAssess?: () => void;
  onCloseAssessment?: () => void;
  costResult?: CostSlaResult | null;
  isEstimating?: boolean;
  onEstimate?: () => void;
  onCloseCost?: () => void;
  diagramMode?: 'azure' | 'generic';
}

export function DiagramViewer({ result, assessment, isAssessing, onAssess, onCloseAssessment, costResult, isEstimating, onEstimate, onCloseCost, diagramMode }: DiagramViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showXml, setShowXml] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  const [iacModalOpen, setIacModalOpen] = useState(false);
  const [iacModalFormat, setIacModalFormat] = useState<'bicep' | 'terraform'>('bicep');

  // Resizable bottom panel
  const [bottomHeight, setBottomHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeStartY.current = clientY;
    resizeStartHeight.current = bottomHeight;
    setIsResizing(true);
  }, [bottomHeight]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const delta = resizeStartY.current - clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, resizeStartHeight.current + delta));
      setBottomHeight(newHeight);
    };

    const handleEnd = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isResizing]);
  // Track whether the iframe has finished its initial 'init' handshake
  const iframeReady = useRef(false);
  // Store the pending XML so the message handler always has the latest
  const pendingXml = useRef<string | null>(null);
  // Track the originally requested export format (e.g. 'pdf' even though we export 'svg')
  const requestedExportFormat = useRef<string | null>(null);

  // Export handler: supports all export formats via ExportDropdown
  const handleExport = useCallback((format: ExportFormat, options?: PngExportOptions) => {
    // Handle IaC export (opens modal)
    if (format === 'bicep' || format === 'terraform') {
      setIacModalFormat(format);
      setIacModalOpen(true);
      return;
    }

    // Handle drawio download (no iframe needed)
    if (format === 'drawio') {
      if (!result?.xml) return;
      const blob = new Blob([result.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.architecture?.title || 'architecture'}.drawio`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Handle JSON copy to clipboard
    if (format === 'json') {
      if (!result?.parsed) return;
      navigator.clipboard.writeText(JSON.stringify(result.parsed, null, 2));
      return;
    }

    // All other formats use iframe postMessage
    if (!iframeRef.current?.contentWindow || !isLoaded) return;

    // draw.io embed mode supports: html, html2, svg, xmlsvg, png, xmlpng
    // PDF is NOT supported in embed mode — export as high-res PNG instead
    const drawioFormat = format === 'pdf' ? 'png' : (format === 'xmlpng' ? 'xmlpng' : format);

    setExporting(format);
    requestedExportFormat.current = format;
    const msg: Record<string, unknown> = {
      action: 'export',
      format: drawioFormat,
    };

    if (format === 'png' || format === 'xmlpng' || format === 'pdf') {
      msg.scale = format === 'pdf' ? 4 : (options?.scale ?? 2);
      msg.border = 10;
      msg.background = format === 'pdf' ? '#ffffff' : ((options?.background === 'transparent') ? 'none' : '#ffffff');
    }

    if (format === 'svg' || format === 'pdf') {
      msg.border = 10;
    }

    iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');

    // Safety timeout
    setTimeout(() => setExporting(null), 15000);
  }, [isLoaded, result]);

  // One-time listener: handles draw.io init/load/export events for the lifetime of the component
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data);

        if (msg.event === 'configure') {
          console.log('[drawio] configure requested');
          // Respond with minimal config — keep panels functional
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({
                action: 'configure',
                config: {
                  defaultLibraries: '',
                },
              }),
              '*'
            );
          }
        }

        if (msg.event === 'init') {
          console.log('[drawio] iframe ready (init)');
          iframeReady.current = true;
          // If XML was already waiting, send it now
          if (pendingXml.current) {
            sendXml(pendingXml.current);
          }
        }

        if (msg.event === 'load') {
          console.log('[drawio] diagram loaded');
          setIsLoaded(true);
          // Close Shapes and Format panels after diagram loads
          // by programmatically clicking their close buttons
          setTimeout(() => {
            try {
              const iframeDoc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
              if (iframeDoc) {
                // Find and click the "Shapes" button to toggle off the sidebar
                const buttons = iframeDoc.querySelectorAll('a.geButton');
                buttons.forEach((btn: any) => {
                  const title = btn.getAttribute('title') || btn.textContent;
                  if (title === 'Shapes' || title === 'Format') {
                    // Only click if the panel is currently visible
                    btn.click();
                  }
                });
              }
            } catch {
              // Cross-origin — can't access iframe DOM, panels stay open
            }
          }, 500);
        }

        if (msg.event === 'export') {
          setExporting(null);
          const title = result?.architecture?.title || 'architecture';
          const originalFormat = requestedExportFormat.current || msg.format;
          requestedExportFormat.current = null;

          if ((msg.format === 'png' || msg.format === 'xmlpng') && msg.data) {
            // Validate that data is a base64 data URI
            if (typeof msg.data !== 'string' || !msg.data.startsWith('data:image/png;base64,')) {
              console.warn('Unexpected PNG export data format, ignoring');
              return;
            }

            if (originalFormat === 'pdf') {
              // Convert PNG to PDF — fit image onto an A3 page
              const img = new Image();
              img.onload = () => {
                const imgW = img.naturalWidth;
                const imgH = img.naturalHeight;
                const orientation = imgW > imgH ? 'landscape' : 'portrait';
                const pdf = new jsPDF({
                  orientation,
                  unit: 'mm',
                  format: 'a3',
                });
                const pageW = pdf.internal.pageSize.getWidth();
                const pageH = pdf.internal.pageSize.getHeight();
                const margin = 10;
                const availW = pageW - margin * 2;
                const availH = pageH - margin * 2;
                const scale = Math.min(availW / imgW, availH / imgH);
                const w = imgW * scale;
                const h = imgH * scale;
                const x = (pageW - w) / 2;
                const y = (pageH - h) / 2;
                pdf.addImage(msg.data, 'PNG', x, y, w, h);
                pdf.save(`${title}.pdf`);
              };
              img.src = msg.data;
            } else {
              const a = document.createElement('a');
              a.href = msg.data;
              a.download = msg.format === 'xmlpng'
                ? `${title}-editable.png`
                : `${title}.png`;
              a.click();
            }
          } else if (msg.format === 'svg' && msg.data) {
            if (typeof msg.data !== 'string') return;

            // draw.io returns SVG as a data URI: data:image/svg+xml;base64,...
            let svgContent: string;
            if (msg.data.startsWith('data:')) {
              const base64Match = msg.data.match(/^data:[^;]+;base64,(.+)$/);
              if (base64Match) {
                svgContent = atob(base64Match[1]);
              } else {
                const commaIdx = msg.data.indexOf(',');
                svgContent = commaIdx >= 0 ? decodeURIComponent(msg.data.slice(commaIdx + 1)) : msg.data;
              }
            } else {
              svgContent = msg.data;
            }

            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title}.svg`;
            a.click();
            URL.revokeObjectURL(url);
          }
        }

        if (msg.event === 'autosave' || msg.event === 'save') {
          // Ignore autosave events
        }
      } catch {
        // Ignore non-JSON messages (e.g. webpack HMR)
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [result]);

  // Send XML helper — just posts the load action
  const sendXml = (xml: string) => {
    if (iframeRef.current?.contentWindow) {
      console.log(`[drawio] sending XML (${xml.length} chars)`);
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ action: 'load', xml, autosave: 0 }),
        '*'
      );
    }
  };

  // When new XML arrives, send it to the iframe (or queue it for after init)
  useEffect(() => {
    if (!result?.xml) return;

    pendingXml.current = result.xml;
    setIsLoaded(false);
    setLoadingTime(0);

    if (iframeReady.current) {
      // Iframe already initialized — send immediately
      sendXml(result.xml);
    }
    // else: the init handler above will pick it up from pendingXml
  }, [result?.xml]);

  // Loading timer — ticks every second while loading
  useEffect(() => {
    if (isLoaded || !result?.xml) return;
    const interval = setInterval(() => {
      setLoadingTime(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoaded, result?.xml]);

  const handleCopyXml = async () => {
    if (!result?.xml) return;
    await navigator.clipboard.writeText(result.xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!result) {
    return (
      <div className="diagram-viewer empty">
        <div className="empty-state">
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
          >
            <rect
              x="8"
              y="12"
              width="48"
              height="40"
              rx="4"
              stroke="#c8c6c4"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M22 32H42M22 38H36"
              stroke="#c8c6c4"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle
              cx="32"
              cy="24"
              r="4"
              stroke="#c8c6c4"
              strokeWidth="2"
              fill="none"
            />
          </svg>
          <p>Your architecture diagram will appear here</p>
          <p className="subtle">
            Describe your architecture and click Generate
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`diagram-viewer${isResizing ? ' resizing' : ''}`}>
      <div className="viewer-toolbar">
        <div className="resource-summary">
          <span className="badge">
            {result.parsed?.resources?.length
              ?? result.parsed?.pages?.reduce((sum, p) => sum + (p.resources?.length ?? 0), 0)
              ?? 0} resources
          </span>
          {result.parsed?.connections &&
            result.parsed.connections.length > 0 && (
              <span className="badge">
                {result.parsed.connections.length} connections
              </span>
            )}
        </div>
        <div className="viewer-actions">
          <AssessmentButton
            onAssess={onAssess || (() => {})}
            isAssessing={!!isAssessing}
            hasArchitecture={!!result?.architecture}
            isAzureMode={diagramMode !== 'generic'}
          />
          {diagramMode !== 'generic' && (
            <button
              className="btn btn-toolbar cost-trigger"
              onClick={onEstimate}
              disabled={!result?.architecture || isEstimating}
              title={!result?.architecture ? 'Generate an architecture first' : 'Estimate monthly costs and composite SLA'}
            >
              {isEstimating ? (
                <>
                  <span className="spinner" />
                  Estimating…
                </>
              ) : (
                '💰 Cost & SLA'
              )}
            </button>
          )}
          <ExportDropdown
            isLoaded={isLoaded}
            exporting={exporting}
            onExport={(format, options) => {
              if (format === 'viewxml') {
                setShowXml(!showXml);
              } else if (format === 'copyxml') {
                handleCopyXml();
              } else {
                handleExport(format, options);
              }
            }}
            hasJson={!!result?.parsed}
          />
        </div>
      </div>

      {/* Description Panel — collapsed by default */}
      {(result.architecture?.description || result.parsed?.description) && (
        <div className={`description-panel ${descExpanded ? 'description-expanded' : ''}`}>
          <button
            className="description-toggle"
            onClick={() => setDescExpanded(!descExpanded)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M8 1C4.13 1 1 4.13 1 8s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7zm.5 10.5h-1v-4h1v4zm0-5.5h-1V4.5h1V6z" fill="currentColor" opacity="0.6"/>
            </svg>
            <span className="description-summary">
              {descExpanded
                ? 'Architecture Description'
                : (result.architecture?.description || result.parsed?.description || '').slice(0, 80) + ((result.architecture?.description || result.parsed?.description || '').length > 80 ? '…' : '')
              }
            </span>
            <svg
              className={`description-chevron ${descExpanded ? 'description-chevron-open' : ''}`}
              width="12" height="12" viewBox="0 0 16 16" fill="none"
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {descExpanded && (
            <div className="description-body">
              <p className="description-text">{result.architecture?.description || result.parsed?.description}</p>
              {result.parsed?.pages && result.parsed.pages.filter(p => p.description).length > 0 && (
                <div className="description-pages">
                  {result.parsed.pages.filter(p => p.description).map((page, i) => (
                    <div key={i} className="description-page-item">
                      <strong>{page.name}:</strong> {page.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showXml ? (
        <div className="xml-view">
          <pre>
            <code>{result.xml}</code>
          </pre>
        </div>
      ) : (
        <div className="diagram-frame-container">
          {!isLoaded && (
            <div className="diagram-loading">
              <span className="spinner spinner-lg" />
              <p>Loading diagram preview...</p>
              {loadingTime > 0 && (
                <span className="loading-timer">{loadingTime}s</span>
              )}
              {loadingTime > 15 && (
                <div className="loading-hint">
                  <p>Taking longer than expected.</p>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      // Force reload the iframe
                      iframeReady.current = false;
                      setIsLoaded(false);
                      setLoadingTime(0);
                      if (iframeRef.current) {
                        iframeRef.current.src = iframeRef.current.src;
                      }
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
          <iframe
            ref={iframeRef}
            className="diagram-frame"
            src="https://embed.diagrams.net/?embed=1&configure=1&proto=json&spin=1&ui=min&noSaveBtn=1&noExitBtn=1&libraries=0"
            style={{ opacity: isLoaded ? 1 : 0 }}
            title="Architecture diagram"
          />
        </div>
      )}

      {(assessment || costResult) && (
        <>
          <div
            className={`resize-handle ${isResizing ? 'resize-handle-active' : ''}`}
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            title="Drag to resize"
          >
            <div className="resize-handle-grip" />
          </div>
          <div
            className="bottom-panels"
            style={{ height: bottomHeight }}
          >
            {assessment && onCloseAssessment && (
              <AssessmentPanel assessment={assessment} onClose={onCloseAssessment} />
            )}
            {costResult && onCloseCost && (
              <CostSlaPanel result={costResult} onClose={onCloseCost} />
            )}
          </div>
        </>
      )}

      <IaCExportModal
        isOpen={iacModalOpen}
        onClose={() => setIacModalOpen(false)}
        architecture={result?.architecture || result?.parsed}
        initialFormat={iacModalFormat}
      />
    </div>
  );
}
