import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import app from '../src/server.js';
import * as codingAgent from '../src/services/codingAgent.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Coding Agent Service Suite', () => {
  const testFileRel = 'tests/coding_agent_temp.js';
  const testFileAbs = path.resolve(testFileRel);

  afterEach(async () => {
    // Delete any created temp test files
    if (existsSync(testFileAbs)) {
      await fs.rm(testFileAbs, { force: true });
    }
    // Clean all gateway mock overrides
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    // Clean all agent mock overrides
    for (const key in codingAgent.mockOverrides) {
      delete codingAgent.mockOverrides[key];
    }
  });

  describe('Input Model Validation', () => {
    test('validateInput should accept valid modes and prompts', () => {
      const payload = { mode: 'generate', prompt: 'write function' };
      const validated = codingAgent.validateInput(payload);
      assert.strictEqual(validated.mode, 'generate');
      assert.strictEqual(validated.prompt, 'write function');
    });

    test('validateInput should throw errors on invalid modes or missing prompt', () => {
      assert.throws(() => {
        codingAgent.validateInput({ mode: 'invalid_mode', prompt: 'test' });
      }, /Invalid or missing mode/);

      assert.throws(() => {
        codingAgent.validateInput({ mode: 'generate' });
      }, /Prompt is required/);
    });

    test('validateInput should block path traversal attacks', () => {
      assert.throws(() => {
        codingAgent.validateInput({
          mode: 'refactor',
          prompt: 'optimize',
          filePath: '../../outside_workspace.txt'
        });
      }, /Security Error: File path must reside within the workspace/);
    });
  });

  describe('Tool Interfaces & Workspace Sandboxing', () => {
    test('writeCodeFile and readCodeFile should modify and fetch files successfully inside workspace', async () => {
      const content = 'const code = 100;';
      const writeSuccess = await codingAgent.tools.writeCodeFile(testFileRel, content);
      assert.strictEqual(writeSuccess, true);

      const readContent = await codingAgent.tools.readCodeFile(testFileRel);
      assert.strictEqual(readContent, content);
    });

    test('tools should reject out-of-sandbox file operations', async () => {
      const outPath = '../../malicious.js';
      
      await assert.rejects(async () => {
        await codingAgent.tools.readCodeFile(outPath);
      }, /Access denied/);

      await assert.rejects(async () => {
        await codingAgent.tools.writeCodeFile(outPath, 'content');
      }, /Access denied/);
    });
  });

  describe('Prompt Templates Construction', () => {
    test('should construct valid JSON templates including prompt tags', () => {
      const template = codingAgent.promptTemplates.generate('create add function', 'javascript');
      assert.match(template, /"code":/);
      assert.match(template, /"explanation":/);
      assert.match(template, /create add function/);
    });
  });

  describe('Agent Running Pipeline', () => {
    test('runCodingAgent should parse workspace file and invoke gateway streaming', async () => {
      // Write target file content
      const baseContent = 'function add(a,b) { return a+b; }';
      await codingAgent.tools.writeCodeFile(testFileRel, baseContent);

      let chunkResponse = '';
      let completedProvider = '';

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /refactor/); // Mode matches refactor template
        assert.match(contents[0].parts[0].text, /function add/); // Injected content matches
        onChunk('{"code":"res"}');
        onComplete('gemini');
      };

      await codingAgent.runCodingAgent(
        {
          mode: 'refactor',
          prompt: 'make arrow function',
          filePath: testFileRel
        },
        (chunk) => { chunkResponse += chunk; },
        (provider) => { completedProvider = provider; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"code":"res"}');
      assert.strictEqual(completedProvider, 'gemini');
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/agent/coding/run should stream chunks successfully via SSE', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"code":"final"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/agent/coding/run')
        .send({
          mode: 'explain',
          prompt: 'how does this work',
          existingContent: 'const a = 1;'
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /{"chunk":"{\\"code\\":\\"final\\"}"}/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });
  });
});
