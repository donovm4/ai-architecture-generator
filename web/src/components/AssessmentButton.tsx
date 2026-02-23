import { useState, useRef, useEffect } from 'react';

interface AssessmentButtonProps {
  onAssess: (pillars: string[]) => void;
  isAssessing: boolean;
  hasArchitecture: boolean;
  isAzureMode: boolean;
}

const ALL_PILLARS = [
  { id: 'cost', label: '💰 Cost', emoji: '💰' },
  { id: 'security', label: '🔒 Security', emoji: '🔒' },
  { id: 'reliability', label: '🛡️ Reliability', emoji: '🛡️' },
  { id: 'performance', label: '⚡ Performance', emoji: '⚡' },
];

export function AssessmentButton({ onAssess, isAssessing, hasArchitecture, isAzureMode }: AssessmentButtonProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_PILLARS.map(p => p.id)));
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const togglePillar = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRunAll = () => {
    setOpen(false);
    onAssess(ALL_PILLARS.map(p => p.id));
  };

  const handleRunSelected = () => {
    setOpen(false);
    onAssess([...selected]);
  };

  if (!isAzureMode) return null;

  return (
    <div className="assessment-dropdown" ref={dropdownRef}>
      <button
        className="btn btn-toolbar assessment-trigger"
        onClick={() => setOpen(!open)}
        disabled={!hasArchitecture || isAssessing}
        title={!hasArchitecture ? 'Generate an architecture first' : 'Run WAF Assessment'}
      >
        {isAssessing ? (
          <>
            <span className="spinner" />
            Assessing…
          </>
        ) : (
          '📊 Assess'
        )}
      </button>

      {open && (
        <div className="assessment-dropdown-menu">
          <div className="assessment-dropdown-header">WAF Assessment</div>
          <div className="assessment-dropdown-pillars">
            {ALL_PILLARS.map(p => (
              <label key={p.id} className="assessment-pillar-option">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => togglePillar(p.id)}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
          <div className="assessment-dropdown-actions">
            <button className="btn btn-primary btn-sm" onClick={handleRunAll}>
              Run All
            </button>
            <button
              className="btn btn-toolbar btn-sm"
              onClick={handleRunSelected}
              disabled={selected.size === 0}
            >
              Run Selected ({selected.size})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
