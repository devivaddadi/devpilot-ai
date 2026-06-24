import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as dbService from '../src/services/dbService.js';
import * as agentRegistry from '../src/services/agentRegistry.js';
import * as taskRouter from '../src/services/taskRouter.js';
import * as agentOrchestrator from '../src/services/agentOrchestrator.js';
import * as agentWorkflow from '../src/services/agentWorkflow.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Agent End-to-End Workflow Service Suite', () => {
  let convoId;

  beforeEach(async () => {
    await dbService.clearDb();
    agentRegistry.clearRegistry();

    // Register static agents
    agentRegistry.registerAgent('codingAgent', { description: 'Coder', modes: ['generate'] });

    // Mock Task Router intent classification
    taskRouter.mockOverrides.routeTask = async () => {
      return {
        agentName: 'codingAgent',
        mode: 'generate',
        reasoning: 'workflow test intent matching'
      };
    };

    const convo = await dbService.createConversation('Workflow Test Session');
    convoId = convo.id;
  });

  afterEach(async () => {
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    for (const key in taskRouter.mockOverrides) {
      delete taskRouter.mockOverrides[key];
    }
    for (const key in agentOrchestrator.mockOverrides) {
      delete agentOrchestrator.mockOverrides[key];
    }
    await dbService.clearDb();
    agentRegistry.clearRegistry();
  });

  describe('Workflow Execution Pipeline', () => {
    test('runWorkflow should run the pipeline end-to-end and package output successfully', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"code":"console.log(\'workflow\')"}');
        onComplete('gemini');
      };

      const result = await agentWorkflow.runWorkflow({
        prompt: 'write standard logging script',
        conversationId: convoId
      });

      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.conversationId, convoId);
      assert.strictEqual(result.agentName, 'codingAgent');
      assert.strictEqual(result.mode, 'generate');
      assert.strictEqual(result.provider, 'gemini');
      assert.strictEqual(result.messagesCount, 2);
      assert.match(result.output, /console\.log/);

      // Verify that messages were stored in conversation memory DB
      const convo = await dbService.getConversation(convoId);
      assert.strictEqual(convo.messages.length, 2);
      assert.strictEqual(convo.messages[0].role, 'user');
      assert.strictEqual(convo.messages[1].role, 'model');
    });

    test('runWorkflow should throw error if conversation session ID is not found', async () => {
      await assert.rejects(async () => {
        await agentWorkflow.runWorkflow({
          prompt: 'fails prompt',
          conversationId: 'missing-uuid-123'
        });
      }, /Conversation session not found/);
    });

    test('runWorkflow should throw error if prompt is missing', async () => {
      await assert.rejects(async () => {
        await agentWorkflow.runWorkflow({});
      }, /Prompt is required/);
    });
  });

  describe('REST Endpoints Integration', () => {
    test('POST /api/workflow/run should return compiled JSON response', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('Hello World');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/workflow/run')
        .send({
          prompt: 'test synchronous flow',
          conversationId: convoId
        })
        .expect(200);

      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.conversationId, convoId);
      assert.strictEqual(res.body.agentName, 'codingAgent');
      assert.strictEqual(res.body.provider, 'openai');
      assert.strictEqual(res.body.output, 'Hello World');
    });

    test('POST /api/workflow/run should return 400 bad request on missing prompt', async () => {
      await request(app)
        .post('/api/workflow/run')
        .send({ conversationId: convoId })
        .expect(400);
    });

    test('POST /api/workflow/stream should stream chunks via SSE and return completions', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('Chunk 1');
        onChunk(' Chunk 2');
        onComplete('anthropic');
      };

      const res = await request(app)
        .post('/api/workflow/stream')
        .send({
          prompt: 'test streaming flow',
          conversationId: convoId
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /Chunk 1/);
      assert.match(res.text, /Chunk 2/);
      assert.match(res.text, /completed/);
      assert.match(res.text, /"provider":"anthropic"/);
      assert.match(res.text, /\[DONE\]/);
    });
  });
});
