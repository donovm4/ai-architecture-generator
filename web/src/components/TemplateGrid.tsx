import { useState, useEffect } from 'react';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  resourceCount: number;
  tags: string[];
}

interface TemplateGridProps {
  onSelectTemplate: (templateId: string) => void;
  isLoading?: boolean;
}

const CATEGORY_FILTERS = ['All', 'Networking', 'Compute', 'Data', 'Web', 'Hybrid'] as const;

export function TemplateGrid({ onSelectTemplate, isLoading }: TemplateGridProps) {
  const [templates, setTemplates] = useState<TemplateMetadata[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetch('/api/templates')
      .then(res => res.json())
      .then(data => setTemplates(data))
      .catch(() => setError('Failed to load templates'));
  }, []);

  const filtered = activeCategory === 'All'
    ? templates
    : templates.filter(t => t.category === activeCategory);

  const handleUseTemplate = async (templateId: string) => {
    setLoadingId(templateId);
    try {
      onSelectTemplate(templateId);
    } finally {
      setLoadingId(null);
    }
  };

  if (error) {
    return <div className="template-error">{error}</div>;
  }

  return (
    <div className="template-grid-container">
      {/* Category filter tabs */}
      <div className="template-categories">
        {CATEGORY_FILTERS.map(cat => (
          <button
            key={cat}
            className={`template-category-btn${activeCategory === cat ? ' active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template cards */}
      <div className="template-grid">
        {filtered.map(template => (
          <div key={template.id} className="template-card">
            <div className="template-card-header">
              <span className="template-icon">{template.icon}</span>
              <div className="template-card-meta">
                <h3 className="template-card-title">{template.name}</h3>
                <span className="template-card-category">{template.category}</span>
              </div>
            </div>
            <p className="template-card-desc">{template.description}</p>
            <div className="template-card-footer">
              <span className="template-resource-count">
                {template.resourceCount} resources
              </span>
              <button
                className="btn btn-primary btn-sm template-use-btn"
                onClick={() => handleUseTemplate(template.id)}
                disabled={isLoading || loadingId === template.id}
              >
                {loadingId === template.id ? (
                  <><span className="spinner" /> Loading...</>
                ) : (
                  'Use Template'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && templates.length > 0 && (
        <div className="template-empty">
          No templates in this category.
        </div>
      )}
    </div>
  );
}
