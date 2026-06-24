import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store database inside workspace .devpilot-cache directory
const DB_PATH = path.join(__dirname, '../../.devpilot-cache/db.json');

let dbCache = null;

/**
 * Initializes and loads the JSON-based database
 */
async function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }

  if (!existsSync(DB_PATH)) {
    dbCache = {
      conversations: {},
      memory: {}
    };
    await fs.writeFile(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf8');
  } else if (!dbCache) {
    try {
      const data = await fs.readFile(DB_PATH, 'utf8');
      dbCache = JSON.parse(data);
      if (!dbCache.conversations) dbCache.conversations = {};
      if (!dbCache.memory) dbCache.memory = {};
    } catch (err) {
      console.warn(`Failed to parse DB, resetting: ${err.message}`);
      dbCache = { conversations: {}, memory: {} };
    }
  }
}

/**
 * Saves database changes to disk
 */
export async function saveDb() {
  await ensureDb();
  await fs.writeFile(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf8');
}

/**
 * Reset/Clear entire database contents
 */
export async function clearDb() {
  dbCache = { conversations: {}, memory: {} };
  await saveDb();
}

/**
 * Create a new conversation
 * @param {string} title 
 * @param {Object} metadata 
 */
export async function createConversation(title = 'New Conversation', metadata = {}) {
  await ensureDb();
  const id = crypto.randomUUID();
  dbCache.conversations[id] = {
    id,
    title,
    metadata,
    createdAt: new Date().toISOString(),
    messages: []
  };
  await saveDb();
  return dbCache.conversations[id];
}

/**
 * Get a single conversation details and messages
 * @param {string} id 
 */
export async function getConversation(id) {
  await ensureDb();
  return dbCache.conversations[id] || null;
}

/**
 * List all conversations sorted by creation date descending
 */
export async function listConversations() {
  await ensureDb();
  return Object.values(dbCache.conversations).sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Add a message to an existing conversation
 * @param {string} conversationId 
 * @param {'user'|'model'} role 
 * @param {string} content 
 * @param {Object} metadata 
 */
export async function addMessage(conversationId, role, content, metadata = {}) {
  await ensureDb();
  const convo = dbCache.conversations[conversationId];
  if (!convo) {
    throw new Error(`Conversation with ID ${conversationId} does not exist.`);
  }

  const message = {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata
  };

  convo.messages.push(message);
  await saveDb();
  return message;
}

/**
 * Delete a conversation
 * @param {string} id 
 */
export async function deleteConversation(id) {
  await ensureDb();
  if (dbCache.conversations[id]) {
    delete dbCache.conversations[id];
    await saveDb();
    return true;
  }
  return false;
}

/**
 * Save user profile/preference memory fact
 * @param {string} key 
 * @param {string} value 
 */
export async function setMemory(key, value) {
  await ensureDb();
  dbCache.memory[key] = {
    value,
    updatedAt: new Date().toISOString()
  };
  await saveDb();
}

/**
 * Get a saved memory fact by key
 * @param {string} key 
 */
export async function getMemory(key) {
  await ensureDb();
  return dbCache.memory[key]?.value || null;
}

/**
 * List all saved memory facts
 */
export async function listMemory() {
  await ensureDb();
  return dbCache.memory;
}

/**
 * Delete a saved memory fact
 * @param {string} key 
 */
export async function deleteMemory(key) {
  await ensureDb();
  if (dbCache.memory[key]) {
    delete dbCache.memory[key];
    await saveDb();
    return true;
  }
  return false;
}
