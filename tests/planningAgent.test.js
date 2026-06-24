import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as planningAgent from '../src/services/planningAgent.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Planning Agent Service Suite', () => {

  afterEach(() => {
    // Clean mock overrides
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    for (const key in planningAgent.mockOverrides) {
      delete planningAgent.mockOverrides[key];
    }
  });

  describe('Input Model Validation', () => {
    test('validateInput should accept valid modes and prompts', () => {
      const payload = { mode: 'convert_idea_to_tasks', prompt: 'build a calculator' };
      const validated = planningAgent.validateInput(payload);
      assert.strictEqual(validated.mode, 'convert_idea_to_tasks');
      assert.strictEqual(validated.prompt, 'build a calculator');
    });

    test('validateInput should throw errors on invalid modes or missing prompt', () => {
      assert.throws(() => {
        planningAgent.validateInput({ mode: 'invalid_mode', prompt: 'test' });
      }, /Invalid or missing mode/);

      assert.throws(() => {
        planningAgent.validateInput({ mode: 'convert_idea_to_tasks' });
      }, /Prompt is required/);
    });
  });

  describe('Prompt Templates Construction', () => {
    test('should construct valid JSON templates including prompt tags', () => {
      const template = planningAgent.promptTemplates.convert_idea_to_tasks('build online store');
      assert.match(template, /"plan":/);
      assert.match(template, /"milestones":/);
      assert.match(template, /build online store/);
    });
  });

  describe('Agent Running Pipeline', () => {
    test('runPlanningAgent should invoke gateway streaming with custom prompts', async () => {
      let chunkResponse = '';
      let completedProvider = '';

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /estimate/); // Mode matches estimate_order prompt template
        assert.match(contents[0].parts[0].text, /order task list/); // Injected prompt matches
        onChunk('{"plan":"estimates"}');
        onComplete('gemini');
      };

      await planningAgent.runPlanningAgent(
        {
          mode: 'estimate_order',
          prompt: 'order task list'
        },
        (chunk) => { chunkResponse += chunk; },
        (provider) => { completedProvider = provider; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"plan":"estimates"}');
      assert.strictEqual(completedProvider, 'gemini');
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/agent/planning/run should stream chunks successfully via SSE', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"plan":"roadmap definition"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/agent/planning/run')
        .send({
          mode: 'produce_roadmap',
          prompt: 'MVP timeline'
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /{"chunk":"{\\"plan\\":\\"roadmap definition\\"}"}/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });
  });
});
