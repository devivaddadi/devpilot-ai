import { Router } from 'express';
import * as agentWorkflow from '../services/agentWorkflow.js';

const router = Router();

// Synchronous workflow processing (returns the final compiled response details)
router.post('/run', async (req, res) => {
  const { prompt, conversationId, forceRules } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing required parameter: prompt.' });
  }

  try {
    const result = await agentWorkflow.runWorkflow({ prompt, conversationId, forceRules });
    res.status(200).json(result);
  } catch (error) {
    console.error('[Agent Workflow Router Run Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Streaming workflow processing (streams chunks via Server-Sent Events and outputs the final metadata on complete)
router.post('/stream', async (req, res) => {
  const { prompt, conversationId, forceRules } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing required parameter: prompt.' });
  }

  try {
    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await agentWorkflow.runWorkflow(
      { prompt, conversationId, forceRules },
      (chunk) => {
        // Stream text chunks
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    );

    // Write final summary event and close stream
    res.write(`data: ${JSON.stringify({ status: 'completed', metadata: result })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('[Agent Workflow Router Stream SSE Error]', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

export default router;
