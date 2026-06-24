import path from 'path';
import { fileURLToPath } from 'url';
import * as llmGateway from './llmGateway.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const mockOverrides = {};

// --- 1. Agent Configuration ---
export const agentConfig = {
  defaultProvider: 'gemini',
  fallbackProviders: ['openai', 'anthropic'],
  maxRetries: 3,
  temperature: 0.3 // Focused temperature for structured prompt generation
};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Prompt Optimizer Agent] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Prompt Optimizer Agent] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Prompt Optimizer Agent] ERROR: ${msg}`, err.stack || err.message || err)
};

// --- 3. Input Model Validation ---
export function validateInput(payload) {
  const allowedModes = [
    'rewrite',
    'improve_clarity',
    'reduce_ambiguity',
    'optimize_coding',
    'optimize_documentation',
    'optimize_debugging'
  ];

  if (!payload.mode || !allowedModes.includes(payload.mode)) {
    throw new Error(`Invalid or missing mode. Allowed modes are: ${allowedModes.join(', ')}`);
  }

  if (!payload.prompt) {
    throw new Error('Prompt is required.');
  }

  return {
    mode: payload.mode,
    prompt: payload.prompt
  };
}

// --- 4. Prompt Templates ---
export const promptTemplates = {
  rewrite: (prompt) => `
You are the DevPilot AI Prompt Optimizer Agent. Your task is to rewrite the user's prompt to be more structured, detailed, and effective for LLMs.

Raw Prompt: "${prompt}"

Format your response strictly as a JSON object:
{
  "optimizedPrompt": "YOUR_REWRITTEN_AND_OPTIMIZED_PROMPT_HERE",
  "explanation": "Brief explanation of the changes made and why."
}
`,

  improve_clarity: (prompt) => `
You are the DevPilot AI Prompt Optimizer Agent. Your task is to rewrite the user's prompt to maximize clarity, defining explicit actions, roles, and instructions.

Raw Prompt: "${prompt}"

Format your response strictly as a JSON object:
{
  "optimizedPrompt": "YOUR_CLARIFIED_PROMPT_HERE",
  "explanation": "Description of clarity improvements, such as simplified grammar, lists of instructions, or clear rules."
}
`,

  reduce_ambiguity: (prompt) => `
You are the DevPilot AI Prompt Optimizer Agent. Your task is to rewrite the user's prompt to eliminate vague requirements, assumptions, or ambiguous wording, replacing them with specific boundaries.

Raw Prompt: "${prompt}"

Format your response strictly as a JSON object:
{
  "optimizedPrompt": "YOUR_UNAMBIGUOUS_PROMPT_HERE",
  "explanation": "Summary of identified vague parts and how they were made concrete."
}
`,

  optimize_coding: (prompt) => `
You are the DevPilot AI Prompt Optimizer Agent. Your task is to rewrite the user's prompt to optimize it specifically for code generation, refactoring, or programming tasks. Add constraints for modularity, naming conventions, and language specifications.

Raw Prompt: "${prompt}"

Format your response strictly as a JSON object:
{
  "optimizedPrompt": "YOUR_OPTIMIZED_CODING_PROMPT_HERE",
  "explanation": "Explanation of coding standards, syntax instructions, or isolation rules added to the prompt."
}
`,

  optimize_documentation: (prompt) => `
You are the DevPilot AI Prompt Optimizer Agent. Your task is to rewrite the user's prompt to optimize it for generating technical documentation, READMEs, or developer tutorials. Enforce markdown formatting rules, API schemas, and onboarding guides.

Raw Prompt: "${prompt}"

Format your response strictly as a JSON object:
{
  "optimizedPrompt": "YOUR_OPTIMIZED_DOCUMENTATION_PROMPT_HERE",
  "explanation": "Explanation of layout rules, formatting requirements, or doc sections added to the prompt."
}
`,

  optimize_debugging: (prompt) => `
You are the DevPilot AI Prompt Optimizer Agent. Your task is to rewrite the user's prompt to optimize it for debugging, exception analysis, or stack trace investigations. Instruct the target LLM to identify root causes, search stack files, and output clear patches.

Raw Prompt: "${prompt}"

Format your response strictly as a JSON object:
{
  "optimizedPrompt": "YOUR_OPTIMIZED_DEBUGGING_PROMPT_HERE",
  "explanation": "Explanation of error tracing, call stack parsing, or fix templates added to the prompt."
}
`
};

// --- 5. Execution Runner ---
/**
 * Run the Prompt Optimizer Agent. Streams output back to client.
 * @param {Object} rawInput 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function runPromptOptimizerAgent(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.runPromptOptimizerAgent) {
    return mockOverrides.runPromptOptimizerAgent(rawInput, onChunk, onComplete, onError);
  }

  try {
    // 1. Validate inputs
    logger.info('Validating input parameters...');
    const input = validateInput(rawInput);

    // 2. Construct prompt templates
    const systemInstruction = 'You are the DevPilot AI Prompt Optimizer Agent. You ONLY respond with valid JSON containing keys "optimizedPrompt" and "explanation". Do not include markdown code block syntax around the JSON itself.';
    
    const templateFn = promptTemplates[input.mode];
    const userPrompt = templateFn(input.prompt);

    const contents = [
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    // 3. Invoke stream completion via LLM Gateway
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
    logger.error('Prompt Optimizer Agent run aborted', error);
    onError(error);
  }
}
