import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as taskRouter from './taskRouter.js';
import * as agentRegistry from './agentRegistry.js';

// Pre-import static agents to guarantee high performance and reliable unit test isolation
import * as codingAgent from './codingAgent.js';
import * as debuggerAgent from './debuggerAgent.js';
import * as documentationAgent from './documentationAgent.js';
import * as planningAgent from './planningAgent.js';
import * as promptOptimizerAgent from './promptOptimizerAgent.js';
import * as repositoryExplainerAgent from './repositoryExplainerAgent.js';
import * as pullRequestReviewAgent from './pullRequestReviewAgent.js';
import * as terminalAssistantAgent from './terminalAssistantAgent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICES_DIR = __dirname;

export const mockOverrides = {};

const staticAgents = {
  codingAgent,
  debuggerAgent,
  documentationAgent,
  planningAgent,
  promptOptimizerAgent,
  repositoryExplainerAgent,
  pullRequestReviewAgent,
  terminalAssistantAgent
};

// --- Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Agent Orchestrator] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Agent Orchestrator] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Agent Orchestrator] ERROR: ${msg}`, err.stack || err.message || err)
};

/**
 * Orchestrate user request by routing to the best matching agent and invoking it.
 * @param {Object} rawInput 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function orchestrate(rawInput, onChunk, onComplete, onError) {
  if (mockOverrides.orchestrate) {
    return mockOverrides.orchestrate(rawInput, onChunk, onComplete, onError);
  }

  try {
    const { prompt, forceRules } = rawInput;

    if (!prompt) {
      throw new Error('Prompt is required for orchestration.');
    }

    // 1. Analyze user intent via Task Router
    logger.info('Routing user request intent...');
    const decision = await taskRouter.routeTask(prompt, forceRules);
    logger.info(`Routed to Agent: ${decision.agentName}. Mode: ${decision.mode}`);

    // 2. Fetch Agent Metadata
    const agentMeta = agentRegistry.getAgent(decision.agentName);
    if (!agentMeta) {
      throw new Error(`Orchestration failed: Routed agent "${decision.agentName}" is not registered in the Agent Registry.`);
    }

    // 3. Resolve Runner Function
    let agentModule = staticAgents[decision.agentName];
    if (!agentModule) {
      // Dynamic loading for custom/future agents
      logger.info(`Agent "${decision.agentName}" is a dynamic custom agent. Loading module dynamically...`);
      if (!agentMeta.filePath) {
        throw new Error(`Dynamic agent metadata for "${decision.agentName}" is missing its filePath.`);
      }
      const filePath = path.join(SERVICES_DIR, agentMeta.filePath);
      const fileUrl = pathToFileURL(filePath).href;
      agentModule = await import(fileUrl);
    }

    // Runner naming convention matching: runCamelCase
    const runnerName = `run${decision.agentName.charAt(0).toUpperCase()}${decision.agentName.slice(1)}`;
    const runner = agentModule[runnerName];

    if (!runner || typeof runner !== 'function') {
      throw new Error(`Runner function "${runnerName}" not found or exported in agent module.`);
    }

    const { conversationId } = rawInput;

    let responseText = '';
    const wrappedOnChunk = (chunk) => {
      responseText += chunk;
      onChunk(chunk);
    };

    const wrappedOnComplete = async (selectedProvider) => {
      if (conversationId) {
        try {
          const conversationMemory = await import('./conversationMemory.js');
          await conversationMemory.storeMessage(conversationId, 'model', responseText);
        } catch (err) {
          logger.warn(`Failed to store model response in conversation memory: ${err.message}`);
        }
      }
      logger.info(`Orchestration complete. Active agent: ${decision.agentName}`);
      onComplete({
        agentName: decision.agentName,
        mode: decision.mode,
        provider: selectedProvider,
        reasoning: decision.reasoning
      });
    };

    if (conversationId) {
      try {
        const conversationMemory = await import('./conversationMemory.js');
        await conversationMemory.storeMessage(conversationId, 'user', prompt);
      } catch (err) {
        logger.warn(`Failed to store user message in conversation memory: ${err.message}`);
      }
    }

    // 4. Invoke Agent Runner
    logger.info(`Invoking target agent runner "${runnerName}"...`);
    const { memoryStorage } = await import('./llmGateway.js');
    await new Promise((resolvePromise, rejectPromise) => {
      memoryStorage.run({ conversationId }, async () => {
        try {
          await runner(
            {
              ...rawInput,
              mode: decision.mode,
              prompt: prompt
            },
            wrappedOnChunk,
            async (selectedProvider) => {
              try {
                await wrappedOnComplete(selectedProvider);
                resolvePromise();
              } catch (err) {
                rejectPromise(err);
              }
            },
            (err) => {
              onError(err);
              rejectPromise(err);
            }
          );
        } catch (err) {
          rejectPromise(err);
        }
      });
    });

  } catch (error) {
    logger.error('Orchestration run failed', error);
    onError(error);
  }
}
