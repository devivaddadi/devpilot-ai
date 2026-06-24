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
  temperature: 0.1 // Lowest temperature is preferred for precise analysis and stack trace mapping
};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Debugger Agent] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Debugger Agent] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Debugger Agent] ERROR: ${msg}`, err.stack || err.message || err)
};

// --- 3. Input Model Validation ---
export function validateInput(payload) {
  const allowedModes = [
    'detect_bugs',
    'explain_exception',
    'suggest_fixes',
    'analyze_stack_trace',
    'detect_perf_issues',
    'detect_code_smells',
    'recommend_improvements'
  ];

  if (!payload.mode || !allowedModes.includes(payload.mode)) {
    throw new Error(`Invalid or missing mode. Allowed modes are: ${allowedModes.join(', ')}`);
  }

  if (!payload.prompt) {
    throw new Error('Prompt/Error details are required.');
  }

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
   * Performs codebase search queries for context matching
   */
  async semanticSearchCode(repoName, query) {
    if (!repoName) return [];
    return await analyzerService.semanticSearch(repoName, query, 3);
  }
};

// --- 5. Prompt Templates ---
export const promptTemplates = {
  detect_bugs: (prompt, code, lang) => `
You are the DevPilot AI Debugger Agent. Your task is to analyze the provided **${lang}** code and detect logical errors, edge cases, syntactical bugs, and runtime flaws.

Code:
\`\`\`${lang}
${code}
\`\`\`

User Context / Focus: "${prompt}"

Format your response strictly as a JSON object:
{
  "analysis": "Details of any logical, syntactical, or runtime bugs found.",
  "rootCause": "Description of why the bugs occur.",
  "suggestedFix": "Refactored or corrected code blocks showing the bug fixes."
}
`,

  explain_exception: (prompt, code, lang) => `
You are the DevPilot AI Debugger Agent. Your task is to explain the provided runtime error/exception and why it occurred in this **${lang}** code block.

Code:
\`\`\`${lang}
${code}
\`\`\`

Error Details: "${prompt}"

Format your response strictly as a JSON object:
{
  "analysis": "Explanation of the exception, when it triggers, and its behavior.",
  "rootCause": "Specific reason why the code triggered this exception.",
  "suggestedFix": "Code changes or patches necessary to avoid or handle this exception."
}
`,

  suggest_fixes: (prompt, code, lang) => `
You are the DevPilot AI Debugger Agent. Your task is to suggest precise code corrections, security patches, or logical fixes for the provided **${lang}** code.

Code:
\`\`\`${lang}
${code}
\`\`\`

Request / Reported Bug: "${prompt}"

Format your response strictly as a JSON object:
{
  "analysis": "Discussion of the fix strategy.",
  "rootCause": "Analysis of the broken logic or bug source.",
  "suggestedFix": "Completed and corrected code block."
}
`,

  analyze_stack_trace: (prompt, code, lang) => `
You are the DevPilot AI Debugger Agent. Your task is to analyze the provided error stack trace, locate the failing files and lines, and trace the issue back to its source.

Stack Trace:
"${prompt}"

Relevant File Content:
\`\`\`${lang}
${code}
\`\`\`

Format your response strictly as a JSON object:
{
  "analysis": "Walkthrough of the stack trace call order leading to the crash.",
  "rootCause": "Isolate the exact line, parameters, or logical fault that triggered the exception.",
  "suggestedFix": "Code changes or adjustments needed to resolve the stack trace error."
}
`,

  detect_perf_issues: (prompt, code, lang) => `
You are the DevPilot AI Debugger Agent. Your task is to review the following **${lang}** code and detect performance bottlenecks, high memory consumption, CPU-intensive loops, or memory leaks.

Code:
\`\`\`${lang}
${code}
\`\`\`

Specific Focus: "${prompt}"

Format your response strictly as a JSON object:
{
  "analysis": "Analysis of algorithmic complexity, data structures, or performance traps in the code.",
  "rootCause": "Primary causes of inefficiencies (e.g. nested loops, excessive copies).",
  "suggestedFix": "Optimized code block demonstrating higher performance."
}
`,

  detect_code_smells: (prompt, code, lang) => `
You are the DevPilot AI Debugger Agent. Your task is to inspect the following **${lang}** code and identify code smells, design flaws, dead code, excessive complexity, or styling issues.

Code:
\`\`\`${lang}
${code}
\`\`\`

Specific Focus: "${prompt}"

Format your response strictly as a JSON object:
{
  "analysis": "Identified smells, anti-patterns, or modularity flaws.",
  "rootCause": "Why these code patterns hamper maintenance, readability, or scalability.",
  "suggestedFix": "Refactored code illustrating clean code standards."
}
`,

  recommend_improvements: (prompt, code, lang) => `
You are the DevPilot AI Debugger Agent. Your task is to recommend high-level design improvements, refactoring strategies, architectural patterns, and quality guidelines for the provided **${lang}** code.

Code:
\`\`\`${lang}
${code}
\`\`\`

Specific Goals: "${prompt}"

Format your response strictly as a JSON object:
{
  "analysis": "Architectural review of the structure.",
  "rootCause": "Identified limitations in the current design schema.",
  "suggestedFix": "Code demonstration of the proposed design patterns or structural adjustments."
}
`
};

// --- 6. Execution Runner ---
/**
 * Run the Debugger Agent. Streams outputs to the client.
 * @param {Object} rawInput 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function runDebuggerAgent(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.runDebuggerAgent) {
    return mockOverrides.runDebuggerAgent(rawInput, onChunk, onComplete, onError);
  }

  try {
    // 1. Validate inputs
    logger.info('Validating input parameters...');
    const input = validateInput(rawInput);

    // 2. Fetch code context
    let content = input.existingContent;
    if (input.filePath && !content) {
      try {
        logger.info(`Loading file content: ${input.filePath}`);
        const relativePath = path.relative(WORKSPACE_DIR, input.filePath);
        content = await tools.readCodeFile(relativePath);
      } catch (err) {
        logger.warn(`Could not read file from disk: ${err.message}`);
      }
    }

    // 3. Compile codebase context if repoName is active
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

    // 4. Construct prompt templates
    let systemInstruction = 'You are the DevPilot AI Debugger Agent. You ONLY respond with valid JSON containing keys "analysis", "rootCause", and "suggestedFix". Do not include markdown code block syntax around the JSON itself.';
    if (contextSnippet) {
      systemInstruction += `\n\nCodebase Reference Context:\n${contextSnippet}`;
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
        logger.error('Streaming failed in LLM Gateway', err);
        onError(err);
      }
    );

  } catch (error) {
    logger.error('Debugger Agent run aborted', error);
    onError(error);
  }
}
