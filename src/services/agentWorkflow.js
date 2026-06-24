import * as agentOrchestrator from './agentOrchestrator.js';
import * as dbService from './dbService.js';

// --- Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Agent Workflow] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Agent Workflow] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Agent Workflow] ERROR: ${msg}`, err.stack || err.message || err)
};

/**
 * Runs the complete End-to-End Agent Workflow.
 * Tries intent routing, agent selection, context mapping, execution streaming, and packages the final result.
 * 
 * @param {Object} payload 
 * @param {string} payload.prompt - The user input instruction prompt
 * @param {string} [payload.conversationId] - Optional conversation session ID
 * @param {boolean} [payload.forceRules] - Optional flag to force compliance rules
 * @param {Function} [onChunk] - Optional callback receiving string chunks during LLM streaming
 * @returns {Promise<Object>} The packaged final response structure and metadata
 */
export async function runWorkflow(payload, onChunk = () => {}) {
  const { prompt, conversationId } = payload;

  if (!prompt) {
    throw new Error('Prompt is required to run the agent workflow.');
  }

  logger.info(`Starting workflow pipeline. Session: ${conversationId || 'none'}`);

  let activeConvoId = conversationId;
  if (activeConvoId) {
    const convo = await dbService.getConversation(activeConvoId);
    if (!convo) {
      throw new Error(`Conversation session not found for ID: ${activeConvoId}`);
    }
  }

  let compiledOutput = '';
  let metaResult = null;

  // Invoke the orchestrator, which performs Routing, Agent Lookup, Memory updates, and LLM Streaming
  await agentOrchestrator.orchestrate(
    {
      ...payload,
      conversationId: activeConvoId
    },
    (chunk) => {
      compiledOutput += chunk;
      onChunk(chunk);
    },
    (meta) => {
      metaResult = meta;
    },
    (err) => {
      throw err;
    }
  );

  logger.info('Workflow execution complete. Packaging final response...');

  let messagesCount = 0;
  if (activeConvoId) {
    const finalConvo = await dbService.getConversation(activeConvoId);
    messagesCount = finalConvo ? finalConvo.messages.length : 0;
  }

  return {
    status: 'success',
    conversationId: activeConvoId || null,
    agentName: metaResult?.agentName || null,
    mode: metaResult?.mode || null,
    provider: metaResult?.provider || null,
    reasoning: metaResult?.reasoning || null,
    messagesCount,
    output: compiledOutput
  };
}
