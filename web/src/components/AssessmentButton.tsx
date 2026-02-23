import { useState, useRef, useEffect } from 'react';

interface AssessmentButtonProps {
  onAssess: () => void;
  isAssessing: boolean;
  hasArchitecture: boolean;
  isAzureMode: boolean;
}

export function AssessmentButton({ onAssess, isAssessing, hasArchitecture, isAzureMode }: AssessmentButtonProps) {
  if (!isAzureMode) return null;

  return (
    <button
      className="btn btn-toolbar assessment-trigger"
      onClick={onAssess}
      disabled={!hasArchitecture || isAssessing}
      title={!hasArchitecture ? 'Generate an architecture first' : 'Run Well-Architected Framework Assessment'}
    >
      {isAssessing ? (
        <>
          <span className="spinner" />
          Assessing…
        </>
      ) : (
        '📊 WAF Assess'
      )}
    </button>
  );
}
