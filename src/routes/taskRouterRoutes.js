import { Router } from 'express';
import * as taskRouter from '../services/taskRouter.js';

const router = Router();

// Route user prompt/intent to the best agent
router.post('/route', async (req, res) => {
  const { prompt, forceRules } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing required parameter: prompt.' });
  }

  try {
    const decision = await taskRouter.routeTask(prompt, !!forceRules);
    res.status(200).json(decision);
  } catch (err) {
    console.error('[Task Router Route Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
