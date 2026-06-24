import { Router } from 'express';
import * as agentRegistry from '../services/agentRegistry.js';

const router = Router();

// List all registered agents
router.get('/', async (req, res) => {
  try {
    const agents = agentRegistry.listAgents();
    res.status(200).json(agents);
  } catch (err) {
    console.error('[Agent Registry Router List Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Run dynamic discovery reload
router.post('/discover', async (req, res) => {
  try {
    await agentRegistry.discoverAgents();
    const agents = agentRegistry.listAgents();
    res.status(200).json({ status: 'success', agents });
  } catch (err) {
    console.error('[Agent Registry Router Discover Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Retrieve specific agent metadata by name
router.get('/:name', (req, res) => {
  const { name } = req.params;
  const agent = agentRegistry.getAgent(name);
  if (!agent) {
    return res.status(404).json({ error: `Agent with name ${name} not found.` });
  }
  res.status(200).json(agent);
});

// Manually register a new agent configuration
router.post('/register', (req, res) => {
  const { name, description, defaultProvider, fallbackProviders, maxRetries, temperature, modes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Missing required field: name.' });
  }

  try {
    agentRegistry.registerAgent(name, {
      description,
      defaultProvider,
      fallbackProviders,
      maxRetries,
      temperature,
      modes
    });
    const agent = agentRegistry.getAgent(name);
    res.status(200).json({ status: 'success', agent });
  } catch (err) {
    console.error('[Agent Registry Router Register Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
