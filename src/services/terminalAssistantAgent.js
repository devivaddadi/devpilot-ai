import { fileURLToPath } from 'url';
import path from 'path';
import * as llmGateway from './llmGateway.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const mockOverrides = {};

// --- 1. Agent Configuration ---
export const agentConfig = {
  defaultProvider: 'gemini',
  fallbackProviders: ['openai', 'anthropic'],
  maxRetries: 3,
  temperature: 0.2 // Factual and procedural for commands
};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Terminal Assistant Agent] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Terminal Assistant Agent] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Terminal Assistant Agent] ERROR: ${msg}`, err.stack || err.message || err)
};

// --- 3. Input Model Validation ---
export function validateInput(payload) {
  const allowedModes = [
    'explain_command',
    'suggest_command',
    'explain_error',
    'generate_command',
    'assist_git',
    'assist_docker'
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

// --- 4. Environment Check Tools ---
export const tools = {
  /**
   * Safely fetches host platform information to tailor the commands
   */
  getSystemInfo() {
    return {
      platform: process.platform, // 'win32', 'linux', 'darwin'
      shell: process.env.SHELL || (process.platform === 'win32' ? 'powershell' : 'bash'),
      arch: process.arch
    };
  }
};

// --- 5. Prompt Templates ---
export const promptTemplates = {
  explain_command: (prompt, systemInfo) => `
You are the DevPilot AI Terminal Assistant Agent. Your task is to explain the given terminal command, detail its options/flags, and explain what it does.

Current environment: OS: ${systemInfo.platform}, Shell: ${systemInfo.shell}
Command/Query: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "YOUR_COMMAND_EXPLANATION_MARKDOWN",
  "summary": "Brief summary of what the command does."
}
`,

  suggest_command: (prompt, systemInfo) => `
You are the DevPilot AI Terminal Assistant Agent. Your task is to suggest one or more shell commands to achieve the user's desired objective.

Current environment: OS: ${systemInfo.platform}, Shell: ${systemInfo.shell}
User request: "${prompt}"

Format your response strictly as a JSON object:
{
  "suggestedCommands": [
    {
      "command": "suggested command string",
      "explanation": "What this command does."
    }
  ],
  "summary": "Brief summary of the suggestions."
}
`,

  explain_error: (prompt, systemInfo) => `
You are the DevPilot AI Terminal Assistant Agent. Your task is to analyze the command line error message, identify the root cause (e.g. missing executable, wrong arguments, syntax error, permissions), and provide steps to resolve it.

Current environment: OS: ${systemInfo.platform}, Shell: ${systemInfo.shell}
Error Message / Logs: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "YOUR_ERROR_EXPLANATION_AND_RESOLUTION_STEPS_MARKDOWN",
  "summary": "Short explanation of the error."
}
`,

  generate_command: (prompt, systemInfo) => `
You are the DevPilot AI Terminal Assistant Agent. Your task is to generate a shell command or script tailored to the user request.

Current environment: OS: ${systemInfo.platform}, Shell: ${systemInfo.shell}
Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "command": "GENERATED_SHELL_COMMAND",
  "explanation": "Description of arguments and syntax guidelines.",
  "summary": "Brief description of the command."
}
`,

  assist_git: (prompt, systemInfo) => `
You are the DevPilot AI Terminal Assistant Agent. Your task is to assist the user with Git commands, branching workflows, merging conflicts, commits, rebasing, or stashing.

Current environment: OS: ${systemInfo.platform}, Shell: ${systemInfo.shell}
Git objective/question: "${prompt}"

Format your response strictly as a JSON object:
{
  "suggestedCommands": [
    {
      "command": "git command string",
      "explanation": "Context or usage."
    }
  ],
  "explanation": "Detailed explanation of Git workflow or troubleshooting steps.",
  "summary": "Summary of Git assistance."
}
`,

  assist_docker: (prompt, systemInfo) => `
You are the DevPilot AI Terminal Assistant Agent. Your task is to assist the user with Docker or container-related challenges (e.g., Dockerfiles, docker-compose configuration, image builds, volumes mounting, network issues, container inspections).

Current environment: OS: ${systemInfo.platform}, Shell: ${systemInfo.shell}
Docker objective/question: "${prompt}"

Format your response strictly as a JSON object:
{
  "suggestedCommands": [
    {
      "command": "docker command string",
      "explanation": "Usage description."
    }
  ],
  "explanation": "Detailed explanation of Docker configurations or troubleshooting advice.",
  "summary": "Summary of Docker assistance."
}
`
};

// --- 6. Execution Runner ---
/**
 * Run the Terminal Assistant Agent. Streams output back to client.
 * @param {Object} rawInput 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function runTerminalAssistantAgent(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.runTerminalAssistantAgent) {
    return mockOverrides.runTerminalAssistantAgent(rawInput, onChunk, onComplete, onError);
  }

  try {
    // 1. Validate inputs
    logger.info('Validating input parameters...');
    const input = validateInput(rawInput);

    // 2. Fetch system configuration properties (OS, Shell type)
    const systemInfo = tools.getSystemInfo();

    // 3. Compile prompt templates
    let systemInstruction = 'You are the DevPilot AI Terminal Assistant Agent. You ONLY respond with valid JSON matching keys as specified in the template. Do not include markdown code block syntax around the JSON itself.';
    const userPrompt = promptTemplates[input.mode](input.prompt, systemInfo);

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
    logger.error('Terminal Assistant Agent run aborted', error);
    onError(error);
  }
}
