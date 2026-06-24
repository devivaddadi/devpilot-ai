import { Router } from 'express';
import * as sharedToolLayer from '../services/sharedToolLayer.js';

const router = Router();

// Parse and extract fenced code blocks from markdown input
router.post('/parse-code', (req, res) => {
  const { markdown } = req.body;

  if (!markdown) {
    return res.status(400).json({ error: 'Missing required parameter: markdown.' });
  }

  try {
    const blocks = sharedToolLayer.parser.extractCodeBlocks(markdown);
    res.status(200).json({ status: 'success', blocks });
  } catch (err) {
    console.error('[Shared Tools Router Parse Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Format structures into standard markdown alert blocks
router.post('/format-markdown', (req, res) => {
  const { formatType, type, message, headers, rows, summary, content } = req.body;

  if (!formatType) {
    return res.status(400).json({ error: 'Missing required parameter: formatType.' });
  }

  try {
    let formatted = '';
    if (formatType === 'alert') {
      if (!message) return res.status(400).json({ error: 'Message is required for alert format.' });
      formatted = sharedToolLayer.markdown.generateAlert(type || 'NOTE', message);
    } else if (formatType === 'table') {
      if (!headers) return res.status(400).json({ error: 'Headers parameter is required for table format.' });
      formatted = sharedToolLayer.markdown.generateTable(headers, rows || []);
    } else if (formatType === 'collapsible') {
      if (!summary || !content) return res.status(400).json({ error: 'Summary and content parameters are required for collapsible format.' });
      formatted = sharedToolLayer.markdown.generateCollapsible(summary, content);
    } else {
      return res.status(400).json({ error: `Unsupported formatType: ${formatType}. Allowed: alert, table, collapsible.` });
    }

    res.status(200).json({ status: 'success', formatted });
  } catch (err) {
    console.error('[Shared Tools Router Format Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
