import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as llmGateway from './llmGateway.js';
import * as analyzerService from './analyzerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = path.resolve(__dirname, '../..');

export const mockOverrides = {};

// --- 1. Agent Configuration ---
export const agentConfig = {
  defaultProvider: 'gemini',
  fallbackProviders: ['openai', 'anthropic'],
  maxRetries: 3,
  temperature: 0.2 // Factual and analytical temperature
};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Repository Explainer Agent] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Repository Explainer Agent] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Repository Explainer Agent] ERROR: ${msg}`, err.stack || err.message || err)
};

// Helper: Safely resolve repo directory within sandbox
export function getRepoDir(repoName) {
  if (repoName) {
    const resolved = path.resolve(WORKSPACE_DIR, 'cloned_repos', repoName);
    const clonesBase = path.resolve(WORKSPACE_DIR, 'cloned_repos');
    if (!resolved.startsWith(clonesBase)) {
      throw new Error('Security Error: Repository path must reside within the cloned_repos directory.');
    }
    return resolved;
  }
  return WORKSPACE_DIR;
}

// --- 3. Input Model Validation ---
export function validateInput(payload) {
  const allowedModes = [
    'explain_folder_structure',
    'explain_architecture',
    'summarize_repo',
    'describe_modules',
    'identify_entry_points',
    'explain_dependencies'
  ];

  if (!payload.mode || !allowedModes.includes(payload.mode)) {
    throw new Error(`Invalid or missing mode. Allowed modes are: ${allowedModes.join(', ')}`);
  }

  if (!payload.prompt) {
    throw new Error('Prompt is required.');
  }

  // Safe checks for repoName
  if (payload.repoName) {
    getRepoDir(payload.repoName);
  }

  return {
    mode: payload.mode,
    prompt: payload.prompt,
    repoName: payload.repoName || null
  };
}

// --- 4. Workspace Context Tools ---
export const tools = {
  /**
   * Recursively get file list structure
   */
  async getFileListRecursive(dir, relativeTo = dir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return [];
    if (!existsSync(dir)) {
      return [];
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result = [];
    const ignored = ['.git', 'node_modules', 'dist', 'build', '.devpilot-cache', 'cloned_repos', 'coverage'];

    for (const entry of entries) {
      if (ignored.includes(entry.name)) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = path.relative(relativeTo, absPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        result.push({ path: relPath + '/', isDir: true });
        try {
          const sub = await this.getFileListRecursive(absPath, relativeTo, depth + 1, maxDepth);
          result.push(...sub);
        } catch (err) {
          logger.warn(`Failed to read subdirectory ${absPath}: ${err.message}`);
        }
      } else {
        result.push({ path: relPath, isDir: false });
      }
    }
    return result;
  },

  /**
   * Reads dependencies files (package.json, requirements.txt, requirements.txt, Cargo.toml etc)
   */
  async getDependenciesContent(repoDir) {
    const dependencyFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml'];
    for (const file of dependencyFiles) {
      const filePath = path.join(repoDir, file);
      if (existsSync(filePath)) {
        try {
          const stats = await fs.stat(filePath);
          if (stats.size < 100 * 1024) { // Limit to 100KB to stay within tokens
            const content = await fs.readFile(filePath, 'utf8');
            return `Dependency File (${file}):\n${content}`;
          }
        } catch (err) {
          logger.warn(`Failed to read dependency file ${file}: ${err.message}`);
        }
      }
    }
    return 'No standard dependencies file (package.json, requirements.txt, etc.) found at repository root.';
  }
};

// --- 5. Prompt Templates ---
export const promptTemplates = {
  explain_folder_structure: (prompt, fileTree, repoName) => `
You are the DevPilot AI Repository Explainer Agent. Your task is to analyze the file tree of the repository "${repoName || 'Workspace'}" and explain the folder structure, indicating what is stored in each directory.

File Tree:
${JSON.stringify(fileTree, null, 2)}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "YOUR_FOLDER_STRUCTURE_EXPLANATION_MARKDOWN",
  "summary": "High level description of folder layout."
}
`,

  explain_architecture: (prompt, fileTree, mainFiles, repoName) => `
You are the DevPilot AI Repository Explainer Agent. Your task is to explain the high-level architecture and design patterns used in the repository "${repoName || 'Workspace'}".

