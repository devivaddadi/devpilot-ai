import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPTS_PATH = path.join(__dirname, '../../.devpilot-cache/prompts.json');

let promptsCache = null;

// --- Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Prompt Manager] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Prompt Manager] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Prompt Manager] ERROR: ${msg}`, err.stack || err.message || err)
};

/**
 * Ensures prompts cache file exists and is loaded
 */
async function ensurePrompts() {
  const dir = path.dirname(PROMPTS_PATH);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }

  if (!existsSync(PROMPTS_PATH)) {
    promptsCache = {};
    await fs.writeFile(PROMPTS_PATH, JSON.stringify(promptsCache, null, 2), 'utf8');
  } else if (!promptsCache) {
    try {
      const data = await fs.readFile(PROMPTS_PATH, 'utf8');
      promptsCache = JSON.parse(data);
    } catch (err) {
      logger.warn(`Failed to parse prompts cache file, resetting: ${err.message}`);
      promptsCache = {};
    }
  }
}

/**
 * Saves prompts to disk
 */
async function savePrompts() {
  await ensurePrompts();
  await fs.writeFile(PROMPTS_PATH, JSON.stringify(promptsCache, null, 2), 'utf8');
}

/**
 * Reset prompts database (mainly for testing)
 */
export async function clearPrompts() {
  promptsCache = {};
  await savePrompts();
}

/**
 * Stores a prompt template under a specific version (SemVer format recommended)
 * @param {string} name 
 * @param {string} template 
 * @param {string} version 
 * @param {string} [description=''] 
 */
export async function storePrompt(name, template, version, description = '') {
  if (!name || !template || !version) {
    throw new Error('Name, template, and version are required parameters.');
  }

  await ensurePrompts();

  if (!promptsCache[name]) {
    promptsCache[name] = {
      name,
      activeVersion: version,
      versions: {}
    };
  }

  const promptRecord = promptsCache[name];
  promptRecord.versions[version] = {
    version,
    template,
    description,
    createdAt: new Date().toISOString()
  };

  // Automatically update activeVersion to the latest stored version
  promptRecord.activeVersion = version;

  await savePrompts();
  logger.info(`Stored prompt "${name}" version ${version}`);
  return promptRecord;
}

/**
 * Resolves a prompt configuration definition by name and version
 * @param {string} name 
 * @param {string} [version=null] - If null, retrieves activeVersion
 */
export async function getPrompt(name, version = null) {
  await ensurePrompts();
  const record = promptsCache[name];
  if (!record) {
    return null;
  }

  const targetVersion = version || record.activeVersion;
  const versionData = record.versions[targetVersion];
  if (!versionData) {
    return null;
  }

  return {
    name,
    version: targetVersion,
    template: versionData.template,
    description: versionData.description
  };
}

/**
 * Renders a prompt template replacing double curly brace parameters (e.g. {{variable}})
 * @param {string} name 
 * @param {Object} variables 
 * @param {string} [version=null] 
 */
export async function renderPrompt(name, variables = {}, version = null) {
  const promptData = await getPrompt(name, version);
  if (!promptData) {
    throw new Error(`Prompt "${name}" not found (version: ${version || 'active'}).`);
  }

  let rendered = promptData.template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, String(value));
  }

  return rendered;
}

/**
 * Lists all stored prompt configurations catalogued
 */
export async function listPrompts() {
  await ensurePrompts();
  return Object.values(promptsCache);
}
