interface ImportButtonProps {
  onClick: () => void;
}

export function ImportButton({ onClick }: ImportButtonProps) {
  return (
    <button
      className="btn-import"
      onClick={onClick}
      title="Import a .drawio file"
      aria-label="Import diagram"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 10V2" />
        <path d="M4 6l4-4 4 4" />
        <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" />
      </svg>
      Import
    </button>
  );
}
