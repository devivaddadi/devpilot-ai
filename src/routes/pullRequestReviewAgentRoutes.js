import { Router } from 'express';
import * as pullRequestReviewAgent from '../services/pullRequestReviewAgent.js';

const router = Router();

// Run PR Review Agent tasks (review_changed_files, detect_bugs, suggest_improvements, review_coding_standards, explain_review_comments, produce_review_summary)
router.post('/run', async (req, res) => {
  const { mode, prompt, diffContent, comments, reviewsList } = req.body;

  try {
    // Validate inputs synchronously before writing headers to avoid 200 leaks on error
    pullRequestReviewAgent.validateInput({ mode, prompt, diffContent, comments, reviewsList });

    // Setup SSE connection headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await pullRequestReviewAgent.runPullRequestReviewAgent(
      { mode, prompt, diffContent, comments, reviewsList },
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
        console.error('[PR Review Agent Router SSE Error]', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('[PR Review Agent Router Error]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
