import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import app from '../src/server.js';
import * as debuggerAgent from '../src/services/debuggerAgent.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Debugger Agent Service Suite', () => {
  const tempDocRel = 'tests/debugger_agent_temp.js';
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
    for (const key in debuggerAgent.mockOverrides) {
      delete debuggerAgent.mockOverrides[key];
    }
  });

  describe('Input Model Validation', () => {
    test('validateInput should accept valid modes and prompts', () => {
      const payload = { mode: 'detect_bugs', prompt: 'syntax error in function' };
      const validated = debuggerAgent.validateInput(payload);
      assert.strictEqual(validated.mode, 'detect_bugs');
      assert.strictEqual(validated.prompt, 'syntax error in function');
    });

    test('validateInput should throw errors on invalid modes or missing prompt', () => {
      assert.throws(() => {
        debuggerAgent.validateInput({ mode: 'invalid_mode', prompt: 'test' });
      }, /Invalid or missing mode/);

      assert.throws(() => {
        debuggerAgent.validateInput({ mode: 'detect_bugs' });
      }, /Prompt\/Error details are required/);
    });

    test('validateInput should block directory traversal path escapes', () => {
      assert.throws(() => {
        debuggerAgent.validateInput({
          mode: 'suggest_fixes',
          prompt: 'patch it',
          filePath: '../../escape_sandbox.md'
        });
      }, /Security Error: File path must reside within the workspace/);
    });
  });

  describe('Tool Interfaces & Sandboxing', () => {
    test('readCodeFile should read files successfully inside sandbox', async () => {
      const content = 'const value = 999;';
      await fs.writeFile(tempDocAbs, content, 'utf8');

      const readContent = await debuggerAgent.tools.readCodeFile(tempDocRel);
      assert.strictEqual(readContent, content);
    });

    test('tools should reject out-of-sandbox file operations', async () => {
      const outPath = '../../malicious.md';
      
      await assert.rejects(async () => {
        await debuggerAgent.tools.readCodeFile(outPath);
      }, /Access denied/);
    });
  });

  describe('Prompt Templates Construction', () => {
    test('should construct valid JSON templates including prompt tags', () => {
      const template = debuggerAgent.promptTemplates.detect_bugs('fix index check', 'const a = 1;', 'javascript');
      assert.match(template, /"analysis":/);
      assert.match(template, /"suggestedFix":/);
      assert.match(template, /fix index check/);
    });
  });

  describe('Agent Running Pipeline', () => {
    test('runDebuggerAgent should fetch file and invoke gateway streaming', async () => {
      const baseContent = 'function crash() { throw new Error(); }';
      await fs.writeFile(tempDocAbs, baseContent, 'utf8');

      let chunkResponse = '';
      let completedProvider = '';

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /exception/); // Mode matches exception prompt template
        assert.match(contents[0].parts[0].text, /function crash/); // Content is present
        onChunk('{"analysis":"crash explain"}');
        onComplete('gemini');
      };

      await debuggerAgent.runDebuggerAgent(
        {
          mode: 'explain_exception',
          prompt: 'uncaught runtime exception',
          filePath: tempDocRel
        },
        (chunk) => { chunkResponse += chunk; },
        (provider) => { completedProvider = provider; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"analysis":"crash explain"}');
      assert.strictEqual(completedProvider, 'gemini');
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/agent/debugger/run should stream chunks successfully via SSE', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"analysis":"code smell analysis"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/agent/debugger/run')
        .send({
          mode: 'detect_code_smells',
          prompt: 'check for long methods',
          existingContent: 'function long() {}'
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /{"chunk":"{\\"analysis\\":\\"code smell analysis\\"}"}/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });
  });
});
