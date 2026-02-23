import { useState, useRef, useEffect, useCallback } from 'react';

export type ExportFormat = 'drawio' | 'png' | 'svg' | 'pdf' | 'xmlpng' | 'json' | 'bicep' | 'terraform';

export interface PngExportOptions {
  scale: number;
  background: 'white' | 'transparent';
}

interface ExportDropdownProps {
  isLoaded: boolean;
  exporting: string | null;
  onExport: (format: ExportFormat, options?: PngExportOptions) => void;
  hasJson: boolean;
}

export function ExportDropdown({ isLoaded, exporting, onExport, hasJson }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showPngOptions, setShowPngOptions] = useState(false);
  const [pngScale, setPngScale] = useState(2);
  const [pngBackground, setPngBackground] = useState<'white' | 'transparent'>('white');
  const [jsonCopied, setJsonCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open && !showPngOptions) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowPngOptions(false);
      }
    };

    // Use setTimeout so the current click event doesn't immediately close the dropdown
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, showPngOptions]);

  // Close on Escape
  useEffect(() => {
    if (!open && !showPngOptions) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowPngOptions(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, showPngOptions]);

  const handleItemClick = useCallback((format: ExportFormat) => {
    if (format === 'png') {
      setOpen(false);
      setShowPngOptions(true);
      return;
    }
    if (format === 'json') {
      onExport(format);
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
      // Keep dropdown open briefly to show feedback, then close
      setTimeout(() => setOpen(false), 600);
      return;
    }
    setOpen(false);
    setShowPngOptions(false);
    onExport(format);
  }, [onExport]);

  const handlePngDownload = useCallback(() => {
    setShowPngOptions(false);
    onExport('png', { scale: pngScale, background: pngBackground });
  }, [onExport, pngScale, pngBackground]);

  const isExporting = !!exporting;

  return (
    <div className="export-dropdown" ref={dropdownRef}>
      <button
        className="btn btn-primary btn-sm export-dropdown-trigger"
        onClick={() => {
          setOpen(!open);
          setShowPngOptions(false);
        }}
        disabled={!isLoaded || isExporting}
      >
        {isExporting ? (
          <>
            <span className="spinner" />
            Exporting…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className={`export-dropdown-chevron ${open ? 'export-dropdown-chevron-open' : ''}`}>
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </button>

      {open && (
        <div className="export-dropdown-menu">
          <button
            className="export-dropdown-item"
            onClick={() => handleItemClick('drawio')}
          >
            <span className="export-dropdown-icon">📄</span>
            <span className="export-dropdown-label">
              Draw.io File
              <span className="export-dropdown-hint">.drawio</span>
            </span>
          </button>

          <div className="export-dropdown-divider" />

          <button
            className="export-dropdown-item"
            onClick={() => handleItemClick('png')}
            disabled={isExporting}
          >
            <span className="export-dropdown-icon">🖼️</span>
            <span className="export-dropdown-label">
              PNG Image
              <span className="export-dropdown-hint">with options</span>
            </span>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="export-dropdown-arrow">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button
            className="export-dropdown-item"
            onClick={() => handleItemClick('svg')}
            disabled={isExporting}
          >
            <span className="export-dropdown-icon">📐</span>
            <span className="export-dropdown-label">
              SVG Vector
              <span className="export-dropdown-hint">.svg</span>
            </span>
          </button>

          <button
            className="export-dropdown-item"
            onClick={() => handleItemClick('pdf')}
            disabled={isExporting}
          >
            <span className="export-dropdown-icon">📑</span>
            <span className="export-dropdown-label">
              PDF / Print-Quality
              <span className="export-dropdown-hint">high-res .png</span>
            </span>
          </button>

          <div className="export-dropdown-divider" />

          <button
            className="export-dropdown-item"
            onClick={() => handleItemClick('xmlpng')}
            disabled={isExporting}
          >
            <span className="export-dropdown-icon">🔄</span>
            <span className="export-dropdown-label">
              PNG + Embedded Diagram
              <span className="export-dropdown-hint">re-editable .png</span>
            </span>
          </button>

          {hasJson && (
            <>
              <div className="export-dropdown-divider" />
              <button
                className="export-dropdown-item"
                onClick={() => handleItemClick('json')}
              >
                <span className="export-dropdown-icon">{jsonCopied ? '✓' : '📋'}</span>
                <span className="export-dropdown-label">
                  {jsonCopied ? 'Copied!' : 'Copy Architecture JSON'}
                  <span className="export-dropdown-hint">to clipboard</span>
                </span>
              </button>
            </>
          )}

          {hasJson && (
            <>
              <div className="export-dropdown-divider" />
              <button
                className="export-dropdown-item"
                onClick={() => handleItemClick('bicep')}
              >
                <span className="export-dropdown-icon">📐</span>
                <span className="export-dropdown-label">
                  Bicep Templates
                  <span className="export-dropdown-hint">Azure Verified Modules</span>
                </span>
              </button>
              <button
                className="export-dropdown-item"
                onClick={() => handleItemClick('terraform')}
              >
                <span className="export-dropdown-icon">🏗️</span>
                <span className="export-dropdown-label">
                  Terraform Templates
                  <span className="export-dropdown-hint">HCL with AVM modules</span>
                </span>
              </button>
            </>
          )}
        </div>
      )}

      {showPngOptions && (
        <div className="export-png-options">
          <div className="export-png-options-header">
            <span>PNG Export Options</span>
            <button
              className="export-png-options-close"
              onClick={() => setShowPngOptions(false)}
              title="Close"
            >
              ×
            </button>
          </div>

          <div className="export-png-options-body">
            <div className="export-png-field">
              <label>Scale</label>
              <div className="export-png-scale-buttons">
                {[1, 2, 3, 4].map(s => (
                  <button
                    key={s}
                    className={`export-png-scale-btn ${pngScale === s ? 'active' : ''}`}
                    onClick={() => setPngScale(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <div className="export-png-field">
              <label>Background</label>
              <div className="export-png-bg-toggle">
                <button
                  className={`export-png-bg-btn ${pngBackground === 'white' ? 'active' : ''}`}
                  onClick={() => setPngBackground('white')}
                >
                  <span className="export-png-bg-swatch export-png-bg-white" />
                  White
                </button>
                <button
                  className={`export-png-bg-btn ${pngBackground === 'transparent' ? 'active' : ''}`}
                  onClick={() => setPngBackground('transparent')}
                >
                  <span className="export-png-bg-swatch export-png-bg-transparent" />
                  Transparent
                </button>
              </div>
            </div>
          </div>

          <button
            className="btn btn-primary btn-sm export-png-download"
            onClick={handlePngDownload}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <span className="spinner" /> Exporting…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Download PNG ({pngScale}x, {pngBackground === 'white' ? 'white bg' : 'transparent'})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
