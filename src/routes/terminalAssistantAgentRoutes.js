import { Router } from 'express';
import * as terminalAssistantAgent from '../services/terminalAssistantAgent.js';

const router = Router();

// Run Terminal Assistant Agent tasks (explain_command, suggest_command, explain_error, generate_command, assist_git, assist_docker)
router.post('/run', async (req, res) => {
  const { mode, prompt } = req.body;

  try {
    // Validate inputs synchronously before writing headers to avoid 200 leaks on error
    terminalAssistantAgent.validateInput({ mode, prompt });

    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await terminalAssistantAgent.runTerminalAssistantAgent(
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
        console.error('[Terminal Assistant Agent Router SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Terminal Assistant Agent Router Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