File Tree:
${JSON.stringify(fileTree, null, 2)}

Key Files Identified:
${mainFiles}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "YOUR_ARCHITECTURE_EXPLANATION_MARKDOWN",
  "summary": "Brief summary of architecture layout."
}
`,

  summarize_repo: (prompt, fileTree, repoName) => `
You are the DevPilot AI Repository Explainer Agent. Your task is to provide a comprehensive summary of the repository "${repoName || 'Workspace'}", explaining its purpose, features, and main capabilities.

File Tree:
${JSON.stringify(fileTree, null, 2)}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "YOUR_REPOSITORY_SUMMARY_MARKDOWN",
  "summary": "Brief high level summary."
}
`,

  describe_modules: (prompt, fileTree, mainFiles, repoName) => `
You are the DevPilot AI Repository Explainer Agent. Your task is to describe the key modules, logical services, or components inside "${repoName || 'Workspace'}", detailing their responsibilities and interactions.

File Tree:
${JSON.stringify(fileTree, null, 2)}

Key Modules/Files:
${mainFiles}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "YOUR_MODULES_DESCRIPTION_MARKDOWN",
  "summary": "List of described modules."
}
`,

  identify_entry_points: (prompt, fileTree, repoName) => `
You are the DevPilot AI Repository Explainer Agent. Your task is to inspect the folder structure of "${repoName || 'Workspace'}" and identify the main entry points (e.g. server startups, main run scripts, configuration builders, command processors).

File Tree:
${JSON.stringify(fileTree, null, 2)}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "YOUR_ENTRY_POINTS_EXPLANATION_MARKDOWN",
  "summary": "Main entry point file names list."
}
`,

  explain_dependencies: (prompt, dependenciesContent, repoName) => `
You are the DevPilot AI Repository Explainer Agent. Your task is to analyze the project dependencies of "${repoName || 'Workspace'}" and explain the third-party libraries used, their roles, and system constraints.

Dependencies File Content:
${dependenciesContent}

Requirements: "${prompt}"

Format your response strictly as a JSON object:
{
  "explanation": "YOUR_DEPENDENCIES_EXPLANATION_MARKDOWN",
  "summary": "Short overview of dependencies."
}
`
};

// --- 6. Execution Runner ---
/**
 * Run the Repository Explainer Agent. Streams output back to client.
 * @param {Object} rawInput 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function runRepositoryExplainerAgent(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.runRepositoryExplainerAgent) {
    return mockOverrides.runRepositoryExplainerAgent(rawInput, onChunk, onComplete, onError);
  }

  try {
    // 1. Validate inputs
    logger.info('Validating input parameters...');
    const input = validateInput(rawInput);

    const repoDir = getRepoDir(input.repoName);

    // 2. Fetch Context Content
    let userPrompt = '';
    const systemInstruction = 'You are the DevPilot AI Repository Explainer Agent. You ONLY respond with valid JSON containing keys "explanation" and "summary". Do not include markdown code block syntax around the JSON itself.';

    if (input.mode === 'explain_dependencies') {
      logger.info('Reading project dependency configuration...');
      const dependenciesContent = await tools.getDependenciesContent(repoDir);
      userPrompt = promptTemplates.explain_dependencies(input.prompt, dependenciesContent, input.repoName);
    } else {
      logger.info('Scanning repository directory structure...');
      const fileTree = await tools.getFileListRecursive(repoDir);

      if (input.mode === 'explain_folder_structure' || input.mode === 'summarize_repo' || input.mode === 'identify_entry_points') {
        userPrompt = promptTemplates[input.mode](input.prompt, fileTree, input.repoName);
      } else {
        // explain_architecture or describe_modules
        const mainFiles = [];
        const importantFiles = ['package.json', 'server.js', 'app.js', 'index.js', 'main.py', 'Cargo.toml', 'README.md'];
        for (const file of importantFiles) {
          const filePath = path.join(repoDir, file);
          if (existsSync(filePath)) {
            mainFiles.push(file);
          }
        }
        const keyFilesStr = mainFiles.length > 0 ? mainFiles.join(', ') : 'No standard root config/entry files detected.';
        userPrompt = promptTemplates[input.mode](input.prompt, fileTree, keyFilesStr, input.repoName);
      }
    }

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
    logger.error('Repository Explainer Agent run aborted', error);
    onError(error);
  }
}
