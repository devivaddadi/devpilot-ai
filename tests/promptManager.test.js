import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as promptManager from '../src/services/promptManager.js';

describe('Prompt Manager Service Suite', () => {
  beforeEach(async () => {
    await promptManager.clearPrompts();
  });

  afterEach(async () => {
    await promptManager.clearPrompts();
  });

  describe('Store and Versioning', () => {
    test('storePrompt should create prompt and update activeVersion pointer', async () => {
      const record = await promptManager.storePrompt('welcome', 'hello {{name}}', '1.0.0', 'welcome template');
      assert.strictEqual(record.name, 'welcome');
      assert.strictEqual(record.activeVersion, '1.0.0');
      assert.ok(record.versions['1.0.0']);
      assert.strictEqual(record.versions['1.0.0'].template, 'hello {{name}}');
    });

    test('storePrompt should throw error on missing parameters', async () => {
      await assert.rejects(async () => {
        await promptManager.storePrompt('', 'hello', '1.0.0');
      }, /Name, template, and version are required/);
    });

    test('getPrompt should fetch default active version or chosen version', async () => {
      await promptManager.storePrompt('coder', 'write {{lang}}', '1.0.0', 'ver 1');
      await promptManager.storePrompt('coder', 'write cleaner {{lang}}', '1.1.0', 'ver 2');

      // Default active version should resolve to latest (1.1.0)
      const latest = await promptManager.getPrompt('coder');
      assert.strictEqual(latest.version, '1.1.0');
      assert.strictEqual(latest.template, 'write cleaner {{lang}}');

      // Query version 1.0.0 explicitly
      const old = await promptManager.getPrompt('coder', '1.0.0');
      assert.strictEqual(old.version, '1.0.0');
      assert.strictEqual(old.template, 'write {{lang}}');
    });

    test('getPrompt should return null if unrecognized prompt or version is queried', async () => {
      const unknown = await promptManager.getPrompt('unknown_prompt');
      assert.strictEqual(unknown, null);

      await promptManager.storePrompt('coder', 'write {{lang}}', '1.0.0');
      const unknownVersion = await promptManager.getPrompt('coder', '2.0.0');
      assert.strictEqual(unknownVersion, null);
    });
  });

  describe('Prompt Templates Rendering', () => {
    test('renderPrompt should substitute variable placeholders correctly', async () => {
      await promptManager.storePrompt('greet', 'hello {{ name }}, welcome to {{ system }}!', '1.0.0');

      const rendered = await promptManager.renderPrompt('greet', { name: 'Alice', system: 'devpilot' });
      assert.strictEqual(rendered, 'hello Alice, welcome to devpilot!');
    });

    test('renderPrompt should throw error if prompt is not found', async () => {
      await assert.rejects(async () => {
        await promptManager.renderPrompt('unknown_template', {});
      }, /Prompt "unknown_template" not found/);
    });
  });

  describe('REST Endpoint Router Integration', () => {
    test('POST /api/prompt-manager/store should register template', async () => {
      const res = await request(app)
        .post('/api/prompt-manager/store')
        .send({
          name: 'explain_code',
          template: 'explain: {{code}}',
          version: '1.0.0',
          description: 'code explainer prompt'
        })
        .expect(200);

      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.prompt.name, 'explain_code');
    });

    test('POST /api/prompt-manager/store should return HTTP 400 on missing arguments', async () => {
      await request(app)
        .post('/api/prompt-manager/store')
        .send({ name: 'empty' })
        .expect(400);
    });

    test('POST /api/prompt-manager/render should output compiled template string', async () => {
      await promptManager.storePrompt('render_test', 'value is {{val}}', '1.0.0');

      const res = await request(app)
        .post('/api/prompt-manager/render')
        .send({
          name: 'render_test',
          variables: { val: '42' }
        })
        .expect(200);

      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.rendered, 'value is 42');
    });

    test('GET /api/prompt-manager should list templates', async () => {
      await promptManager.storePrompt('t1', 't1 template', '1.0.0');

      const res = await request(app)
        .get('/api/prompt-manager')
        .expect(200);

      assert.ok(Array.isArray(res.body));
      assert.strictEqual(res.body.some(p => p.name === 't1'), true);
    });

    test('GET /api/prompt-manager/:name should return specific template metadata', async () => {
      await promptManager.storePrompt('target', 'target template', '1.2.0');

      const res = await request(app)
        .get('/api/prompt-manager/target')
        .expect(200);

      assert.strictEqual(res.body.name, 'target');
      assert.strictEqual(res.body.version, '1.2.0');
    });

    test('GET /api/prompt-manager/:name should return 404 if not found', async () => {
      await request(app)
        .get('/api/prompt-manager/nonexistent')
        .expect(404);
    });
  });
});
