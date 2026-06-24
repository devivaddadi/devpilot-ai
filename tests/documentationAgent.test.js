import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import app from '../src/server.js';
import * as documentationAgent from '../src/services/documentationAgent.js';
import * as analyzerService from '../src/services/analyzerService.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Documentation Agent Service Suite', () => {
  const tempDocRel = 'tests/documentation_agent_temp.md';
  const tempDocAbs = path.resolve(tempDocRel);

  afterEach(async () => {
    // Delete temp test files
    if (existsSync(tempDocAbs)) {
      await fs.rm(tempDocAbs, { force: true });
    }
    // Clean mock overrides
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    for (const key in documentationAgent.mockOverrides) {
      delete documentationAgent.mockOverrides[key];
    }
    // Clean cache file if created during tests
    const testCachePath = path.resolve('.devpilot-cache/mock_doc_repo.json');
    if (existsSync(testCachePath)) {
      await fs.rm(testCachePath, { force: true });
    }
  });

  describe('Input Model Validation', () => {
    test('validateInput should accept valid modes and prompts', () => {
      const payload = { mode: 'readme', prompt: 'generate project readme' };
      const validated = documentationAgent.validateInput(payload);
      assert.strictEqual(validated.mode, 'readme');
      assert.strictEqual(validated.prompt, 'generate project readme');
    });

    test('validateInput should throw errors on invalid modes or missing prompt', () => {
      assert.throws(() => {
        documentationAgent.validateInput({ mode: 'invalid_mode', prompt: 'test' });
      }, /Invalid or missing mode/);

      assert.throws(() => {
        documentationAgent.validateInput({ mode: 'readme' });
      }, /Prompt is required/);
    });

    test('validateInput should block directory traversal path escapes', () => {
      assert.throws(() => {
        documentationAgent.validateInput({
          mode: 'api',
          prompt: 'doc',
          filePath: '../../escape_sandbox.md'
        });
      }, /Security Error: File path must reside within the workspace/);
    });
  });

  describe('Tool Interfaces & Repository Registry Summarization', () => {
    test('writeDocFile and readCodeFile should modify and read files successfully inside sandbox', async () => {
      const content = '# Project Documentation';
      const writeSuccess = await documentationAgent.tools.writeDocFile(tempDocRel, content);
      assert.strictEqual(writeSuccess, true);

      const readContent = await documentationAgent.tools.readCodeFile(tempDocRel);
      assert.strictEqual(readContent, content);
    });

    test('tools should reject out-of-sandbox file operations', async () => {
      const outPath = '../../malicious.md';
      
      await assert.rejects(async () => {
        await documentationAgent.tools.readCodeFile(outPath);
      }, /Access denied/);

      await assert.rejects(async () => {
        await documentationAgent.tools.writeDocFile(outPath, 'content');
      }, /Access denied/);
    });

    test('getIndexedRepositorySummary should fetch formatted catalog summary', async () => {
      // Mock save cache data
      await analyzerService.saveCache('mock_doc_repo', {
        repoName: 'mock_doc_repo',
        files: {
          'src/index.js': { path: 'src/index.js', size: 500, chunksCount: 2 }
        }
      });

      const summary = await documentationAgent.tools.getIndexedRepositorySummary('mock_doc_repo');
      assert.ok(summary);
      assert.match(summary, /src\/index.js/);
      assert.match(summary, /"size": 500/);
    });
  });

  describe('Prompt Templates Construction', () => {
    test('should construct valid JSON templates including prompt tags', () => {
      const template = documentationAgent.promptTemplates.readme('build readme', 'const a = 1;', 'javascript');
      assert.match(template, /"content":/);
      assert.match(template, /"summary":/);
      assert.match(template, /build readme/);
    });
  });

  describe('Agent Running Pipeline', () => {
    test('runDocumentationAgent should load cache metadata and invoke gateway streaming', async () => {
      await analyzerService.saveCache('mock_doc_repo', {
        repoName: 'mock_doc_repo',
        files: {
          'src/math.js': { path: 'src/math.js', size: 100, chunksCount: 1 }
        }
      });

      let chunkResponse = '';
      let completedProvider = '';

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /summarize/); // Mode matches summarization prompt template
        assert.match(contents[0].parts[0].text, /src\/math.js/); // Registry context is present
        onChunk('{"content":"summary"}');
        onComplete('gemini');
      };

      await documentationAgent.runDocumentationAgent(
        {
          mode: 'summarize_repo',
          prompt: 'describe my project files',
          repoName: 'mock_doc_repo'
        },
        (chunk) => { chunkResponse += chunk; },
        (provider) => { completedProvider = provider; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"content":"summary"}');
      assert.strictEqual(completedProvider, 'gemini');
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/agent/documentation/run should stream chunks successfully via SSE', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"content":"doc-markdown"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/agent/documentation/run')
        .send({
          mode: 'guide',
          prompt: 'build dev guide',
          existingContent: '// route specs'
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /{"chunk":"{\\"content\\":\\"doc-markdown\\"}"}/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });
  });
});
