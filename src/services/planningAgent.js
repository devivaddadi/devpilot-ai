import path from 'path';
import { fileURLToPath } from 'url';
import * as llmGateway from './llmGateway.js';
import * as analyzerService from './analyzerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = path.join(__dirname, '../..');

export const mockOverrides = {};

// --- 1. Agent Configuration ---
export const agentConfig = {
  defaultProvider: 'gemini',
  fallbackProviders: ['openai', 'anthropic'],
  maxRetries: 3,
  temperature: 0.4 // Balanced temperature for creative sequencing and task structural parsing
};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Planning Agent] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Planning Agent] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Planning Agent] ERROR: ${msg}`, err.stack || err.message || err)
};

// --- 3. Input Model Validation ---
export function validateInput(payload) {
  const allowedModes = [
    'convert_idea_to_tasks',
    'generate_milestones',
    'estimate_order',
    'produce_roadmap',
    'suggest_priorities'
  ];

  if (!payload.mode || !allowedModes.includes(payload.mode)) {
    throw new Error(`Invalid or missing mode. Allowed modes are: ${allowedModes.join(', ')}`);
  }

  if (!payload.prompt) {
    throw new Error('Prompt is required.');
  }

  return {
    mode: payload.mode,
    prompt: payload.prompt,
    repoName: payload.repoName || null
  };
}

// --- 4. Tool Interfaces ---
export const tools = {
  /**
   * Performs codebase searches for workspace context queries
   */
  async semanticSearchCode(repoName, query) {
    if (!repoName) return [];
    return await analyzerService.semanticSearch(repoName, query, 3);
  }
};

// --- 5. Configurable Prompt Templates ---
export const promptTemplates = {
  convert_idea_to_tasks: (prompt) => `
You are the DevPilot AI Planning Agent. Your task is to analyze the following project idea/specification and break it down into modular, actionable development tasks.

Idea/Spec: "${prompt}"

Format your response strictly as a JSON object:
{
  "plan": "High level overview of the architectural task breakdown.",
  "milestones": ["Phase 1: Foundation Setup", "Phase 2: Core Components"],
  "tasks": [
    { "id": "task-1", "description": "Implement database schemas.", "priority": "High", "dependencies": [] }
  ]
}
`,

  generate_milestones: (prompt) => `
You are the DevPilot AI Planning Agent. Your task is to organize the following project tasks and requirements into high-level sprint milestones and delivery phases.

Goals/Tasks: "${prompt}"

Format your response strictly as a JSON object:
{
  "plan": "Summary of the sprint phases and milestones goals.",
  "milestones": ["Sprint 1: Auth & Database (Weeks 1-2)", "Sprint 2: Routing & REST APIs (Weeks 3-4)"],
  "tasks": [
    { "id": "task-1", "description": "Design authentication middleware.", "priority": "High", "dependencies": [] }
  ]
}
`,

  estimate_order: (prompt) => `
You are the DevPilot AI Planning Agent. Your task is to estimate the optimal implementation order, resolve task dependencies, and produce a sequential plan of action.

Project Description / Tasks: "${prompt}"

Format your response strictly as a JSON object:
{
  "plan": "Implementation sequencing reasoning detailing critical paths.",
  "milestones": ["Sequential Stage 1: Setup", "Sequential Stage 2: Integration"],
  "tasks": [
    { "id": "task-1", "description": "Setup project configuration files.", "priority": "High", "dependencies": [] },
    { "id": "task-2", "description": "Configure api gateway endpoint.", "priority": "Medium", "dependencies": ["task-1"] }
  ]
}
`,

  produce_roadmap: (prompt) => `
You are the DevPilot AI Planning Agent. Your task is to generate a comprehensive development roadmap and timeline for implementing the requested feature or application.

Project/Feature Goal: "${prompt}"

Format your response strictly as a JSON object:
{
  "plan": "Detailed roadmap description outlining tasks, timelines, and risks.",
  "milestones": ["Month 1: Initial MVP release", "Month 2: Scale and Beta optimizations"],
  "tasks": [
    { "id": "task-1", "description": "Set up production deployment pipeline.", "priority": "High", "dependencies": [] }
  ]
}
`,

  suggest_priorities: (prompt) => `
You are the DevPilot AI Planning Agent. Your task is to analyze the following requirements and suggest implementation priorities based on effort vs business value.

Requirements Spec: "${prompt}"

Format your response strictly as a JSON object:
{
  "plan": "Prioritization analysis and ROI/effort trade-offs discussion.",
  "milestones": ["Priority 1: Core Value Proposition", "Priority 2: Quality of Life enhancements"],
  "tasks": [
    { "id": "task-1", "description": "Set up core landing dashboard.", "priority": "High", "dependencies": [] }
  ]
}
`
};

// --- 6. Execution Runner ---
/**
 * Run the Planning Agent. Streams the response back to the client.
 * @param {Object} rawInput 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function runPlanningAgent(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.runPlanningAgent) {
    return mockOverrides.runPlanningAgent(rawInput, onChunk, onComplete, onError);
  }

  try {
    // 1. Validate inputs
    logger.info('Validating input parameters...');
    const input = validateInput(rawInput);

    // 2. Compile codebase context if repoName is active
    let contextSnippet = '';
    if (input.repoName) {
      try {
        logger.info(`Executing semantic search for repo: ${input.repoName}`);
        const hits = await tools.semanticSearchCode(input.repoName, input.prompt);
        if (hits && hits.length > 0) {
          contextSnippet = hits.map(h => `File: ${h.file}\nCode:\n${h.content}`).join('\n\n');
        }
      } catch (err) {
        logger.warn(`Semantic search failed: ${err.message}`);
      }
    }

    // 3. Construct prompt templates
    let systemInstruction = 'You are the DevPilot AI Planning Agent. You ONLY respond with valid JSON containing keys "plan", "milestones", and "tasks". Do not include markdown code block syntax around the JSON itself.';
    if (contextSnippet) {
      systemInstruction += `\n\nCodebase Reference Context:\n${contextSnippet}`;
    }

    const templateFn = promptTemplates[input.mode];
    const userPrompt = templateFn(input.prompt);

    const contents = [
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    // 4. Invoke stream completion via LLM Gateway
    logger.info('Forwarding request to LLM Gateway...');
    await llmGateway.streamCompletion(
      contents,
      systemInstruction,
      {
        provider: agentConfig.defaultProvider,
        maxRetries: agentConfig.maxRetries
      },
      onChunk,
      (provider) => {
        logger.info(`Streaming complete. Provider: ${provider}`);
        onComplete(provider);
      },
      (err) => {
        logger.error('Streaming failed in LLM Gateway', err);
        onError(err);
      }
    );

  } catch (error) {
    logger.error('Planning Agent run aborted', error);
    onError(error);
  }
}
