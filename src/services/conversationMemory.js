import * as dbService from './dbService.js';
import * as llmGateway from './llmGateway.js';

// --- 1. Memory Configuration ---
export const memoryConfig = {
  maxMessagesBeforeSummary: 10, // Max messages in history before triggering summarization
  keepRecentMessagesCount: 4    // Number of recent messages to preserve after summarization
};

export const mockOverrides = {};

// --- 2. Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Conversation Memory] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Conversation Memory] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Conversation Memory] ERROR: ${msg}`, err.stack || err.message || err)
};

// --- 3. Storage and Lifecycles ---

/**
 * Appends a message to the conversation and triggers automated trimming if threshold is breached.
 * @param {string} conversationId 
 * @param {'user'|'model'} role 
 * @param {string} content 
 * @param {Object} [metadata={}] 
 */
export async function storeMessage(conversationId, role, content, metadata = {}) {
  logger.info(`Storing message for conversation ${conversationId}. Role: ${role}`);
  const message = await dbService.addMessage(conversationId, role, content, metadata);

  // Check if we need to auto-summarize
  const convo = await dbService.getConversation(conversationId);
  if (convo && convo.messages.length > memoryConfig.maxMessagesBeforeSummary) {
    logger.info(`Conversation ${conversationId} messages length (${convo.messages.length}) exceeds threshold of ${memoryConfig.maxMessagesBeforeSummary}. Triggering auto-summarization...`);
    await summarizeConversation(conversationId);
  }

  return message;
}

/**
 * Retrieves the optimized context for the LLM.
 * Returns the summary (if any) and the active messages list.
 * @param {string} conversationId 
 * @returns {Promise<{systemPromptExtension: string, messages: Array}>}
 */
export async function getConversationContext(conversationId) {
  const convo = await dbService.getConversation(conversationId);
  if (!convo) {
    throw new Error(`Conversation not found for ID: ${conversationId}`);
  }

  let systemPromptExtension = '';
  if (convo.metadata && convo.metadata.summary) {
    systemPromptExtension = `Previous Conversation Summary:\n${convo.metadata.summary}`;
  }

  return {
    systemPromptExtension,
    messages: convo.messages
  };
}

/**
 * Summarizes the old conversation history, updates metadata, and prunes message list.
 * @param {string} conversationId 
 */
export async function summarizeConversation(conversationId) {
  if (mockOverrides.summarizeConversation) {
    return mockOverrides.summarizeConversation(conversationId);
  }

  const convo = await dbService.getConversation(conversationId);
  if (!convo || convo.messages.length === 0) {
    return;
  }

  // Determine which messages to summarize (all except the last keepRecentMessagesCount)
  const pruneBound = convo.messages.length - memoryConfig.keepRecentMessagesCount;
  if (pruneBound <= 0) {
    return; // Not enough messages to summarize
  }

  const toSummarize = convo.messages.slice(0, pruneBound);
  const toKeep = convo.messages.slice(pruneBound);

  logger.info(`Summarizing ${toSummarize.length} messages. Keeping ${toKeep.length} messages.`);

  // Create transcript
  const transcript = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n');

  const systemInstruction = 'You are a helpful assistant. Summarize the following dialogue transcript in a concise paragraph of 2-3 sentences. Focus on key decisions, technical choices, and active instructions.';
  
  const contents = [
    { role: 'user', parts: [{ text: `Transcript:\n${transcript}` }] }
  ];

  let summaryChunkText = '';
  
  try {
    await new Promise((resolve, reject) => {
      llmGateway.streamCompletion(
        contents,
        systemInstruction,
        { forceMock: true }, // Automatically fallback to mock completion in tests/API key absence
        (chunk) => {
          summaryChunkText += chunk;
        },
        () => resolve(),
        (err) => reject(err)
      );
    });

    const newSummary = summaryChunkText.trim();
    
    // Combine with old summary if it exists
    let finalSummary = newSummary;
    if (convo.metadata && convo.metadata.summary) {
      finalSummary = `${convo.metadata.summary}\nAdditionally: ${newSummary}`;
    }

    // Update conversation properties
    convo.metadata = convo.metadata || {};
    convo.metadata.summary = finalSummary;
    convo.messages = toKeep;

    await dbService.saveDb();
    logger.info(`Conversation ${conversationId} summarized successfully.`);

  } catch (err) {
    logger.error(`Failed to summarize conversation ${conversationId}`, err);
    throw err;
  }
}

/**
 * Resets a conversation's messages list and wipes metadata summary.
 * @param {string} conversationId 
 */
export async function clearConversationMemory(conversationId) {
  logger.info(`Clearing memory for conversation ${conversationId}`);
  const convo = await dbService.getConversation(conversationId);
  if (convo) {
    convo.messages = [];
    convo.metadata = convo.metadata || {};
    delete convo.metadata.summary;
    await dbService.saveDb();
    return true;
  }
  return false;
}
