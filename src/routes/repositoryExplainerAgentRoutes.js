import { Router } from 'express';
import * as repositoryExplainerAgent from '../services/repositoryExplainerAgent.js';

const router = Router();

// Run Repository Explainer Agent tasks (explain_folder_structure, explain_architecture, summarize_repo, describe_modules, identify_entry_points, explain_dependencies)
router.post('/run', async (req, res) => {
  const { mode, prompt, repoName } = req.body;

  try {
    // Validate inputs synchronously before setting SSE headers to avoid leaks
    repositoryExplainerAgent.validateInput({ mode, prompt, repoName });

    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await repositoryExplainerAgent.runRepositoryExplainerAgent(
      { mode, prompt, repoName },
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
        console.error('[Repository Explainer Agent Router SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[Repository Explainer Agent Router Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
