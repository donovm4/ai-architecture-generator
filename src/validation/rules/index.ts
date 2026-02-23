/**
 * Validation Rule Registry
 *
 * Imports all rule categories and provides a single function
 * to run all validation rules against a walked architecture.
 */

import type { ValidationFinding, WalkResult } from '../types.js';
import { subnetRules } from './subnet-rules.js';
import { networkRules } from './network-rules.js';
import { serviceRules } from './service-rules.js';

export interface RuleCategory {
  name: string;
  description: string;
  run: (walk: WalkResult) => ValidationFinding[];
}

export const ALL_RULES: RuleCategory[] = [
  {
    name: 'Subnet & Naming',
    description: 'Validates subnet naming conventions, sizing requirements, and CIDR validity',
    run: subnetRules,
  },
  {
    name: 'Network Topology',
    description: 'Validates network topology, peering, UDRs, NSG placement, and hub-spoke patterns',
    run: networkRules,
  },
  {
    name: 'Service Configuration',
    description: 'Validates Azure service configurations, placement, and best practices',
    run: serviceRules,
  },
];

/**
 * Run all validation rule categories against the walked architecture.
 * Returns all findings from all rule categories.
 */
export function runAllRules(walk: WalkResult): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const category of ALL_RULES) {
    try {
      const categoryFindings = category.run(walk);
      findings.push(...categoryFindings);
    } catch (error) {
      console.error(`[Validation] Error in rule category "${category.name}":`, error);
      // Continue with other categories even if one fails
    }
  }

  return findings;
}
