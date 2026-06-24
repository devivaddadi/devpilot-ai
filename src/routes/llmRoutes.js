import { Router } from 'express';
import * as llmGateway from '../services/llmGateway.js';

const router = Router();

// Stream completions via SSE with fallback options
router.post('/stream', async (req, res) => {
  const { contents, systemInstruction, provider, maxRetries, forceMock } = req.body;

  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({ error: 'contents array is required.' });
  }

  try {
    // Setup standard EventSource headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await llmGateway.streamCompletion(
      contents,
      systemInstruction,
      { provider, maxRetries, forceMock },
      (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      (selectedProvider) => {
        res.write(`data: ${JSON.stringify({ provider: selectedProvider, status: 'completed' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
      (err) => {
        console.error('[Gateway SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Gateway Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
