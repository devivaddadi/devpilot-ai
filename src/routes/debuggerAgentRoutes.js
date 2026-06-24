import { Router } from 'express';
import * as debuggerAgent from '../services/debuggerAgent.js';

const router = Router();

// Run Debugger Agent tasks (detect_bugs, explain_exception, suggest_fixes, analyze_stack_trace, detect_perf_issues, detect_code_smells, recommend_improvements)
router.post('/run', async (req, res) => {
  const { mode, prompt, filePath, existingContent, language, repoName } = req.body;

  try {
    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await debuggerAgent.runDebuggerAgent(
      { mode, prompt, filePath, existingContent, language, repoName },
      (chunk) => {
        // Stream chunked text responses
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      (selectedProvider) => {
        // Stream completed state
        res.write(`data: ${JSON.stringify({ status: 'completed', provider: selectedProvider })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
      (err) => {
        console.error('[Debugger Agent Router SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Debugger Agent Router Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
