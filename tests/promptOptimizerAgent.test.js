import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as promptOptimizerAgent from '../src/services/promptOptimizerAgent.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Prompt Optimizer Agent Service Suite', () => {
  afterEach(() => {
    // Clean all gateway mock overrides
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    // Clean all agent mock overrides
    for (const key in promptOptimizerAgent.mockOverrides) {
      delete promptOptimizerAgent.mockOverrides[key];
    }
  });

  describe('Input Model Validation', () => {
    test('validateInput should accept valid modes and prompts', () => {
      const payload = { mode: 'rewrite', prompt: 'optimize my instruction' };
      const validated = promptOptimizerAgent.validateInput(payload);
      assert.strictEqual(validated.mode, 'rewrite');
      assert.strictEqual(validated.prompt, 'optimize my instruction');
    });

    test('validateInput should throw errors on invalid modes or missing prompt', () => {
      assert.throws(() => {
        promptOptimizerAgent.validateInput({ mode: 'invalid_mode', prompt: 'test' });
      }, /Invalid or missing mode/);

      assert.throws(() => {
        promptOptimizerAgent.validateInput({ mode: 'rewrite' });
      }, /Prompt is required/);
    });
  });

  describe('Prompt Templates Construction', () => {
    const modes = [
      'rewrite',
      'improve_clarity',
      'reduce_ambiguity',
      'optimize_coding',
      'optimize_documentation',
      'optimize_debugging'
    ];

    modes.forEach((mode) => {
      test(`should construct valid templates for mode: ${mode}`, () => {
        const template = promptOptimizerAgent.promptTemplates[mode]('test prompt');
        assert.match(template, /test prompt/);
        assert.match(template, /"optimizedPrompt":/);
        assert.match(template, /"explanation":/);
      });
    });
  });

  describe('Agent Running Pipeline', () => {
    test('runPromptOptimizerAgent should invoke gateway streaming', async () => {
      let chunkResponse = '';
      let completedProvider = '';

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /test prompt/);
        onChunk('{"optimizedPrompt":"optimized","explanation":"none"}');
        onComplete('gemini');
      };

      await promptOptimizerAgent.runPromptOptimizerAgent(
        {
          mode: 'rewrite',
          prompt: 'test prompt'
        },
        (chunk) => { chunkResponse += chunk; },
        (provider) => { completedProvider = provider; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"optimizedPrompt":"optimized","explanation":"none"}');
      assert.strictEqual(completedProvider, 'gemini');
    });

    test('runPromptOptimizerAgent should handle streaming failures gracefully', async () => {
      let errorTriggered = false;

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onError(new Error('Gateway failure'));
      };

      await promptOptimizerAgent.runPromptOptimizerAgent(
        {
          mode: 'rewrite',
          prompt: 'test prompt'
        },
        () => {},
        () => {},
        (err) => {
          assert.strictEqual(err.message, 'Gateway failure');
          errorTriggered = true;
        }
      );

      assert.ok(errorTriggered);
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/agent/prompt-optimizer/run should stream chunks successfully via SSE', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"optimizedPrompt":"final"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/agent/prompt-optimizer/run')
        .send({
          mode: 'optimize_coding',
          prompt: 'write code'
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /{"chunk":"{\\"optimizedPrompt\\":\\"final\\"}"}/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });

    test('POST /api/agent/prompt-optimizer/run should return error on invalid inputs', async () => {
      const res = await request(app)
        .post('/api/agent/prompt-optimizer/run')
        .send({
          mode: 'invalid_mode',
          prompt: 'write code'
        })
        .expect(500);

      assert.match(res.headers['content-type'], /application\/json/);
      assert.ok(res.body.error);
    });
  });
});
