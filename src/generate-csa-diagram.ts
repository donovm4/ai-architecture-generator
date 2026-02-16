/**
 * CSA Agent Orchestration Architecture Diagram
 *
 * Generates an animated draw.io diagram showing how the CSA tool works:
 * - User asks a question / gives a task
 * - Orchestrator agent receives and plans
 * - Sub-agents execute specialized tasks
 * - Results flow back through orchestrator to user
 *
 * All connections are animated with flowAnimation for visual impact.
 */

import { GenericDiagramBuilder } from './drawio/generic-builder.js';
import type { GenericArchitecture } from './schema/generic-types.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const csaOrchestration: GenericArchitecture = {
  title: 'CSA Agent Orchestration Architecture',
  description:
    'How the CSA Control Plane orchestrates AI agents to assist Cloud Solution Architects. ' +
    'A CSA submits a request through the UI, the Orchestrator plans and delegates to specialized ' +
    'sub-agents, each agent completes its task and returns results back to the orchestrator, ' +
    'which synthesizes the final output for the CSA.',
  type: 'agent-flow',
  animations: {
    enabled: true,
    flowAnimation: true,
  },
  systems: [
    // === USER LAYER ===
    {
      id: 'user-layer',
      name: '👤 CSA Interaction Layer',
      type: 'layer',
      style: {
        fillColor: '#E3F2FD',
        strokeColor: '#1565C0',
      },
      nodes: [
        {
          id: 'csa',
          type: 'user',
          name: 'Cloud Solution Architect',
          description: 'The CSA interacts with the system through the Control Plane UI',
        },
        {
          id: 'ui',
          type: 'webApp',
          name: 'CSA Control Plane UI',
          description: 'Next.js + Fluent UI dashboard for managing agents and viewing outputs',
          properties: { stack: 'Next.js + Fluent UI' },
        },
      ],
    },

    // === ORCHESTRATION LAYER ===
    {
      id: 'orchestration-layer',
      name: '🧠 AI Orchestration Layer',
      type: 'system',
      style: {
        fillColor: '#FCE4EC',
        strokeColor: '#C2185B',
      },
      nodes: [
        {
          id: 'orchestrator',
          type: 'orchestrator',
          name: 'Orchestrator Agent',
          description: 'Central coordinator that plans, delegates, and synthesizes results',
          badge: 'Core',
        },
        {
          id: 'llm',
          type: 'llm',
          name: 'Azure OpenAI',
          description: 'GPT-4o powers reasoning, planning, and content generation',
          properties: { model: 'GPT-4o' },
        },
        {
          id: 'planner',
          type: 'workflow',
          name: 'Task Planner',
          description: 'Decomposes complex requests into sub-tasks for agent delegation',
        },
      ],
    },

    // === AGENT LAYER ===
    {
      id: 'agent-layer',
      name: '🤖 Specialized Agent Fleet',
      type: 'system',
      style: {
        fillColor: '#E8EAF6',
        strokeColor: '#283593',
      },
      children: [
        {
          id: 'delivery-agents',
          name: 'Delivery Agents',
          type: 'group',
          style: { fillColor: '#E8F5E9', strokeColor: '#2E7D32' },
          nodes: [
            {
              id: 'vbd-agent',
              type: 'subAgent',
              name: 'VBD Prep Agent',
              description: 'Prepares customer-specific VBD content',
            },
            {
              id: 'codelivery-agent',
              type: 'subAgent',
              name: 'Co-Delivery Agent',
              description: 'Real-time co-delivery support during workshops',
            },
          ],
        },
        {
          id: 'research-agents',
          name: 'Research Agents',
          type: 'group',
          style: { fillColor: '#FFF3E0', strokeColor: '#E65100' },
          nodes: [
            {
              id: 'learning-agent',
              type: 'subAgent',
              name: 'Learning Agent',
              description: 'Scrapes Azure updates, generates news flash, tracks certifications',
            },
            {
              id: 'news-agent',
              type: 'subAgent',
              name: 'News Flash Agent',
              description: 'Daily Azure news aggregation from 57+ sources',
              badge: '57 sources',
            },
          ],
        },
        {
          id: 'customer-agents',
          name: 'Customer Agents',
          type: 'group',
          style: { fillColor: '#F3E5F5', strokeColor: '#7B1FA2' },
          nodes: [
            {
              id: 'customer-agent',
              type: 'subAgent',
              name: 'Customer Health Agent',
              description: 'Monitors customer Azure environments and health scores',
            },
            {
              id: 'email-agent',
              type: 'subAgent',
              name: 'Email Digest Agent',
              description: 'Generates and sends executive email summaries',
            },
          ],
        },
        {
          id: 'productivity-agents',
          name: 'Productivity Agents',
          type: 'group',
          style: { fillColor: '#E0F7FA', strokeColor: '#00695C' },
          nodes: [
            {
              id: 'task-agent',
              type: 'subAgent',
              name: 'Task Management Agent',
              description: 'Organizes and tracks tasks across engagements',
            },
            {
              id: 'meeting-agent',
              type: 'subAgent',
              name: 'Meeting Summary Agent',
              description: 'Generates actionable meeting notes and follow-ups',
            },
          ],
        },
      ],
    },

    // === DATA LAYER ===
    {
      id: 'data-layer',
      name: '💾 Data & Integration Layer',
      type: 'zone',
      style: {
        fillColor: '#FFF8E1',
        strokeColor: '#F57F17',
      },
      nodes: [
        {
          id: 'news-db',
          type: 'database',
          name: 'News Store',
          description: 'SQLite database storing scraped Azure articles',
          properties: { engine: 'SQLite' },
        },
        {
          id: 'graph-api',
          type: 'api',
          name: 'Microsoft Graph',
          description: 'Calendar, email, Teams integration',
        },
        {
          id: 'azure-api',
          type: 'cloud',
          name: 'Azure APIs',
          description: 'ARM, Advisor, Defender APIs for customer health data',
        },
        {
          id: 'msx-api',
          type: 'thirdParty',
          name: 'MSX CRM',
          description: 'Customer engagement and account data',
        },
      ],
    },
  ],

  connections: [
    // User → UI
    { from: 'Cloud Solution Architect', to: 'CSA Control Plane UI', label: 'Request', animated: true, color: '#1565C0' },
    // UI → Orchestrator
    { from: 'CSA Control Plane UI', to: 'Orchestrator Agent', label: 'Task', animated: true, color: '#E3008C' },
    // Orchestrator ↔ LLM
    { from: 'Orchestrator Agent', to: 'Azure OpenAI', label: 'Reasoning', animated: true, color: '#9C27B0', bidirectional: true },
    // Orchestrator → Planner
    { from: 'Orchestrator Agent', to: 'Task Planner', label: 'Plan', animated: true, color: '#E3008C' },

    // Orchestrator → Sub-Agents (delegation)
    { from: 'Task Planner', to: 'VBD Prep Agent', label: 'Delegate', animated: true, color: '#4CAF50' },
    { from: 'Task Planner', to: 'Co-Delivery Agent', label: 'Delegate', animated: true, color: '#4CAF50' },
    { from: 'Task Planner', to: 'Learning Agent', label: 'Delegate', animated: true, color: '#FF9800' },
    { from: 'Task Planner', to: 'News Flash Agent', label: 'Delegate', animated: true, color: '#FF9800' },
    { from: 'Task Planner', to: 'Customer Health Agent', label: 'Delegate', animated: true, color: '#7B1FA2' },
    { from: 'Task Planner', to: 'Email Digest Agent', label: 'Delegate', animated: true, color: '#7B1FA2' },
    { from: 'Task Planner', to: 'Task Management Agent', label: 'Delegate', animated: true, color: '#00695C' },
    { from: 'Task Planner', to: 'Meeting Summary Agent', label: 'Delegate', animated: true, color: '#00695C' },

    // Sub-Agents → Data Layer
    { from: 'News Flash Agent', to: 'News Store', label: 'Store articles', animated: true, color: '#F57F17' },
    { from: 'Customer Health Agent', to: 'Azure APIs', label: 'Query', animated: true, color: '#F57F17' },
    { from: 'Email Digest Agent', to: 'Microsoft Graph', label: 'Send', animated: true, color: '#F57F17' },
    { from: 'Meeting Summary Agent', to: 'Microsoft Graph', label: 'Read calendar', animated: true, color: '#F57F17' },
    { from: 'Customer Health Agent', to: 'MSX CRM', label: 'Account data', animated: true, color: '#F57F17' },

    // Results flow back
    { from: 'Orchestrator Agent', to: 'CSA Control Plane UI', label: 'Results', animated: true, color: '#E3008C' },
  ],
};

// Generate the diagram
const builder = new GenericDiagramBuilder();
const xml = builder.generate(csaOrchestration);

// Write to output
const outputPath = join(__dirname, '..', 'output', 'csa-orchestration-animated.drawio');
writeFileSync(outputPath, xml, 'utf-8');

console.log(`✅ Generated: ${outputPath}`);
console.log(`   Title: ${csaOrchestration.title}`);
console.log(`   Systems: ${csaOrchestration.systems?.length || 0}`);
console.log(`   Connections: ${csaOrchestration.connections?.length || 0} (all animated)`);
