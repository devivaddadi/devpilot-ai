import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as dbService from '../src/services/dbService.js';
import * as conversationMemory from '../src/services/conversationMemory.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Conversation Memory Suite', () => {
  let convoId;

  beforeEach(async () => {
    await dbService.clearDb();
    const convo = await dbService.createConversation('Memory Test Convo');
    convoId = convo.id;
  });

  afterEach(async () => {
    // Clean all gateway overrides
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    // Clean agent overrides
    for (const key in conversationMemory.mockOverrides) {
      delete conversationMemory.mockOverrides[key];
    }
    await dbService.clearDb();
  });

  describe('Storage and Lifecycles', () => {
    test('storeMessage should add a message to database successfully', async () => {
      const msg = await conversationMemory.storeMessage(convoId, 'user', 'hello memory');
      assert.strictEqual(msg.role, 'user');
      assert.strictEqual(msg.content, 'hello memory');

      const convo = await dbService.getConversation(convoId);
      assert.strictEqual(convo.messages.length, 1);
      assert.strictEqual(convo.messages[0].content, 'hello memory');
    });

    test('getConversationContext should return summary and message history', async () => {
      await conversationMemory.storeMessage(convoId, 'user', 'first message');
      await conversationMemory.storeMessage(convoId, 'model', 'first response');

      const contextBeforeSummary = await conversationMemory.getConversationContext(convoId);
      assert.strictEqual(contextBeforeSummary.systemPromptExtension, '');
      assert.strictEqual(contextBeforeSummary.messages.length, 2);

      // Inject summary into metadata
      const convo = await dbService.getConversation(convoId);
      convo.metadata.summary = 'Previous summary facts';
      await dbService.saveDb();

      const contextAfterSummary = await conversationMemory.getConversationContext(convoId);
      assert.match(contextAfterSummary.systemPromptExtension, /Previous summary facts/);
      assert.strictEqual(contextAfterSummary.messages.length, 2);
    });

    test('clearConversationMemory should empty messages list and wipe metadata summary', async () => {
      await conversationMemory.storeMessage(convoId, 'user', 'message to delete');
      const convo = await dbService.getConversation(convoId);
      convo.metadata.summary = 'some summary';
      await dbService.saveDb();

      const cleared = await conversationMemory.clearConversationMemory(convoId);
      assert.strictEqual(cleared, true);

      const resolved = await dbService.getConversation(convoId);
      assert.strictEqual(resolved.messages.length, 0);
      assert.strictEqual(resolved.metadata.summary, undefined);
    });
  });

  describe('Long Conversation Auto-Trimming & Summarization', () => {
    test('summarizeConversation should generate summary via LLM and prune old messages', async () => {
      // Add 6 messages (3 turns)
      for (let i = 1; i <= 6; i++) {
        await dbService.addMessage(convoId, i % 2 === 0 ? 'model' : 'user', `Message index ${i}`);
      }

      // Configure limits to trigger trim manually
      conversationMemory.memoryConfig.maxMessagesBeforeSummary = 10;
      conversationMemory.memoryConfig.keepRecentMessagesCount = 2;

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('Compressed Dialogue summary.');
        onComplete('gemini');
      };

      await conversationMemory.summarizeConversation(convoId);

      const convo = await dbService.getConversation(convoId);
      assert.strictEqual(convo.metadata.summary, 'Compressed Dialogue summary.');
      // Kept only recent 2 messages
      assert.strictEqual(convo.messages.length, 2);
      assert.strictEqual(convo.messages[0].content, 'Message index 5');
      assert.strictEqual(convo.messages[1].content, 'Message index 6');
    });

    test('storeMessage should trigger auto-summarize when threshold is breached', async () => {
      // Configure low limit to test auto-trigger
      conversationMemory.memoryConfig.maxMessagesBeforeSummary = 3;
      conversationMemory.memoryConfig.keepRecentMessagesCount = 1;

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('Auto summary text.');
        onComplete('openai');
      };

      await conversationMemory.storeMessage(convoId, 'user', 'm1');
      await conversationMemory.storeMessage(convoId, 'model', 'm2');
      await conversationMemory.storeMessage(convoId, 'user', 'm3');

      let convo = await dbService.getConversation(convoId);
      assert.strictEqual(convo.messages.length, 3);
      assert.strictEqual(convo.metadata.summary, undefined);

      // 4th message breaches threshold of 3, triggers auto summary
      await conversationMemory.storeMessage(convoId, 'model', 'm4');

      convo = await dbService.getConversation(convoId);
      assert.strictEqual(convo.metadata.summary, 'Auto summary text.');
      // Preserved last 1 message
      assert.strictEqual(convo.messages.length, 1);
      assert.strictEqual(convo.messages[0].content, 'm4');
    });
  });

  describe('REST Router Integration', () => {
    test('POST /api/memory/message should store a message', async () => {
      const res = await request(app)
        .post('/api/memory/message')
        .send({
          conversationId: convoId,
          role: 'user',
          content: 'api client message'
        })
        .expect(200);

      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.message.content, 'api client message');
    });

    test('GET /api/memory/context/:conversationId should retrieve active memory context', async () => {
      await conversationMemory.storeMessage(convoId, 'user', 'api fetch prompt');

      const res = await request(app)
        .get(`/api/memory/context/${convoId}`)
        .expect(200);

      assert.strictEqual(res.body.messages.length, 1);
      assert.strictEqual(res.body.messages[0].content, 'api fetch prompt');
    });

    test('POST /api/memory/summarize/:conversationId should run manual summary', async () => {
      for (let i = 0; i < 4; i++) {
        await dbService.addMessage(convoId, 'user', `msg ${i}`);
      }

      conversationMemory.memoryConfig.keepRecentMessagesCount = 2;
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('manual output');
        onComplete('anthropic');
      };

      const res = await request(app)
        .post(`/api/memory/summarize/${convoId}`)
        .expect(200);

      assert.strictEqual(res.body.status, 'success');

      const convo = await dbService.getConversation(convoId);
      assert.strictEqual(convo.metadata.summary, 'manual output');
      assert.strictEqual(convo.messages.length, 2);
    });

    test('DELETE /api/memory/clear/:conversationId should clear memory', async () => {
      await conversationMemory.storeMessage(convoId, 'user', 'delete me');

      const res = await request(app)
        .delete(`/api/memory/clear/${convoId}`)
        .expect(200);

      assert.strictEqual(res.body.status, 'success');

      const convo = await dbService.getConversation(convoId);
      assert.strictEqual(convo.messages.length, 0);
    });
  });
});
