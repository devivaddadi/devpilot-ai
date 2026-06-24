import { Router } from 'express';
import * as dbService from '../services/dbService.js';
import * as chatService from '../services/chatService.js';

const router = Router();

// --- Conversations API ---

// 1. Create Conversation
router.post('/conversations', async (req, res) => {
  const { title, metadata } = req.body;
  try {
    const convo = await dbService.createConversation(title || 'New Conversation', metadata || {});
    res.status(201).json({ success: true, conversation: convo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. List Conversations
router.get('/conversations', async (req, res) => {
  try {
    const convos = await dbService.listConversations();
    res.json(convos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Conversation
router.get('/conversations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const convo = await dbService.getConversation(id);
    if (!convo) {
      return res.status(404).json({ error: `Conversation with ID ${id} not found.` });
    }
    res.json(convo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Delete Conversation
router.delete('/conversations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const success = await dbService.deleteConversation(id);
    if (!success) {
      return res.status(404).json({ error: `Conversation with ID ${id} not found.` });
    }
    res.json({ success: true, message: 'Conversation deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Message Streaming API ---

// 5. Send Message & Stream Response (SSE)
router.post('/message', async (req, res) => {
  const { conversationId, message, repoName } = req.body;

  if (!conversationId || !message) {
    return res.status(400).json({ error: 'conversationId and message are required.' });
  }

  try {
    // Check if conversation exists first
    const convo = await dbService.getConversation(conversationId);
    if (!convo) {
      return res.status(404).json({ error: `Conversation with ID ${conversationId} not found.` });
    }

    // Save user message to database
    await dbService.addMessage(conversationId, 'user', message);
    
    // Attempt automatic memory/fact extraction on user message
    await chatService.extractAndSaveMemories(message);

    // Establish SSE Connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    await chatService.streamChatResponse(
      conversationId,
      message,
      { repoName },
      (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      async () => {
        // Stream completed successfully, save model response to db
        await dbService.addMessage(conversationId, 'model', fullResponse);
        res.write(`data: [DONE]\n\n`);
        res.end();
      },
      (err) => {
        console.error('[SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Chat Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Memory API ---

// 6. List Memory Facts
router.get('/memory', async (req, res) => {
  try {
    const memory = await dbService.listMemory();
    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Store Memory Fact
router.post('/memory', async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'key and value are required.' });
  }

  try {
    await dbService.setMemory(key, value);
    res.json({ success: true, message: `Fact recorded for "${key}".` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Delete Memory Fact
router.delete('/memory/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const success = await dbService.deleteMemory(key);
    if (!success) {
      return res.status(404).json({ error: `Fact for key "${key}" not found.` });
    }
    res.json({ success: true, message: 'Fact deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
