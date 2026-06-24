import fs from 'fs/promises';
import { existsSync } from 'fs';
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
  temperature: 0.2 // Lower temperature is preferred for code accuracy and structure consistency
};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Coding Agent] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Coding Agent] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Coding Agent] ERROR: ${msg}`, err.stack || err.message || err)
};

// --- 3. Input / Output Model Validation ---
export function validateInput(payload) {
  const allowedModes = ['generate', 'modify', 'refactor', 'explain', 'suggest_practices', 'generate_tests'];
  
  if (!payload.mode || !allowedModes.includes(payload.mode)) {
    throw new Error(`Invalid or missing mode. Allowed modes are: ${allowedModes.join(', ')}`);
  }
  
  if (!payload.prompt) {
    throw new Error('Prompt is required.');
  }

  // Sanitize path if provided
  let sanitizedPath = null;
  if (payload.filePath) {
    sanitizedPath = path.resolve(WORKSPACE_DIR, payload.filePath);
    if (!sanitizedPath.startsWith(WORKSPACE_DIR)) {
      throw new Error('Security Error: File path must reside within the workspace directory.');
    }
  }

  return {
    mode: payload.mode,
    prompt: payload.prompt,
    filePath: sanitizedPath,
    existingContent: payload.existingContent || '',
    language: payload.language || 'javascript',
    repoName: payload.repoName || null
  };
}

// --- 4. Tool Interfaces ---
export const tools = {
  /**
   * Safely reads a code file from the workspace
   */
  async readCodeFile(relPath) {
    const absPath = path.resolve(WORKSPACE_DIR, relPath);
    if (!absPath.startsWith(WORKSPACE_DIR)) {
      throw new Error('Access denied: File outside workspace');
    }
    if (!existsSync(absPath)) {
      throw new Error(`File does not exist: ${relPath}`);
    }
    return await fs.readFile(absPath, 'utf8');
  },

  /**
   * Safely writes or overwrites code files in the workspace
   */
  async writeCodeFile(relPath, content) {
    const absPath = path.resolve(WORKSPACE_DIR, relPath);
    if (!absPath.startsWith(WORKSPACE_DIR)) {
      throw new Error('Access denied: File outside workspace');
    }
    const dir = path.dirname(absPath);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(absPath, content, 'utf8');
    return true;
  },

  /**
   * Executes a vector search on the active codebase
   */
  async semanticSearchCode(repoName, query) {
    if (!repoName) return [];
    return await analyzerService.semanticSearch(repoName, query, 3);
  }
};

// --- 5. Prompt Templates ---
export const promptTemplates = {
  generate: (prompt, lang) => `
You are the DevPilot AI Coding Agent. Your task is to generate clean, modular, and production-ready code in **${lang}** from natural language description.
Include appropriate comments, follow standard naming conventions, and structure the code correctly.

User Request: "${prompt}"

Format your response strictly as a JSON object:
{
  "code": "YOUR_GENERATED_CODE_HERE",
  "explanation": "Brief explanation of how the code works.",
  "bestPractices": "Suggested best practices and optimizations implemented in the code."
}
`,

  modify: (prompt, existing, lang) => `
You are the DevPilot AI Coding Agent. Your task is to modify the existing **${lang}** code based on the user's request. Keep existing functionalities intact and merge changes seamlessly.

