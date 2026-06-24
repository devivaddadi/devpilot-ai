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
  temperature: 0.3 // Structured and factual temperature
};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Documentation Agent] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Documentation Agent] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Documentation Agent] ERROR: ${msg}`, err.stack || err.message || err)
};

// --- 3. Input Model Validation ---
export function validateInput(payload) {
  const allowedModes = ['readme', 'api', 'docstrings', 'markdown', 'summarize_repo', 'guide'];

  if (!payload.mode || !allowedModes.includes(payload.mode)) {
    throw new Error(`Invalid or missing mode. Allowed modes are: ${allowedModes.join(', ')}`);
  }

  if (!payload.prompt) {
    throw new Error('Prompt is required.');
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
   * Safely writes documentation markdown files inside the workspace sandbox
   */
  async writeDocFile(relPath, content) {
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
   * Fetches the structural summary of the index cache
   */
  async getIndexedRepositorySummary(repoName) {
    if (!repoName) return null;
    try {
      const cache = await analyzerService.getCache(repoName);
      if (!cache || !cache.files) return null;
      
      const fileSummaryList = Object.values(cache.files).map(file => ({
        path: file.path,
        size: file.size,
        chunksCount: file.chunksCount
      }));
      return JSON.stringify(fileSummaryList, null, 2);
    } catch (err) {
      logger.warn(`Failed to read repository index cache: ${err.message}`);
      return null;
    }
  }
};

// --- 5. Configurable Prompt Templates ---
export const promptTemplates = {
  readme: (prompt, code, lang) => `
You are the DevPilot AI Documentation Agent. Your task is to generate a comprehensive, professional README.md file based on the user instructions and code provided.
Ensure you include sections for installation, setup, usage instructions, and APIs.

Context Code:
\`\`\`${lang}
${code}
\`\`\`

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "content": "YOUR_GENERATED_README_MARKDOWN_HERE",
  "summary": "Brief summary of the generated sections."
}
`,

  api: (prompt, code, lang) => `
You are the DevPilot AI Documentation Agent. Your task is to generate API reference documentation in Markdown. Document endpoints, payload request/responses, and parameters clearly.

Context Code/Routes:
\`\`\`${lang}
${code}
\`\`\`

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "content": "YOUR_GENERATED_API_DOCUMENTATION_MARKDOWN_HERE",
  "summary": "Summary of documented endpoints."
}
`,

  docstrings: (prompt, code, lang) => `
You are the DevPilot AI Documentation Agent. Your task is to analyze the provided code and generate inline docstrings or JSDoc comments for classes, functions, and parameter variables.
Do not modify the execution code itself, only insert comments/docstrings.

Original Code:
\`\`\`${lang}
${code}
\`\`\`

Requirements / Comment Style: "${prompt}"

Format your response strictly as a JSON object:
{
  "content": "YOUR_CODE_WITH_DOCUMENTED_DOCSTRINGS_HERE",
  "summary": "List of functions/classes documented."
}
`,

  markdown: (prompt, code, lang) => `
You are the DevPilot AI Documentation Agent. Your task is to output general Markdown documentation on a topic or file.

Context Content:
\`\`\`${lang}
${code}
\`\`\`

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "content": "YOUR_MARKDOWN_DOCUMENTATION_HERE",
  "summary": "Summary of the document."
}
`,

  summarize_repo: (prompt, indexData, repoName) => `
You are the DevPilot AI Documentation Agent. Your task is to summarize the architecture of the repository "${repoName || 'Workspace'}" based on its indexed file registry database.
Provide a high-level overview of files, directory structures, and the codebase purpose.

Indexed File Registry:
${indexData || 'No files indexed yet.'}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "content": "YOUR_REPOSITORY_SUMMARY_MARKDOWN_HERE",
  "summary": "Brief summary of the repository structure."
}
`,

  guide: (prompt, code, lang) => `
You are the DevPilot AI Documentation Agent. Your task is to produce a detailed developer guide or onboarding tutorial. Explain architecture flows, directory files, and setup instructions.

Context Code:
\`\`\`${lang}
${code}
\`\`\`

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "content": "YOUR_DEVELOPER_GUIDE_MARKDOWN_HERE",
  "summary": "Summary of topics covered."
}
`
};

// --- 6. Execution Runner ---
/**
 * Run the Documentation Agent. Streams output back to client.
 * @param {Object} rawInput 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function runDocumentationAgent(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.runDocumentationAgent) {
    return mockOverrides.runDocumentationAgent(rawInput, onChunk, onComplete, onError);
  }

  try {
    // 1. Validate Input
    logger.info('Validating input parameters...');
    const input = validateInput(rawInput);

    // 2. Fetch context content
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

    // 3. Compile Repository Summary context if mode is summarize_repo
    let summaryIndexData = '';
    if (input.mode === 'summarize_repo' && input.repoName) {
      logger.info(`Fetching index data registry for repository: ${input.repoName}`);
      const indexSummary = await tools.getIndexedRepositorySummary(input.repoName);
      if (indexSummary) {
        summaryIndexData = indexSummary;
      }
    }

    // 4. Construct prompt templates
    let systemInstruction = 'You are the DevPilot AI Documentation Agent. You ONLY respond with valid JSON containing keys "content" and "summary". Do not include markdown code block syntax around the JSON itself.';
    
    let userPrompt = '';
    if (input.mode === 'summarize_repo') {
      userPrompt = promptTemplates.summarize_repo(input.prompt, summaryIndexData, input.repoName);
    } else {
      userPrompt = promptTemplates[input.mode](input.prompt, content, input.language);
    }

    const contents = [
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    // 5. Run stream completion via LLM Gateway
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
    logger.error('Documentation Agent run failed', error);
    onError(error);
  }
}
