import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICES_DIR = __dirname;

const registry = new Map();

// --- Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Agent Registry] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Agent Registry] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Agent Registry] ERROR: ${msg}`, err.stack || err.message || err)
};

/**
 * Register an agent configuration manually
 * @param {string} name 
 * @param {Object} metadata 
 */
export function registerAgent(name, metadata) {
  if (!name) {
    throw new Error('Agent name is required for registration.');
  }

  registry.set(name, {
    name,
    description: metadata.description || 'No description provided.',
    defaultProvider: metadata.defaultProvider || 'gemini',
    fallbackProviders: metadata.fallbackProviders || ['openai', 'anthropic'],
    maxRetries: metadata.maxRetries || 3,
    temperature: metadata.temperature ?? 0.3,
    modes: metadata.modes || [],
    filePath: metadata.filePath || null,
    isDynamic: !!metadata.isDynamic
  });

  logger.info(`Registered agent: ${name}`);
}

/**
 * Dynamically scan and import service files ending in *Agent.js
 */
export async function discoverAgents() {
  logger.info('Starting dynamic agent discovery...');
  try {
    const files = await fs.readdir(SERVICES_DIR);

    for (const file of files) {
      if (file.endsWith('Agent.js') && file !== 'agentRegistry.js') {
        const filePath = path.join(SERVICES_DIR, file);
        const name = file.replace('.js', ''); // e.g. codingAgent

        try {
          // Format file path into a file URL for ESM compatibility on Windows systems
          const fileUrl = pathToFileURL(filePath).href;
          const agentModule = await import(fileUrl);

          const config = agentModule.agentConfig || {};
          let modes = [];

          if (agentModule.promptTemplates) {
            modes = Object.keys(agentModule.promptTemplates);
          }

          registerAgent(name, {
            description: config.description || `DevPilot AI ${name.replace('Agent', '')} Agent.`,
            defaultProvider: config.defaultProvider,
            fallbackProviders: config.fallbackProviders,
            maxRetries: config.maxRetries,
            temperature: config.temperature,
            modes,
            filePath: file,
            isDynamic: true
          });

        } catch (importErr) {
          logger.warn(`Failed to dynamically import agent module ${file}: ${importErr.message}`);
        }
      }
    }
    logger.info(`Agent discovery complete. Total agents registered: ${registry.size}`);
  } catch (err) {
    logger.error('Error during dynamic agent discovery', err);
    throw err;
  }
}

/**
 * Retrieve metadata for a single agent
 * @param {string} name 
 * @returns {Object|null}
 */
export function getAgent(name) {
  return registry.get(name) || null;
}

/**
 * Return all registered agents
 * @returns {Array<Object>}
 */
export function listAgents() {
  return Array.from(registry.values());
}

/**
 * Resets the registry mapping (for testing isolation)
 */
export function clearRegistry() {
  registry.clear();
}
