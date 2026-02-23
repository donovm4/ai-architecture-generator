import { useState, useRef, useCallback } from 'react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (result: any) => void;
  onError: (error: string) => void;
}

type ImportPhase = 'idle' | 'reading' | 'parsing' | 'mapping' | 'done';

export function ImportModal({ isOpen, onClose, onImported, onError }: ImportModalProps) {
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setPhase('idle');
    setIsDragging(false);
    setFileName('');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.drawio') && !file.name.endsWith('.xml')) {
      onError('Please upload a .drawio or .xml file');
      return;
    }

    setFileName(file.name);
    setPhase('reading');

    try {
      const xml = await file.text();
      
      setPhase('parsing');
      
      // Small delay for UX feel
      await new Promise(r => setTimeout(r, 300));
      setPhase('mapping');

      const response = await fetch('/api/import/drawio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Import failed (${response.status})`);
      }

      const result = await response.json();
      setPhase('done');

      // Pass result to parent with a brief delay so user sees "done"
      await new Promise(r => setTimeout(r, 200));
      onImported(result);
      handleClose();
    } catch (err: any) {
      onError(err.message || 'Failed to import diagram');
      resetState();
    }
  }, [onImported, onError, handleClose, resetState]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processFile]);

  if (!isOpen) return null;

  return (
    <div className="import-modal-overlay" onClick={handleClose}>
      <div className="import-modal" onClick={e => e.stopPropagation()}>
        <div className="import-modal-header">
          <h2>Import Draw.io Diagram</h2>
          <button className="import-modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="import-modal-body">
          {phase === 'idle' ? (
            <div
              className={`import-dropzone ${isDragging ? 'import-dropzone-active' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="import-dropzone-icon">
                <rect x="8" y="8" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
                <path d="M24 30V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M18 24l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="import-dropzone-text">
                Drag and drop your <strong>.drawio</strong> file here
              </p>
              <p className="import-dropzone-hint">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".drawio,.xml"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            <div className="import-progress">
              <div className="import-progress-file">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 2v4h4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span>{fileName}</span>
              </div>

              <div className="import-progress-steps">
                <ImportStep
                  label="Reading file..."
                  active={phase === 'reading'}
                  done={phase !== 'reading'}
                />
                <ImportStep
                  label="Parsing diagram..."
                  active={phase === 'parsing'}
                  done={phase === 'mapping' || phase === 'done'}
                />
                <ImportStep
                  label="Mapping resources..."
                  active={phase === 'mapping'}
                  done={phase === 'done'}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className={`import-step ${active ? 'import-step-active' : ''} ${done ? 'import-step-done' : ''}`}>
      {done ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" fill="#107c10" />
          <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : active ? (
        <span className="spinner" />
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        </svg>
      )}
      <span>{label}</span>
    </div>
  );
}
