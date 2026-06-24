import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as dbService from '../src/services/dbService.js';
import * as agentRegistry from '../src/services/agentRegistry.js';
import * as taskRouter from '../src/services/taskRouter.js';
import * as agentOrchestrator from '../src/services/agentOrchestrator.js';
import * as conversationMemory from '../src/services/conversationMemory.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Memory Integration Suite', () => {
  let convoId;

  beforeEach(async () => {
    await dbService.clearDb();
    agentRegistry.clearRegistry();

    // Register active coding agent
    agentRegistry.registerAgent('codingAgent', { description: 'Coding Agent', modes: ['generate'] });

    // Setup mock routing
    taskRouter.mockOverrides.routeTask = async () => {
      return {
        agentName: 'codingAgent',
        mode: 'generate',
        reasoning: 'integration testing'
      };
    };

    const convo = await dbService.createConversation('Integration Memory Convo');
    convoId = convo.id;
  });

  afterEach(async () => {
    // Clear mock overrides
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

  test('orchestrate should store user input and model output in conversation memory', async () => {
    gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
      onChunk('Agent completed mock code execution.');
      onComplete('gemini');
    };

    let completeTriggered = false;

    await agentOrchestrator.orchestrate(
      {
        prompt: 'generate simple calculator',
        conversationId: convoId
      },
      () => {},
      async (meta) => {
        completeTriggered = true;
      },
      (err) => { throw err; }
    );

    assert.ok(completeTriggered);

    // Retrieve conversation history
    const convo = await dbService.getConversation(convoId);
    assert.strictEqual(convo.messages.length, 2);
    assert.strictEqual(convo.messages[0].role, 'user');
    assert.strictEqual(convo.messages[0].content, 'generate simple calculator');
    assert.strictEqual(convo.messages[1].role, 'model');
    assert.strictEqual(convo.messages[1].content, 'Agent completed mock code execution.');
  });

  test('llmGateway should automatically retrieve and inject conversation history and summary', async () => {
    // Pre-populate conversation with previous turns and metadata summary
    const convo = await dbService.getConversation(convoId);
    convo.messages = [
      { role: 'user', content: 'hello agent' },
      { role: 'model', content: 'hello developer' }
    ];
    convo.metadata = { summary: 'User and agent greeted each other.' };
    await dbService.saveDb();

    let capturedContents = null;
    let capturedSystem = null;

    gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
      capturedContents = contents;
      capturedSystem = system;
      onChunk('dummy response');
      onComplete('openai');
    };

    await agentOrchestrator.orchestrate(
      {
        prompt: 'do some coding task',
        conversationId: convoId
      },
      () => {},
      () => {},
      (err) => { throw err; }
    );

    // Assert that the conversation history excluding the last message was prepended
    assert.ok(capturedContents);
    assert.strictEqual(capturedContents.length >= 2, true);
    // Index 0 should hold history turn
    assert.strictEqual(capturedContents[0].role, 'user');
    assert.strictEqual(capturedContents[0].parts[0].text, 'hello agent');
    assert.strictEqual(capturedContents[1].role, 'model');
    assert.strictEqual(capturedContents[1].parts[0].text, 'hello developer');

    // System prompt extension should contain the summary
    assert.ok(capturedSystem);
    assert.match(capturedSystem, /User and agent greeted each other\./);
  });

  test('orchestration should trigger auto-summarization on threshold breaches', async () => {
    // Set memory limits very low
    conversationMemory.memoryConfig.maxMessagesBeforeSummary = 3;
    conversationMemory.memoryConfig.keepRecentMessagesCount = 1;

    // Simulate completion returning short summary when summarizing
    gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
      onChunk('Compacted dialogue.');
      onComplete('gemini');
    };

    // Storing 4 messages directly.
    // user stores msg 1, model stores msg 2.
    // Then orchestrating another request will add user msg 3 (making it 3, trigger threshold is 3 but is checked on append),
    // and when model response completes, it appends model msg 4 (exceeding threshold of 3), which triggers auto-summarization.

    const convo = await dbService.getConversation(convoId);
    convo.messages = [
      { id: '1', role: 'user', content: 'msg 1', timestamp: new Date().toISOString() },
      { id: '2', role: 'model', content: 'msg 2', timestamp: new Date().toISOString() }
    ];
    await dbService.saveDb();

    await agentOrchestrator.orchestrate(
      {
        prompt: 'msg 3',
        conversationId: convoId
      },
      () => {},
      () => {},
      (err) => { throw err; }
    );

    const updated = await dbService.getConversation(convoId);
    // Threshold is 3. Message count is 4 (User stores msg 3, and then model completes with compacted dialogue).
    // Pruned history to keepRecentMessagesCount = 1.
    // The summary metadata contains 'Compacted dialogue.'.
    assert.strictEqual(updated.metadata.summary, 'Compacted dialogue.');
    assert.strictEqual(updated.messages.length, 1);
    assert.match(updated.messages[0].content, /Compacted dialogue\./);
  });
});
