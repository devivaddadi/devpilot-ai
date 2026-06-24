import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as terminalAssistantAgent from '../src/services/terminalAssistantAgent.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Terminal Assistant Agent Service Suite', () => {
  afterEach(() => {
    // Clean all gateway mock overrides
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    // Clean all agent mock overrides
    for (const key in terminalAssistantAgent.mockOverrides) {
      delete terminalAssistantAgent.mockOverrides[key];
    }
  });

  describe('Input Model Validation', () => {
    test('validateInput should accept valid modes and prompts', () => {
      const payload = { mode: 'explain_command', prompt: 'ls -la' };
      const validated = terminalAssistantAgent.validateInput(payload);
      assert.strictEqual(validated.mode, 'explain_command');
      assert.strictEqual(validated.prompt, 'ls -la');
    });

    test('validateInput should throw errors on invalid modes or missing prompt', () => {
      assert.throws(() => {
        terminalAssistantAgent.validateInput({ mode: 'invalid_mode', prompt: 'test' });
      }, /Invalid or missing mode/);

      assert.throws(() => {
        terminalAssistantAgent.validateInput({ mode: 'explain_command' });
      }, /Prompt is required/);
    });
  });

  describe('Environment Check Tools', () => {
    test('getSystemInfo should return system configuration properties safely without terminal scripts execution', () => {
      const info = terminalAssistantAgent.tools.getSystemInfo();
      assert.ok(info.platform);
      assert.ok(info.shell);
      assert.ok(info.arch);
    });
  });

  describe('Prompt Templates Construction', () => {
    const modes = [
      'explain_command',
      'suggest_command',
      'explain_error',
      'generate_command',
      'assist_git',
      'assist_docker'
    ];

    modes.forEach((mode) => {
      test(`should construct valid templates for mode: ${mode}`, () => {
        const sysInfo = { platform: 'linux', shell: '/bin/bash' };
        const template = terminalAssistantAgent.promptTemplates[mode]('test query', sysInfo);
        assert.match(template, /test query/);
        assert.match(template, /linux/);
        assert.match(template, /bash/);
      });
    });
  });

  describe('Agent Running Pipeline', () => {
    test('runTerminalAssistantAgent should invoke gateway streaming', async () => {
      let chunkResponse = '';
      let completedProvider = '';

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /explain/);
        onChunk('{"explanation":"meaning","summary":"explain"}');
        onComplete('gemini');
      };

      await terminalAssistantAgent.runTerminalAssistantAgent(
        {
          mode: 'explain_command',
          prompt: 'ls -al'
        },
        (chunk) => { chunkResponse += chunk; },
        (provider) => { completedProvider = provider; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"explanation":"meaning","summary":"explain"}');
      assert.strictEqual(completedProvider, 'gemini');
    });

    test('runTerminalAssistantAgent should handle streaming failures gracefully', async () => {
      let errorTriggered = false;

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onError(new Error('Gateway execution failure'));
      };

      await terminalAssistantAgent.runTerminalAssistantAgent(
        {
          mode: 'explain_command',
          prompt: 'ls -al'
        },
        () => {},
        () => {},
        (err) => {
          assert.strictEqual(err.message, 'Gateway execution failure');
          errorTriggered = true;
        }
      );

      assert.ok(errorTriggered);
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/agent/terminal-assistant/run should stream chunks successfully via SSE', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"command":"ls"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/agent/terminal-assistant/run')
        .send({
          mode: 'generate_command',
          prompt: 'list directory'
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /"chunk"/);
      assert.match(res.text, /ls/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });

    test('POST /api/agent/terminal-assistant/run should return HTTP 500 error on invalid inputs', async () => {
      const res = await request(app)
        .post('/api/agent/terminal-assistant/run')
        .send({
          mode: 'invalid_mode',
          prompt: 'run script'
        })
        .expect(500);

      assert.match(res.headers['content-type'], /application\/json/);
      assert.ok(res.body.error);
    });
  });
});
