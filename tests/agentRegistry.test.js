import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as agentRegistry from '../src/services/agentRegistry.js';

describe('Agent Registry Service Suite', () => {
  beforeEach(async () => {
    agentRegistry.clearRegistry();
  });

  afterEach(async () => {
    agentRegistry.clearRegistry();
  });

  describe('Static Registration and Lookup', () => {
    test('registerAgent should store metadata and getAgent should lookup successfully', () => {
      agentRegistry.registerAgent('testAgent', {
        description: 'Test Description',
        defaultProvider: 'openai',
        temperature: 0.7,
        modes: ['mode1', 'mode2']
      });

      const agent = agentRegistry.getAgent('testAgent');
      assert.ok(agent);
      assert.strictEqual(agent.name, 'testAgent');
      assert.strictEqual(agent.description, 'Test Description');
      assert.strictEqual(agent.defaultProvider, 'openai');
      assert.strictEqual(agent.temperature, 0.7);
      assert.deepStrictEqual(agent.modes, ['mode1', 'mode2']);
    });

    test('registerAgent should throw error on missing name', () => {
      assert.throws(() => {
        agentRegistry.registerAgent('', {});
      }, /Agent name is required/);
    });

    test('listAgents should list all registered items', () => {
      agentRegistry.registerAgent('agentA', { description: 'Agent A' });
      agentRegistry.registerAgent('agentB', { description: 'Agent B' });

      const list = agentRegistry.listAgents();
      assert.strictEqual(list.length, 2);
      assert.strictEqual(list.some(a => a.name === 'agentA'), true);
      assert.strictEqual(list.some(a => a.name === 'agentB'), true);
    });
  });

  describe('Dynamic Discovery', () => {
    test('discoverAgents should read services directory and register existing Agent files', async () => {
      await agentRegistry.discoverAgents();

      const list = agentRegistry.listAgents();
      assert.ok(list.length > 0);

      // Verify that standard workspace agents like codingAgent and promptOptimizerAgent are discovered
      const hasCodingAgent = list.some(a => a.name === 'codingAgent');
      const hasOptimizerAgent = list.some(a => a.name === 'promptOptimizerAgent');

      assert.strictEqual(hasCodingAgent, true);
      assert.strictEqual(hasOptimizerAgent, true);

      const codingAgentMeta = agentRegistry.getAgent('codingAgent');
      assert.ok(codingAgentMeta.modes.length > 0);
      assert.strictEqual(codingAgentMeta.isDynamic, true);
    });
  });

  describe('REST Endpoint Router Integration', () => {
    test('GET /api/agent-registry should list agents', async () => {
      agentRegistry.registerAgent('apiAgent', { description: 'API Check' });

      const res = await request(app)
        .get('/api/agent-registry')
        .expect(200);

      assert.ok(Array.isArray(res.body));
      assert.strictEqual(res.body.some(a => a.name === 'apiAgent'), true);
    });

    test('GET /api/agent-registry/:name should return specific agent', async () => {
      agentRegistry.registerAgent('lookupAgent', { description: 'Lookup check' });

      const res = await request(app)
        .get('/api/agent-registry/lookupAgent')
        .expect(200);

      assert.strictEqual(res.body.name, 'lookupAgent');
      assert.strictEqual(res.body.description, 'Lookup check');
    });

    test('GET /api/agent-registry/:name should return 404 if not found', async () => {
      await request(app)
        .get('/api/agent-registry/unknown_agent')
        .expect(404);
    });

    test('POST /api/agent-registry/register should create a new agent', async () => {
      const res = await request(app)
        .post('/api/agent-registry/register')
        .send({
          name: 'manualAgent',
          description: 'manual route creation',
          modes: ['test']
        })
        .expect(200);

      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.agent.name, 'manualAgent');

      const resolved = agentRegistry.getAgent('manualAgent');
      assert.ok(resolved);
      assert.strictEqual(resolved.description, 'manual route creation');
    });

    test('POST /api/agent-registry/discover should reload discovery registry list', async () => {
      const res = await request(app)
        .post('/api/agent-registry/discover')
        .expect(200);

      assert.strictEqual(res.body.status, 'success');
      assert.ok(res.body.agents.length > 0);
      assert.strictEqual(res.body.agents.some(a => a.name === 'codingAgent'), true);
    });
  });
});
