import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../src/server.js';
import {
  mockOverrides,
  chunkFileContent,
  extractMetadata,
  generateEmbeddings,
  calculateCosineSimilarity
} from '../src/services/analyzerService.js';

describe('Repository Analyzer Suite', () => {
  const mockRepoPath = path.resolve('tests/mock_repo_test');
  const mockRepoName = 'mock_repo_test';

  before(async () => {
    // Create a mock repository on disk for traversal testing
    if (!existsSync(mockRepoPath)) {
      await fs.mkdir(mockRepoPath, { recursive: true });
    }
    
    // Create folders that should be indexed
    await fs.mkdir(path.join(mockRepoPath, 'src'), { recursive: true });
    await fs.mkdir(path.join(mockRepoPath, 'node_modules'), { recursive: true }); // Should be ignored
    await fs.mkdir(path.join(mockRepoPath, '.git'), { recursive: true }); // Should be ignored

    // Create files
    await fs.writeFile(
      path.join(mockRepoPath, 'src/math.js'),
      `// Helper Math functions\nclass MathCalc {\n  add(a, b) {\n    return a + b;\n  }\n}\nfunction sumAll(arr) {\n  return arr.reduce((x, y) => x + y, 0);\n}\nexport default MathCalc;`,
      'utf8'
    );
    await fs.writeFile(
      path.join(mockRepoPath, 'README.md'),
      `# Mock Repository\nThis is a mock repository for local testing.`,
      'utf8'
    );
    await fs.writeFile(
      path.join(mockRepoPath, 'node_modules/library.js'),
      `export function ignored() { return true; }`,
      'utf8'
    );
    await fs.writeFile(
      path.join(mockRepoPath, 'binary.png'),
      `mockbinarycontent`,
      'utf8' // PNG extension should be ignored by ext checks
    );
  });

  after(async () => {
    // Clean up mock repository and cache indices from disk
    if (existsSync(mockRepoPath)) {
      await fs.rm(mockRepoPath, { recursive: true, force: true });
    }
    const cacheIndexFile = path.resolve(`.devpilot-cache/${mockRepoName}.json`);
    if (existsSync(cacheIndexFile)) {
      await fs.rm(cacheIndexFile, { force: true });
    }
  });

  afterEach(() => {
    // Clear all analyzer service mocks
    for (const key in mockOverrides) {
      delete mockOverrides[key];
    }
  });

  describe('Unit Chunker Algorithms', () => {
    test('chunkFileContent should partition content into lines with correct overlaps', () => {
      const code = "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7";
      // Tiny chunk size of 15 chars and 5 overlap to guarantee multiple chunks
      const chunks = chunkFileContent('test.js', code, 15, 5);
      
      assert.ok(chunks.length > 1);
      assert.strictEqual(chunks[0].startLine, 1);
      assert.ok(chunks[0].endLine >= 1);
      assert.match(chunks[0].content, /line/);
    });

    test('extractMetadata should detect classes, functions and language properties', () => {
      const code = `class AuthController {\n  login(req) {\n    return true;\n  }\n}\nfunction verifyToken(t) {\n  return jwt.verify(t);\n}`;
      const meta = extractMetadata('src/auth.js', code);
      
      assert.strictEqual(meta.language, 'javascript');
      assert.deepStrictEqual(meta.classes, ['AuthController']);
      assert.deepStrictEqual(meta.functions, ['login', 'verifyToken']);
    });
  });

  describe('Embeddings & Semantic Search Vector Equations', () => {
    test('generateEmbeddings should return a normalized float list', async () => {
      const texts = ['hello world', 'devpilot-ai copilot'];
      const embeddings = await generateEmbeddings(texts);
      
      assert.strictEqual(embeddings.length, 2);
      assert.strictEqual(embeddings[0].length, 1536);
      
      // Verify vector magnitude is normalized (approx 1.0)
      const sumSq = embeddings[0].reduce((sum, val) => sum + val * val, 0);
      assert.ok(Math.abs(sumSq - 1.0) < 0.01);
    });

    test('calculateCosineSimilarity should calculate vector relationships correctly', () => {
      const vecA = [1, 0, 0];
      const vecB = [1, 0, 0];
      const vecC = [0, 1, 0]; // Orthogonal vector

      assert.strictEqual(Math.round(calculateCosineSimilarity(vecA, vecB)), 1); // Perfect match
      assert.strictEqual(calculateCosineSimilarity(vecA, vecC), 0); // No similarity
    });
  });

  describe('Integration REST Routes & Index Caching', () => {
    test('POST /api/analyzer/clone should mock cloning and return repo identifiers', async () => {
      mockOverrides.cloneRepository = async (gitUrl) => {
        return { repoPath: mockRepoPath, repoName: mockRepoName };
      };

      const response = await request(app)
        .post('/api/analyzer/clone')
        .send({ gitUrl: 'https://github.com/octocat/Spoon-Knife.git' })
        .expect(200);

      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.repoName, mockRepoName);
      assert.strictEqual(response.body.repoPath, mockRepoPath);
    });

    test('POST /api/analyzer/analyze should start background scanner and return status 202', async () => {
      const response = await request(app)
        .post('/api/analyzer/analyze')
        .send({ repoName: mockRepoName, repoPath: mockRepoPath })
        .expect(202);

      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.status.status, 'scanning');
    });

    test('GET /api/analyzer/status/:repoName should return progress and status states', async () => {
      // Small sleep to ensure analysis finishes scanning & embedding background threads
      await new Promise(resolve => setTimeout(resolve, 300));

      const response = await request(app)
        .get(`/api/analyzer/status/${mockRepoName}`)
        .expect(200);

      assert.ok(['scanning', 'analyzing', 'completed'].includes(response.body.status));
      assert.ok(typeof response.body.progress === 'number');
    });

    test('GET /api/analyzer/files/:repoName should list indexed codebase files excluding ignored ones', async () => {
      const response = await request(app)
        .get(`/api/analyzer/files/${mockRepoName}`)
        .expect(200);

      assert.ok(response.body.length >= 2);
      
      const paths = response.body.map(f => f.path);
      assert.ok(paths.includes('src/math.js'));
      assert.ok(paths.includes('README.md'));
      
      // Ensure node_modules and binary are excluded
      assert.ok(!paths.includes('node_modules/library.js'));
      assert.ok(!paths.includes('binary.png'));
    });

    test('GET /api/analyzer/files/:repoName/chunks should return chunks for file', async () => {
      const response = await request(app)
        .get(`/api/analyzer/files/${mockRepoName}/chunks`)
        .query({ path: 'src/math.js' })
        .expect(200);

      assert.strictEqual(response.body.path, 'src/math.js');
      assert.ok(response.body.chunks.length > 0);
      assert.strictEqual(response.body.chunks[0].metadata.language, 'javascript');
    });

    test('POST /api/analyzer/search should search query and calculate matches', async () => {
      const response = await request(app)
        .post('/api/analyzer/search')
        .send({ repoName: mockRepoName, queryText: 'MathCalc class', limit: 2 })
        .expect(200);

      assert.ok(response.body.length > 0);
      assert.strictEqual(response.body[0].file, 'src/math.js');
      assert.ok(response.body[0].similarity > 0);
    });
  });
});
