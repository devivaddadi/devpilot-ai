import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as agentRegistry from '../src/services/agentRegistry.js';
import * as taskRouter from '../src/services/taskRouter.js';
import * as agentOrchestrator from '../src/services/agentOrchestrator.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Agent Orchestrator Service Suite', () => {
  beforeEach(async () => {
    agentRegistry.clearRegistry();
    // Register mock available agents
    agentRegistry.registerAgent('promptOptimizerAgent', { description: 'Optimizer', modes: ['rewrite'] });
    agentRegistry.registerAgent('codingAgent', { description: 'Coder', modes: ['generate'] });
  });

  afterEach(async () => {
    agentRegistry.clearRegistry();
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    for (const key in taskRouter.mockOverrides) {
      delete taskRouter.mockOverrides[key];
    }
    for (const key in agentOrchestrator.mockOverrides) {
      delete agentOrchestrator.mockOverrides[key];
    }
  });

  describe('Orchestrator Pipeline', () => {
    test('orchestrate should route and run selected agent successfully', async () => {
      taskRouter.mockOverrides.routeTask = async (prompt, forceRules) => {
        return {
          agentName: 'promptOptimizerAgent',
          mode: 'rewrite',
          reasoning: 'matches prompt optimizer'
        };
      };

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /Raw Prompt/); // Inside promptOptimizerAgent template
        onChunk('{"optimizedPrompt":"optimized"}');
        onComplete('gemini');
      };

      let chunkResponse = '';
      let completionMetadata = null;

      await agentOrchestrator.orchestrate(
        {
          prompt: 'optimize this instruction',
          forceRules: true
        },
        (chunk) => { chunkResponse += chunk; },
        (meta) => { completionMetadata = meta; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"optimizedPrompt":"optimized"}');
      assert.strictEqual(completionMetadata.agentName, 'promptOptimizerAgent');
      assert.strictEqual(completionMetadata.mode, 'rewrite');
      assert.strictEqual(completionMetadata.provider, 'gemini');
    });

    test('orchestrate should fail if prompt parameter is missing', async () => {
      let errTriggered = false;

      await agentOrchestrator.orchestrate(
        {},
        () => {},
        () => {},
        (err) => {
          assert.match(err.message, /Prompt is required/);
          errTriggered = true;
        }
      );

      assert.ok(errTriggered);
    });

    test('orchestrate should fail if routed agent is unregistered', async () => {
      taskRouter.mockOverrides.routeTask = async (prompt, forceRules) => {
        return {
          agentName: 'unregisteredAgent',
          mode: 'default',
          reasoning: 'unregistered reasoning'
        };
      };

      let errTriggered = false;

      await agentOrchestrator.orchestrate(
        { prompt: 'unregistered agent test' },
        () => {},
        () => {},
        (err) => {
          assert.match(err.message, /is not registered/);
          errTriggered = true;
        }
      );

      assert.ok(errTriggered);
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/orchestrator/run should stream agent output via SSE', async () => {
      taskRouter.mockOverrides.routeTask = async (prompt, forceRules) => {
        return {
          agentName: 'codingAgent',
          mode: 'generate',
          reasoning: 'matches coding agent request'
        };
      };

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"code":"console.log(\'hello\')"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/orchestrator/run')
        .send({
          prompt: 'write hello world function',
          forceRules: true
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /console\.log/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /"agentName":"codingAgent"/);
      assert.match(res.text, /\[DONE\]/);
    });

    test('POST /api/orchestrator/run should return 400 if prompt is missing', async () => {
      await request(app)
        .post('/api/orchestrator/run')
        .send({})
        .expect(400);
    });
  });
});
