import { Router } from 'express';
import * as promptOptimizerAgent from '../services/promptOptimizerAgent.js';

const router = Router();

// Run Prompt Optimizer Agent tasks (rewrite, improve_clarity, reduce_ambiguity, optimize_coding, optimize_documentation, optimize_debugging)
router.post('/run', async (req, res) => {
  const { mode, prompt } = req.body;

  try {
    // Validate inputs synchronously before setting SSE headers
    promptOptimizerAgent.validateInput({ mode, prompt });

    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await promptOptimizerAgent.runPromptOptimizerAgent(
      { mode, prompt },
      (chunk) => {
        // Stream text chunks
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      (selectedProvider) => {
        // Stream completion metadata
        res.write(`data: ${JSON.stringify({ status: 'completed', provider: selectedProvider })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
      (err) => {
        console.error('[Prompt Optimizer Agent Router SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Prompt Optimizer Agent Router Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
