import { Router } from 'express';
import * as conversationMemory from '../services/conversationMemory.js';

const router = Router();

// Store a new message in a conversation
router.post('/message', async (req, res) => {
  const { conversationId, role, content, metadata } = req.body;

  if (!conversationId || !role || !content) {
    return res.status(400).json({ error: 'Missing required parameters: conversationId, role, content.' });
  }

  try {
    const message = await conversationMemory.storeMessage(conversationId, role, content, metadata);
    res.status(200).json({ status: 'success', message });
  } catch (error) {
    console.error('[Memory Router Message Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve the optimized context (summary + message history)
router.get('/context/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  try {
    const context = await conversationMemory.getConversationContext(conversationId);
    res.status(200).json(context);
  } catch (error) {
    console.error('[Memory Router Context Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger conversation summarization
router.post('/summarize/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  try {
    await conversationMemory.summarizeConversation(conversationId);
    res.status(200).json({ status: 'success', message: 'Conversation summarized successfully.' });
  } catch (error) {
    console.error('[Memory Router Summarize Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Wipes conversation messages and summary metadata
router.delete('/clear/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  try {
    const cleared = await conversationMemory.clearConversationMemory(conversationId);
    if (cleared) {
      res.status(200).json({ status: 'success', message: 'Conversation memory cleared.' });
    } else {
      res.status(404).json({ error: `Conversation ID ${conversationId} not found.` });
    }
  } catch (error) {
    console.error('[Memory Router Clear Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
