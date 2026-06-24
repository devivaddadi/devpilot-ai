import { Router } from 'express';
import * as agentOrchestrator from '../services/agentOrchestrator.js';

const router = Router();

// Orchestrate request and stream responses chunk-by-chunk using Server-Sent Events (SSE)
router.post('/run', async (req, res) => {
  const { prompt, forceRules } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing required parameter: prompt.' });
  }

  try {
    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await agentOrchestrator.orchestrate(
      req.body,
      (chunk) => {
        // Stream text chunks
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      (metadata) => {
        // Stream completion metadata containing final orchestrator decision properties
        res.write(`data: ${JSON.stringify({ status: 'completed', metadata })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
      (err) => {
        console.error('[Agent Orchestrator Router SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Agent Orchestrator Router Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
