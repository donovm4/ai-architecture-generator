import { useState, useCallback, useEffect } from 'react';
import { CodePreviewPanel } from './CodePreviewPanel';

interface IaCExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  architecture: any;
  initialFormat?: 'bicep' | 'terraform';
}

interface ExportOptions {
  format: 'bicep' | 'terraform';
  environments: ('production' | 'development' | 'staging')[];
  useAVM: boolean;
  includeReadme: boolean;
  includePipeline: 'github-actions' | 'azure-devops' | null;
}

interface GeneratedFile {
  path: string;
  content: string;
  description: string;
}

interface ExportResult {
  files: GeneratedFile[];
  summary: {
    totalFiles: number;
    resourceCount: number;
    moduleCount: number;
    format: string;
  };
}

export function IaCExportModal({ isOpen, onClose, architecture, initialFormat }: IaCExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: initialFormat || 'bicep',
    environments: ['production'],
    useAVM: true,
    includeReadme: true,
    includePipeline: null,
  });
  const [description, setDescription] = useState(architecture?.description || '');
  const [result, setResult] = useState<ExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Sync format when modal opens with a different initialFormat
  useEffect(() => {
    if (isOpen && initialFormat) {
      setOptions(prev => ({ ...prev, format: initialFormat }));
    }
    if (isOpen) {
      setDescription(architecture?.description || '');
    }
  }, [isOpen, initialFormat, architecture]);

  const toggleEnv = useCallback((env: 'production' | 'development' | 'staging') => {
    setOptions(prev => {
      const envs = prev.environments.includes(env)
        ? prev.environments.filter(e => e !== env)
        : [...prev.environments, env];
      // Must have at least one env
      if (envs.length === 0) return prev;
      return { ...prev, environments: envs };
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const endpoint = `/api/export/${options.format}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ architecture: { ...architecture, description }, options }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Export failed (${res.status})`);
      }

      const data: ExportResult = await res.json();
      setResult(data);
      setShowPreview(true);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setLoading(false);
    }
  }, [architecture, options]);

  const handleDownloadZip = useCallback(() => {
    if (!result) return;
    downloadAsZip(result.files, `iac-${options.format}`);
  }, [result, options.format]);

  if (!isOpen) return null;

  if (showPreview && result) {
    return (
      <div className="iac-modal-overlay" onClick={onClose}>
        <div className="iac-modal iac-modal-wide" onClick={e => e.stopPropagation()}>
          <div className="iac-modal-header">
            <h3>
              {options.format === 'bicep' ? '📐 Bicep' : '🏗️ Terraform'} Export — {result.summary.resourceCount} resources, {result.summary.moduleCount} modules
            </h3>
            <div className="iac-modal-header-actions">
              <button className="btn btn-toolbar btn-sm" onClick={() => setShowPreview(false)}>
                ← Back
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleDownloadZip}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Download .zip
              </button>
              <button className="iac-modal-close" onClick={onClose}>×</button>
            </div>
          </div>
          <div className="iac-modal-body iac-modal-body-preview">
            <CodePreviewPanel files={result.files} onDownloadAll={handleDownloadZip} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="iac-modal-overlay" onClick={onClose}>
      <div className="iac-modal" onClick={e => e.stopPropagation()}>
        <div className="iac-modal-header">
          <h3>🚀 Export Infrastructure as Code</h3>
          <button className="iac-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="iac-modal-body">
          {/* Description */}
          <div className="iac-field">
            <label>Description</label>
            <textarea
              className="iac-description-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the architecture for the README and comments…"
              rows={3}
            />
          </div>

          {/* Format selector */}
          <div className="iac-field">
            <label>Format</label>
            <div className="iac-format-toggle">
              <button
                className={`iac-format-btn ${options.format === 'bicep' ? 'active' : ''}`}
                onClick={() => setOptions(p => ({ ...p, format: 'bicep' }))}
              >
                <span className="iac-format-icon">📐</span>
                <span>
                  <strong>Bicep</strong>
                  <small>Azure-native IaC</small>
                </span>
              </button>
              <button
                className={`iac-format-btn ${options.format === 'terraform' ? 'active' : ''}`}
                onClick={() => setOptions(p => ({ ...p, format: 'terraform' }))}
              >
                <span className="iac-format-icon">🏗️</span>
                <span>
                  <strong>Terraform</strong>
                  <small>HashiCorp HCL</small>
                </span>
              </button>
            </div>
          </div>

          {/* Environments */}
          <div className="iac-field">
            <label>Environments</label>
            <div className="iac-checkbox-group">
              {(['production', 'development', 'staging'] as const).map(env => (
                <label key={env} className="iac-checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.environments.includes(env)}
                    onChange={() => toggleEnv(env)}
                  />
                  <span>{env.charAt(0).toUpperCase() + env.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* AVM toggle */}
          <div className="iac-field">
            <label className="iac-toggle-label">
              <span>
                <strong>Azure Verified Modules</strong>
                <small>Use Microsoft-maintained AVM module references</small>
              </span>
              <button
                className={`iac-toggle ${options.useAVM ? 'iac-toggle-on' : ''}`}
                onClick={() => setOptions(p => ({ ...p, useAVM: !p.useAVM }))}
                role="switch"
                aria-checked={options.useAVM}
              >
                <span className="iac-toggle-thumb" />
              </button>
            </label>
          </div>

          {/* README */}
          <div className="iac-field">
            <label className="iac-toggle-label">
              <span>
                <strong>Include README</strong>
                <small>Deployment guide with prerequisites and commands</small>
              </span>
              <button
                className={`iac-toggle ${options.includeReadme ? 'iac-toggle-on' : ''}`}
                onClick={() => setOptions(p => ({ ...p, includeReadme: !p.includeReadme }))}
                role="switch"
                aria-checked={options.includeReadme}
              >
                <span className="iac-toggle-thumb" />
              </button>
            </label>
          </div>

          {/* CI/CD Pipeline */}
          <div className="iac-field">
            <label>CI/CD Pipeline</label>
            <div className="iac-radio-group">
              {([
                { value: null, label: 'None' },
                { value: 'github-actions', label: 'GitHub Actions' },
                { value: 'azure-devops', label: 'Azure DevOps' },
              ] as const).map(opt => (
                <label key={String(opt.value)} className="iac-radio-label">
                  <input
                    type="radio"
                    name="pipeline"
                    checked={options.includePipeline === opt.value}
                    onChange={() => setOptions(p => ({ ...p, includePipeline: opt.value }))}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert-error" style={{ marginTop: 12 }}>
              ⚠️ {error}
              <button className="alert-dismiss" onClick={() => setError(null)}>×</button>
            </div>
          )}
        </div>

        <div className="iac-modal-footer">
          <button className="btn btn-toolbar" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={loading || options.environments.length === 0}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Generating…
              </>
            ) : (
              <>
                {options.format === 'bicep' ? '📐' : '🏗️'} Generate {options.format === 'bicep' ? 'Bicep' : 'Terraform'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Minimal ZIP builder (no external deps) ──────────────────────

function downloadAsZip(files: GeneratedFile[], name: string): void {
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(file.content);

    // CRC32
    const crc = crc32(contentBytes);

    // Local file header (30 + name + content)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);  // signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // compression (none)
    lv.setUint16(10, 0, true);           // mod time
    lv.setUint16(12, 0, true);           // mod date
    lv.setUint32(14, crc, true);         // crc32
    lv.setUint32(18, contentBytes.length, true); // compressed size
    lv.setUint32(22, contentBytes.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);    // filename length
    lv.setUint16(28, 0, true);           // extra field length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(contentBytes);

    // Central directory entry (46 + name)
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdEntry.buffer);
    cv.setUint32(0, 0x02014b50, true);   // signature
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // compression
    cv.setUint16(12, 0, true);            // mod time
    cv.setUint16(14, 0, true);            // mod date
    cv.setUint32(16, crc, true);          // crc32
    cv.setUint32(20, contentBytes.length, true); // compressed
    cv.setUint32(24, contentBytes.length, true); // uncompressed
    cv.setUint16(28, nameBytes.length, true);    // filename length
    cv.setUint16(30, 0, true);            // extra field length
    cv.setUint16(32, 0, true);            // comment length
    cv.setUint16(34, 0, true);            // disk start
    cv.setUint16(36, 0, true);            // internal attrs
    cv.setUint32(38, 0, true);            // external attrs
    cv.setUint32(42, offset, true);       // local header offset
    cdEntry.set(nameBytes, 46);
    centralDir.push(cdEntry);

    offset += localHeader.length + contentBytes.length;
  }

  // End of central directory
  const cdSize = centralDir.reduce((sum, e) => sum + e.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);     // signature
  ev.setUint16(4, 0, true);               // disk number
  ev.setUint16(6, 0, true);               // cd start disk
  ev.setUint16(8, files.length, true);     // cd entries on disk
  ev.setUint16(10, files.length, true);    // total cd entries
  ev.setUint32(12, cdSize, true);          // cd size
  ev.setUint32(16, offset, true);          // cd offset
  ev.setUint16(20, 0, true);              // comment length

  // Combine all parts
  const totalSize = offset + cdSize + 22;
  const zipData = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of parts) {
    zipData.set(p, pos);
    pos += p.length;
  }
  for (const c of centralDir) {
    zipData.set(c, pos);
    pos += c.length;
  }
  zipData.set(eocd, pos);

  // Download
  const blob = new Blob([zipData], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Simple CRC32 implementation */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
