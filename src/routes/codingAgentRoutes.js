import { Router } from 'express';
import * as codingAgent from '../services/codingAgent.js';

const router = Router();

// Run Coding Agent tasks (generate, modify, refactor, explain, suggest_practices, generate_tests)
router.post('/run', async (req, res) => {
  const { mode, prompt, filePath, existingContent, language, repoName } = req.body;

  try {
    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await codingAgent.runCodingAgent(
      { mode, prompt, filePath, existingContent, language, repoName },
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
        console.error('[Agent Router SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Agent Router Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
