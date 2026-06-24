import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as dbService from '../src/services/dbService.js';
import * as chatService from '../src/services/chatService.js';

describe('AI Chat Service Suite', () => {

  before(async () => {
    // Clear database before tests run
    await dbService.clearDb();
  });

  after(async () => {
    // Clear database after tests complete
    await dbService.clearDb();
  });

  afterEach(async () => {
    // Clean database between tests to ensure isolation
    await dbService.clearDb();
    // Reset service mock overrides
    for (const key in chatService.mockOverrides) {
      delete chatService.mockOverrides[key];
    }
  });

  describe('Database (dbService) Unit Operations', () => {
    test('should create, get, list and delete conversations', async () => {
      const convo = await dbService.createConversation('Test Convo', { repo: 'devpilot' });
      assert.strictEqual(convo.title, 'Test Convo');
      assert.strictEqual(convo.metadata.repo, 'devpilot');
      assert.ok(convo.id);
      
      const retrieved = await dbService.getConversation(convo.id);
      assert.strictEqual(retrieved.title, 'Test Convo');

      const list = await dbService.listConversations();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, convo.id);

      const deleted = await dbService.deleteConversation(convo.id);
      assert.strictEqual(deleted, true);

      const retrievedAfterDelete = await dbService.getConversation(convo.id);
      assert.strictEqual(retrievedAfterDelete, null);
    });

    test('should manage conversation message logs correctly', async () => {
      const convo = await dbService.createConversation('Test Logs');
      
      const msg1 = await dbService.addMessage(convo.id, 'user', 'Hello AI');
      assert.strictEqual(msg1.role, 'user');
      assert.strictEqual(msg1.content, 'Hello AI');

      const msg2 = await dbService.addMessage(convo.id, 'model', 'Hello Human');
      assert.strictEqual(msg2.role, 'model');

      const updated = await dbService.getConversation(convo.id);
      assert.strictEqual(updated.messages.length, 2);
      assert.strictEqual(updated.messages[0].content, 'Hello AI');
      assert.strictEqual(updated.messages[1].content, 'Hello Human');
    });

    test('should handle user fact memory storage operations', async () => {
      await dbService.setMemory('user_name', 'Bob');
      await dbService.setMemory('project_type', 'NodeJS');

      const name = await dbService.getMemory('user_name');
      assert.strictEqual(name, 'Bob');

      const list = await dbService.listMemory();
      assert.strictEqual(list.user_name.value, 'Bob');
      assert.strictEqual(list.project_type.value, 'NodeJS');

      const deleted = await dbService.deleteMemory('user_name');
      assert.strictEqual(deleted, true);

      const nameAfterDelete = await dbService.getMemory('user_name');
      assert.strictEqual(nameAfterDelete, null);
    });
  });

  describe('Fact Memory Extraction Rules', () => {
    test('should detect and save facts from user inputs', async () => {
      await chatService.extractAndSaveMemories('Remember that my favorite framework is Next.js');
      const framework = await dbService.getMemory('my favorite framework');
      assert.strictEqual(framework, 'Next.js');

      await chatService.extractAndSaveMemories('My user_alias is Octocat');
      const alias = await dbService.getMemory('user_alias');
      assert.strictEqual(alias, 'Octocat');

      await chatService.extractAndSaveMemories('I use Rust');
      const language = await dbService.getMemory('Preferred Language/Tech');
      assert.strictEqual(language, 'Rust');
    });
  });

  describe('Chat response streaming', () => {
    test('streamChatResponse should yield chunks and invoke complete on mock model runs', async () => {
      const convo = await dbService.createConversation('Test Stream');
      await dbService.addMessage(convo.id, 'user', 'hello');

      let chunks = '';
      let isCompleted = false;

      await chatService.streamChatResponse(
        convo.id,
        'hello',
        {},
        (chunk) => {
          chunks += chunk;
        },
        () => {
          isCompleted = true;
        },
        (err) => {
          throw err;
        }
      );

      // Give mock typing generator time to stream words
      await new Promise(resolve => setTimeout(resolve, 500));

      assert.ok(chunks.length > 0);
      assert.strictEqual(isCompleted, true);
    });
  });

  describe('Integration REST Routes & SSE Messaging', () => {
    test('POST /api/chat/conversations should initialize new chat room', async () => {
      const res = await request(app)
        .post('/api/chat/conversations')
        .send({ title: 'Integration Test Convo', metadata: { system: 'ubuntu' } })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.conversation.title, 'Integration Test Convo');
      assert.strictEqual(res.body.conversation.metadata.system, 'ubuntu');
    });

    test('GET /api/chat/conversations should retrieve list of chat rooms', async () => {
      await dbService.createConversation('Convo 1');
      await dbService.createConversation('Convo 2');

      const res = await request(app)
        .get('/api/chat/conversations')
        .expect(200);

      assert.strictEqual(res.body.length, 2);
      assert.ok(res.body.some(c => c.title === 'Convo 1'));
    });

    test('POST /api/chat/message should process prompts and stream back SSE chunks', async () => {
      const convo = await dbService.createConversation('SSE Chat room');

      const res = await request(app)
        .post('/api/chat/message')
        .send({ conversationId: convo.id, message: 'I prefer Python coding functions.' })
        .expect(200);

      // Verify server responded with text/event-stream headers
      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /\[DONE\]/);

      // Verify that favorite language was auto-saved as memory fact
      const favLang = await dbService.getMemory('Preferred Language/Tech');
      assert.strictEqual(favLang, 'Python');

      // Verify that the conversation record now holds the saved messages
      const updatedConvo = await dbService.getConversation(convo.id);
      assert.strictEqual(updatedConvo.messages.length, 2);
      assert.strictEqual(updatedConvo.messages[0].role, 'user');
      assert.strictEqual(updatedConvo.messages[1].role, 'model');
    });

    test('GET, POST and DELETE /api/chat/memory endpoints should edit remembered profile facts', async () => {
      // POST memory
      await request(app)
        .post('/api/chat/memory')
        .send({ key: 'editor', value: 'VSCode' })
        .expect(200);

      // GET memory list
      let memoryRes = await request(app)
        .get('/api/chat/memory')
        .expect(200);
      assert.strictEqual(memoryRes.body.editor.value, 'VSCode');

      // DELETE memory key
      await request(app)
        .delete('/api/chat/memory/editor')
        .expect(200);

      // GET memory list again to verify empty state
      memoryRes = await request(app)
        .get('/api/chat/memory')
        .expect(200);
      assert.strictEqual(memoryRes.body.editor, undefined);
    });
  });
});
