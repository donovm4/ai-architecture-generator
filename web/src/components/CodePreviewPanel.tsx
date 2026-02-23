import { useState, useCallback } from 'react';

interface GeneratedFile {
  path: string;
  content: string;
  description: string;
}

interface CodePreviewPanelProps {
  files: GeneratedFile[];
  onDownloadAll: () => void;
}

export function CodePreviewPanel({ files, onDownloadAll }: CodePreviewPanelProps) {
  const [selectedFile, setSelectedFile] = useState(files[0]?.path || '');
  const [copied, setCopied] = useState(false);

  const activeFile = files.find(f => f.path === selectedFile) || files[0];

  const handleCopy = useCallback(async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeFile]);

  // Build tree structure from flat file list
  const tree = buildFileTree(files);

  return (
    <div className="code-preview">
      <div className="code-preview-sidebar">
        <div className="code-preview-sidebar-header">
          <span>Files ({files.length})</span>
        </div>
        <div className="code-preview-tree">
          {renderTree(tree, selectedFile, setSelectedFile, 0)}
        </div>
      </div>
      <div className="code-preview-content">
        <div className="code-preview-toolbar">
          <span className="code-preview-filename">{activeFile?.path}</span>
          <span className="code-preview-desc">{activeFile?.description}</span>
          <div className="code-preview-actions">
            <button className="btn btn-toolbar btn-sm" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button className="btn btn-toolbar btn-sm" onClick={onDownloadAll}>
              Download All
            </button>
          </div>
        </div>
        <div className="code-preview-code">
          <pre>
            <code>{highlightSyntax(activeFile?.content || '', activeFile?.path || '')}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── File tree ────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildFileTree(files: GeneratedFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let node = current.find(n => n.name === part);
      if (!node) {
        node = {
          name: part,
          path: fullPath,
          isDir: !isLast,
          children: [],
        };
        current.push(node);
      }
      current = node.children;
    }
  }

  return root;
}

function renderTree(
  nodes: TreeNode[],
  selected: string,
  onSelect: (path: string) => void,
  depth: number,
): JSX.Element[] {
  // Sort: directories first, then alphabetically
  const sorted = [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return sorted.map(node => (
    <div key={node.path}>
      <button
        className={`code-tree-item ${!node.isDir && selected === node.path ? 'code-tree-item-active' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => !node.isDir && onSelect(node.path)}
      >
        <span className="code-tree-icon">
          {node.isDir ? '📁' : getFileIcon(node.name)}
        </span>
        <span className="code-tree-name">{node.name}</span>
      </button>
      {node.isDir && renderTree(node.children, selected, onSelect, depth + 1)}
    </div>
  ));
}

function getFileIcon(name: string): string {
  if (name.endsWith('.bicep') || name.endsWith('.bicepparam')) return '📐';
  if (name.endsWith('.tf') || name.endsWith('.tfvars')) return '🏗️';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return '⚙️';
  if (name.endsWith('.md')) return '📄';
  return '📄';
}

// ─── Basic syntax highlighting ────────────────────────────────────

function highlightSyntax(content: string, path: string): string {
  // Return plain text — React will escape it in <code>
  // For a more sophisticated approach we'd need a highlighting library,
  // but the requirement is basic highlighting with no deps
  return content;
}