Existing Code:
\`\`\`${lang}
${existing}
\`\`\`

Modification Request: "${prompt}"

Format your response strictly as a JSON object:
{
  "code": "YOUR_MODIFIED_CODE_HERE",
  "explanation": "Description of the modifications made and why.",
  "bestPractices": "Safety tips or optimizations related to the change."
}
`,

  refactor: (prompt, existing, lang) => `
You are the DevPilot AI Coding Agent. Your task is to refactor the following **${lang}** code. Focus on clean code principles, performance improvements, readability, and modularity.

Existing Code:
\`\`\`${lang}
${existing}
\`\`\`

Refactoring Goal: "${prompt}"

Format your response strictly as a JSON object:
{
  "code": "YOUR_REFACTORED_CODE_HERE",
  "explanation": "Summary of changes made during refactoring.",
  "bestPractices": "Design patterns or refactoring principles applied."
}
`,

  explain: (prompt, existing, lang) => `
You are the DevPilot AI Coding Agent. Your task is to explain the following **${lang}** code and answer the user's specific questions.

Code:
\`\`\`${lang}
${existing}
\`\`\`

User Request / Question: "${prompt}"

Format your response strictly as a JSON object:
{
  "code": "",
  "explanation": "A line-by-line or architectural explanation of the code responding to the user request.",
  "bestPractices": "Key design paradigms or potential pitfalls in this code."
}
`,

  suggest_practices: (prompt, existing, lang) => `
You are the DevPilot AI Coding Agent. Your task is to analyze the following **${lang}** code and suggest coding standards, security improvements, and performance best practices.

Code:
\`\`\`${lang}
${existing}
\`\`\`

Specific Focus: "${prompt}"

Format your response strictly as a JSON object:
{
  "code": "",
  "explanation": "Analysis of the code structure.",
  "bestPractices": "A list of recommendations with examples of how to improve security, quality, or efficiency."
}
`,

  generate_tests: (prompt, existing, lang) => `
You are the DevPilot AI Coding Agent. Your task is to generate complete, clean, and isolated automated unit tests for the following **${lang}** code.

Code:
\`\`\`${lang}
${existing}
\`\`\`

Testing Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "code": "YOUR_GENERATED_UNIT_TESTS_HERE",
  "explanation": "Description of test coverage and assertions generated.",
  "bestPractices": "Tips on keeping unit tests isolated and fast."
}
`
};

// --- 6. Agent Runner Execution ---
/**
 * Run the Coding Agent. Streams the response back to the client.
 * @param {Object} rawInput - Inputs for the agent
 * @param {Function} onChunk - SSE chunk callback
 * @param {Function} onComplete - Success callback
 * @param {Function} onError - Error callback
 */
export async function runCodingAgent(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.runCodingAgent) {
    return mockOverrides.runCodingAgent(rawInput, onChunk, onComplete, onError);
  }

  try {
    // 1. Validation
    logger.info('Validating input parameters...');
    const input = validateInput(rawInput);
    logger.info(`Parameters validated. Mode: ${input.mode}, Language: ${input.language}`);

    // 2. Fetch context if filePath is provided
    let content = input.existingContent;
    if (input.filePath && !content) {
      try {
        logger.info(`Loading file content from disk: ${input.filePath}`);
        const relativePath = path.relative(WORKSPACE_DIR, input.filePath);
        content = await tools.readCodeFile(relativePath);
      } catch (err) {
        logger.warn(`Could not read file from disk: ${err.message}. Proceeding with empty content.`);
      }
    }

    // 3. Perform Semantic codebase search if repoName is active to inject workspace context
    let contextSnippet = '';
    if (input.repoName) {
      try {
        logger.info(`Executing semantic search codebase context for repo: ${input.repoName}`);
        const hits = await tools.semanticSearchCode(input.repoName, input.prompt);
        if (hits && hits.length > 0) {
          contextSnippet = hits.map(h => `File: ${h.file}\nCode:\n${h.content}`).join('\n\n');
          logger.info(`Successfully fetched ${hits.length} context code snippets.`);
        }
      } catch (err) {
        logger.warn(`Semantic search failed: ${err.message}`);
      }
    }

    // 4. Construct System instructions and User Prompts
    let systemInstruction = 'You are the DevPilot AI Coding Agent. You ONLY respond with valid JSON containing keys "code", "explanation", and "bestPractices". Do not include markdown code block syntax around the JSON itself.';
    if (contextSnippet) {
      systemInstruction += `\n\nActive Repository Context:\n${contextSnippet}`;
    }

    const templateFn = promptTemplates[input.mode];
    const userPrompt = templateFn(input.prompt, content, input.language);

    const contents = [
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    // 5. Invoke stream completion via LLM Gateway
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
        logger.error('Stream completion failed in LLM Gateway', err);
        onError(err);
      }
    );

  } catch (error) {
    logger.error('Agent execution run aborted', error);
    onError(error);
  }
}
