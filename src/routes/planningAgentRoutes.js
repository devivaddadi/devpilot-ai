import { Router } from 'express';
import * as planningAgent from '../services/planningAgent.js';

const router = Router();

// Run Planning Agent tasks (convert_idea_to_tasks, generate_milestones, estimate_order, produce_roadmap, suggest_priorities)
router.post('/run', async (req, res) => {
  const { mode, prompt, repoName } = req.body;

  try {
    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await planningAgent.runPlanningAgent(
      { mode, prompt, repoName },
      (chunk) => {
        // Stream text chunks
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      (selectedProvider) => {
        // Stream completed metadata state
        res.write(`data: ${JSON.stringify({ status: 'completed', provider: selectedProvider })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
      (err) => {
        console.error('[Planning Agent Router SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Planning Agent Router Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
