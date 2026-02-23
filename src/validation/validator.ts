/**
 * Architecture Validator Orchestrator
 *
 * Takes an Architecture object, walks it, runs all validation rules,
 * and returns a ValidationResult.
 */

import type { Architecture } from '../schema/types.js';
import type { ValidationResult } from './types.js';
import { walkArchitecture } from './walker.js';
import { runAllRules } from './rules/index.js';

/**
 * Validate an Architecture against Azure best practices and constraints.
 *
 * @param architecture - The Architecture object to validate
 * @returns ValidationResult with findings and summary
 */
export function validateArchitecture(architecture: Architecture): ValidationResult {
  const start = performance.now();

  // Walk the architecture tree into a flat structure
  const walk = walkArchitecture(architecture);

  // Run all validation rules
  const findings = runAllRules(walk);

  const duration = Math.round(performance.now() - start);

  // Calculate summary
  const summary = {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    info: findings.filter(f => f.severity === 'info').length,
  };

  return {
    findings,
    summary,
    validatedAt: new Date().toISOString(),
    duration,
  };
}
