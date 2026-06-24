import { Router } from 'express';
import * as promptManager from '../services/promptManager.js';

const router = Router();

// List all prompt configurations catalogued
router.get('/', async (req, res) => {
  try {
    const list = await promptManager.listPrompts();
    res.status(200).json(list);
  } catch (err) {
    console.error('[Prompt Manager Router List Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Store/Version a prompt template
router.post('/store', async (req, res) => {
  const { name, template, version, description } = req.body;

  if (!name || !template || !version) {
    return res.status(400).json({ error: 'Missing required parameters: name, template, version.' });
  }

  try {
    const record = await promptManager.storePrompt(name, template, version, description);
    res.status(200).json({ status: 'success', prompt: record });
  } catch (err) {
    console.error('[Prompt Manager Router Store Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Render a prompt template with variables values
router.post('/render', async (req, res) => {
  const { name, variables, version } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Missing required parameter: name.' });
  }

  try {
    const rendered = await promptManager.renderPrompt(name, variables || {}, version);
    res.status(200).json({ status: 'success', rendered });
  } catch (err) {
    console.error('[Prompt Manager Router Render Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Retrieve specific prompt version details
router.get('/:name', async (req, res) => {
  const { name } = req.params;
  const { v } = req.query; // Optional version selector

  try {
    const prompt = await promptManager.getPrompt(name, v);
    if (!prompt) {
      return res.status(404).json({ error: `Prompt "${name}" not found.` });
    }
    res.status(200).json(prompt);
  } catch (err) {
    console.error('[Prompt Manager Router Get Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
