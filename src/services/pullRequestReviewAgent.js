import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import * as llmGateway from './llmGateway.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = path.resolve(__dirname, '../..');

export const mockOverrides = {};

// --- 1. Agent Configuration ---
export const agentConfig = {
  defaultProvider: 'gemini',
  fallbackProviders: ['openai', 'anthropic'],
  maxRetries: 3,
  temperature: 0.1 // Analytical for debugging and code review
};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Pull Request Review Agent] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Pull Request Review Agent] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Pull Request Review Agent] ERROR: ${msg}`, err.stack || err.message || err)
};

// --- 3. Input Model Validation ---
export function validateInput(payload) {
  const allowedModes = [
    'review_changed_files',
    'detect_bugs',
    'suggest_improvements',
    'review_coding_standards',
    'explain_review_comments',
    'produce_review_summary'
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
    diffContent: payload.diffContent || '',
    comments: payload.comments || '',
    reviewsList: payload.reviewsList || ''
  };
}

// --- 4. Context Extraction Tools ---
export const tools = {
  /**
   * Safe execution of git diff HEAD inside workspace sandbox
   */
  async getLocalWorkspaceDiff() {
    return new Promise((resolve) => {
      exec('git diff HEAD', { cwd: WORKSPACE_DIR, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          logger.warn(`Failed to execute git diff: ${error.message}`);
          resolve(''); // Resolve empty string as fallback
        } else {
          resolve(stdout);
        }
      });
    });
  },

  /**
   * Safely reads a code file from the workspace sandbox
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
  }
};

// --- 5. Prompt Templates ---
export const promptTemplates = {
  review_changed_files: (prompt, diff) => `
You are the DevPilot AI Pull Request Review Agent. Your task is to review the following changed files/diff and identify structural issues or correctness errors.

Diff Content:
\`\`\`diff
${diff || 'No changed files detected.'}
\`\`\`

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "reviews": [
    {
      "filePath": "relative/path/to/file",
      "line": 42,
      "comment": "Review comment detailing findings."
    }
  ],
  "summary": "High-level summary of the code changes."
}
`,

  detect_bugs: (prompt, diff) => `
You are the DevPilot AI Pull Request Review Agent. Your task is to analyze the following diff and detect potential runtime bugs, race conditions, edge-case crashes, memory leaks, or type mismatches.

Diff Content:
\`\`\`diff
${diff || 'No changed files detected.'}
\`\`\`

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "reviews": [
    {
      "filePath": "relative/path/to/file",
      "line": 15,
      "comment": "Description of the bug, potential impact, and how it can trigger."
    }
  ],
  "summary": "Overview of bugs detected (if any)."
}
`,

  suggest_improvements: (prompt, diff) => `
You are the DevPilot AI Pull Request Review Agent. Your task is to review the diff and suggest performance, modularity, readability, or optimization improvements.

Diff Content:
\`\`\`diff
${diff || 'No changed files detected.'}
\`\`\`

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "reviews": [
    {
      "filePath": "relative/path/to/file",
      "line": 80,
      "comment": "Refactoring suggestion with code example if appropriate."
    }
  ],
  "summary": "Summary of refactoring and quality suggestions."
}
`,

  review_coding_standards: (prompt, diff) => `
You are the DevPilot AI Pull Request Review Agent. Your task is to verify if the changed code complies with typical styling rules, formatting standards, modular architecture, and safety guidelines.

Diff Content:
\`\`\`diff
${diff || 'No changed files detected.'}
\`\`\`

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "reviews": [
    {
      "filePath": "relative/path/to/file",
      "line": 10,
      "comment": "Violation details and standard recommendation."
    }
  ],
  "summary": "Summary of compliance with standards."
}
`,

  explain_review_comments: (prompt, comments, diff) => `
You are the DevPilot AI Pull Request Review Agent. Your task is to explain and expand upon the review comments provided, matching them with the diff code for educational/clarification purposes.

Diff Content:
\`\`\`diff
${diff || 'No changed files detected.'}
\`\`\`

Review Comments:
${comments}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "Detailed explanation matching review comments with diff lines, indicating why the comment was made.",
  "summary": "Brief summary of the explained topics."
}
`,

  produce_review_summary: (prompt, diff, reviewsList) => `
You are the DevPilot AI Pull Request Review Agent. Your task is to summarize the entire pull request, listing major changes, highlight areas of risk, and provide an overall approval decision (e.g. Approve, Request Changes, Comment).

Diff Content:
\`\`\`diff
${diff || 'No changed files detected.'}
\`\`\`

Reviews List:
${reviewsList}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "summary": "An executive summary of the pull request changes.",
  "riskLevel": "Low | Medium | High",
  "decision": "Approve | Request Changes | Comment",
  "explanation": "Rationale behind the review decision."
}
`
};

// --- 6. Execution Runner ---
/**
 * Run the Pull Request Review Agent. Streams output back to client.
 * @param {Object} rawInput 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function runPullRequestReviewAgent(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.runPullRequestReviewAgent) {
    return mockOverrides.runPullRequestReviewAgent(rawInput, onChunk, onComplete, onError);
  }

  try {
    // 1. Validate inputs
    logger.info('Validating input parameters...');
    const input = validateInput(rawInput);

    // 2. Fetch diff context
    let diff = input.diffContent;
    if (!diff) {
      logger.info('Fetching repository diff for review...');
      diff = await tools.getLocalWorkspaceDiff();
    }

    // 3. Compile prompt templates
    let userPrompt = '';
    const systemInstruction = 'You are the DevPilot AI Pull Request Review Agent. You ONLY respond with valid JSON containing keys as specified in the template. Do not include markdown code block syntax around the JSON itself.';

    if (input.mode === 'explain_review_comments') {
      userPrompt = promptTemplates.explain_review_comments(input.prompt, input.comments || 'No comments provided.', diff);
    } else if (input.mode === 'produce_review_summary') {
      userPrompt = promptTemplates.produce_review_summary(input.prompt, diff, input.reviewsList || 'No review comments yet.');
    } else {
      userPrompt = promptTemplates[input.mode](input.prompt, diff);
    }

    const contents = [
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    // 4. Run stream completion via LLM Gateway
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
    logger.error('Pull Request Review Agent run aborted', error);
    onError(error);
  }
}
