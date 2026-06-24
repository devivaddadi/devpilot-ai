import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import app from '../src/server.js';
import * as sharedToolLayer from '../src/services/sharedToolLayer.js';

describe('Shared Tool Layer Service Suite', () => {
  const testFilePath = 'src/services/temp_test_tool_layer.txt';

  afterEach(async () => {
    // Cleanup any temporary files created
    try {
      const absPath = sharedToolLayer.resolveSafePath(testFilePath);
      if (existsSync(absPath)) {
        await fs.unlink(absPath);
      }
    } catch {}
    sharedToolLayer.clearTools();
  });

  describe('Sandbox Path Validation', () => {
    test('resolveSafePath should resolve relative paths inside workspace', () => {
      const resolved = sharedToolLayer.resolveSafePath('src/server.js');
      assert.ok(resolved.includes('devpilot-ai'));
      assert.ok(resolved.endsWith('src' + path.sep + 'server.js'));
    });

    test('resolveSafePath should reject paths attempting to escape workspace', () => {
      assert.throws(() => {
        sharedToolLayer.resolveSafePath('../outside.txt');
      }, /Security Error: Access denied/);

      assert.throws(() => {
        sharedToolLayer.resolveSafePath('../../etc/passwd');
      }, /Security Error: Access denied/);
    });
  });

  describe('Secure File Operations', () => {
    test('writeFile and readFile should perform safe file operations inside workspace', async () => {
      const writeResult = await sharedToolLayer.fileOps.writeFile(testFilePath, 'test content');
      assert.strictEqual(writeResult, true);

      const content = await sharedToolLayer.fileOps.readFile(testFilePath);
      assert.strictEqual(content, 'test content');
    });

    test('exists should return correct status for file existence', async () => {
      assert.strictEqual(sharedToolLayer.fileOps.exists(testFilePath), false);

      await sharedToolLayer.fileOps.writeFile(testFilePath, 'temp');
      assert.strictEqual(sharedToolLayer.fileOps.exists(testFilePath), true);
    });

    test('file operations should reject out of bounds paths', async () => {
      await assert.rejects(async () => {
        await sharedToolLayer.fileOps.readFile('../escaped.js');
      }, /Security Error: Access denied/);

      await assert.rejects(async () => {
        await sharedToolLayer.fileOps.writeFile('../escaped.js', 'malicious code');
      }, /Security Error: Access denied/);

      assert.strictEqual(sharedToolLayer.fileOps.exists('../escaped.js'), false);
    });
  });

  describe('Code Parsing Utilities', () => {
    test('extractCodeBlocks should extract multiple fenced code blocks and languages', () => {
      const md = `
# Markdown Title
Some text.
\`\`\`javascript
const x = 10;
\`\`\`
More text.
\`\`\`python
def test():
    return True
\`\`\`
      `;
      const blocks = sharedToolLayer.parser.extractCodeBlocks(md);
      assert.strictEqual(blocks.length, 2);
      assert.strictEqual(blocks[0].language, 'javascript');
      assert.strictEqual(blocks[0].content.trim(), 'const x = 10;');
      assert.strictEqual(blocks[1].language, 'python');
      assert.strictEqual(blocks[1].content.trim(), 'def test():\n    return True');
    });

    test('extractCodeBlocks should return text for unknown or unlabelled language code blocks', () => {
      const md = `
\`\`\`
unlabelled block
\`\`\`
      `;
      const blocks = sharedToolLayer.parser.extractCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].language, 'text');
      assert.strictEqual(blocks[0].content.trim(), 'unlabelled block');
    });

    test('detectLanguage should return correct language string based on extensions', () => {
      assert.strictEqual(sharedToolLayer.parser.detectLanguage('file.js'), 'javascript');
      assert.strictEqual(sharedToolLayer.parser.detectLanguage('file.py'), 'python');
      assert.strictEqual(sharedToolLayer.parser.detectLanguage('file.json'), 'json');
      assert.strictEqual(sharedToolLayer.parser.detectLanguage('file.unknown'), 'text');
    });
  });

  describe('Markdown Generation Utilities', () => {
    test('generateTable should format arrays into Markdown table syntax', () => {
      const headers = ['Name', 'Role'];
      const rows = [
        ['Alice', 'Developer'],
        ['Bob', 'Designer']
      ];
      const table = sharedToolLayer.markdown.generateTable(headers, rows);
      assert.match(table, /\| Name \| Role \|/);
      assert.match(table, /\| --- \| --- \|/);
      assert.match(table, /\| Alice \| Developer \|/);
    });

    test('generateAlert should produce GitHub alert syntax blocks', () => {
      const alert = sharedToolLayer.markdown.generateAlert('WARNING', 'This is a warning');
      assert.match(alert, /> \[!WARNING\]/);
      assert.match(alert, /> This is a warning/);

      const alertFallback = sharedToolLayer.markdown.generateAlert('INVALID', 'Fallback');
      assert.match(alertFallback, /> \[!NOTE\]/);
    });

    test('generateCollapsible should generate details markup', () => {
      const collapsible = sharedToolLayer.markdown.generateCollapsible('Details here', 'Secret content');
      assert.match(collapsible, /<details>/);
      assert.match(collapsible, /<summary>Details here<\/summary>/);
      assert.match(collapsible, /Secret content/);
    });
  });

  describe('Extensible Custom Tools Registry', () => {
    test('registerTool should store function and getTool should retrieve it', () => {
      const mockTool = (x) => x * 2;
      sharedToolLayer.registerTool('double', mockTool);

      const retrieved = sharedToolLayer.getTool('double');
      assert.strictEqual(retrieved, mockTool);
      assert.strictEqual(retrieved(5), 10);
    });

    test('registerTool should throw error if tool function is invalid', () => {
      assert.throws(() => {
        sharedToolLayer.registerTool('invalid', 'not a function');
      }, /Tool must be a valid executable function/);
    });
  });

  describe('REST Endpoint Router Integration', () => {
    test('POST /api/shared-tools/parse-code should parse markdown input', async () => {
      const res = await request(app)
        .post('/api/shared-tools/parse-code')
        .send({
          markdown: '\`\`\`javascript\nconst a = 1;\n\`\`\`'
        })
        .expect(200);

      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.blocks.length, 1);
      assert.strictEqual(res.body.blocks[0].language, 'javascript');
    });

    test('POST /api/shared-tools/parse-code should return 400 if markdown is missing', async () => {
      await request(app)
        .post('/api/shared-tools/parse-code')
        .send({})
        .expect(400);
    });

    test('POST /api/shared-tools/format-markdown should render format types', async () => {
      // Alert test
      const resAlert = await request(app)
        .post('/api/shared-tools/format-markdown')
        .send({
          formatType: 'alert',
          type: 'TIP',
          message: 'My Tips'
        })
        .expect(200);

      assert.strictEqual(resAlert.body.status, 'success');
      assert.match(resAlert.body.formatted, /> \[!TIP\]/);

      // Table test
      const resTable = await request(app)
        .post('/api/shared-tools/format-markdown')
        .send({
          formatType: 'table',
          headers: ['A', 'B'],
          rows: [['1', '2']]
        })
        .expect(200);

      assert.strictEqual(resTable.body.status, 'success');
      assert.match(resTable.body.formatted, /\| A \| B \|/);

      // Collapsible test
      const resCollapsible = await request(app)
        .post('/api/shared-tools/format-markdown')
        .send({
          formatType: 'collapsible',
          summary: 'Logs',
          content: 'Error trace'
        })
        .expect(200);

      assert.strictEqual(resCollapsible.body.status, 'success');
      assert.match(resCollapsible.body.formatted, /<details>/);
    });

    test('POST /api/shared-tools/format-markdown should return 400 on missing or invalid params', async () => {
      await request(app)
        .post('/api/shared-tools/format-markdown')
        .send({})
        .expect(400);

      await request(app)
        .post('/api/shared-tools/format-markdown')
        .send({ formatType: 'alert' }) // Missing message
        .expect(400);
    });
  });
});
