import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as llmGateway from '../src/services/llmGateway.js';

describe('LLM Gateway Service Suite', () => {
  const originalFetch = globalThis.fetch;
  const envBackup = {};

  before(() => {
    // Back up environment variables
    envBackup.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    envBackup.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    envBackup.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  });

  after(() => {
    // Restore environment variables
    process.env.GEMINI_API_KEY = envBackup.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = envBackup.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = envBackup.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    // Reset global fetch and keys
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // Reset rate limits cache state
    for (const key in llmGateway.rateLimits) {
      llmGateway.rateLimits[key].currentRequests = 0;
      llmGateway.rateLimits[key].resetTime = 0;
    }

    // Reset mock overrides
    for (const key in llmGateway.mockOverrides) {
      delete llmGateway.mockOverrides[key];
    }
  });

  // Helper to create mock ReadableStream responses
  function createMockStream(chunks, statusCode = 200, statusText = 'OK') {
    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      statusText,
      text: async () => JSON.stringify({ error: statusText }),
      body: {
        getReader() {
          let idx = 0;
          return {
            async read() {
              if (idx >= chunks.length) {
                return { done: true, value: undefined };
              }
              const chunk = chunks[idx++];
              const encoder = new TextEncoder();
              return { done: false, value: encoder.encode(chunk) };
            }
          };
        }
      }
    };
  }

  describe('Rate Limits Screening', () => {
    test('checkRateLimit should return false once limits are exceeded', () => {
      // Anthropic has maxRequests: 5
      for (let i = 0; i < 5; i++) {
        assert.strictEqual(llmGateway.checkRateLimit('anthropic'), true);
      }
      // 6th call should trigger rate limit block
      assert.strictEqual(llmGateway.checkRateLimit('anthropic'), false);
    });
  });

  describe('Unified Stream Parsing', () => {
    test('should parse Gemini string structures correctly', async () => {
      process.env.GEMINI_API_KEY = 'mock_gemini_key';
      
      const geminiChunks = [
        '{"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}',
        '{"candidates": [{"content": {"parts": [{"text": " World"}]}}]}'
      ];

      globalThis.fetch = async (url) => {
        assert.ok(url.includes('generativelanguage.googleapis.com'));
        return createMockStream(geminiChunks);
      };

      let output = '';
      await llmGateway.streamCompletion(
        [{ role: 'user', parts: [{ text: 'hi' }] }],
        'instruction',
        { provider: 'gemini' },
        (chunk) => { output += chunk; },
        (provider) => {
          assert.strictEqual(provider, 'gemini');
        },
        (err) => { throw err; }
      );

      assert.strictEqual(output, 'Hello World');
    });

    test('should parse OpenAI delta structure correctly', async () => {
      process.env.OPENAI_API_KEY = 'mock_openai_key';

      const openaiSSE = [
        'data: {"choices":[{"delta":{"content":"Hi OpenAI"}}]}\n',
        'data: [DONE]\n'
      ];

      globalThis.fetch = async (url) => {
        assert.ok(url.includes('api.openai.com'));
        return createMockStream(openaiSSE);
      };

      let output = '';
      await llmGateway.streamCompletion(
        [{ role: 'user', parts: [{ text: 'hi' }] }],
        '',
        { provider: 'openai' },
        (chunk) => { output += chunk; },
        (provider) => {
          assert.strictEqual(provider, 'openai');
        },
        (err) => { throw err; }
      );

      assert.strictEqual(output, 'Hi OpenAI');
    });

    test('should parse Anthropic blocks structure correctly', async () => {
      process.env.ANTHROPIC_API_KEY = 'mock_anthropic_key';

      const anthropicSSE = [
        'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hi Claude"}}\n'
      ];

      globalThis.fetch = async (url) => {
        assert.ok(url.includes('api.anthropic.com'));
        return createMockStream(anthropicSSE);
      };

      let output = '';
      await llmGateway.streamCompletion(
        [{ role: 'user', parts: [{ text: 'hi' }] }],
        '',
        { provider: 'anthropic' },
        (chunk) => { output += chunk; },
        (provider) => {
          assert.strictEqual(provider, 'anthropic');
        },
        (err) => { throw err; }
      );

      assert.strictEqual(output, 'Hi Claude');
    });
  });

  describe('Exponential Retries logic', () => {
    test('should retry on retriable failures and succeed on next attempts', async () => {
      process.env.OPENAI_API_KEY = 'mock_openai_key';
      
      let fetchAttempts = 0;
      globalThis.fetch = async (url) => {
        fetchAttempts++;
        if (fetchAttempts === 1) {
          // Return a retriable 502 status code
          return createMockStream([], 502, 'Bad Gateway');
        }
        return createMockStream(['data: {"choices":[{"delta":{"content":"success"}}]}\n']);
      };

      let output = '';
      await llmGateway.streamCompletion(
        [{ role: 'user', parts: [{ text: 'hi' }] }],
        '',
        { provider: 'openai', maxRetries: 2, retryDelay: 5 },
        (chunk) => { output += chunk; },
        (provider) => {
          assert.strictEqual(provider, 'openai');
        },
        (err) => { throw err; }
      );

      assert.strictEqual(fetchAttempts, 2);
      assert.strictEqual(output, 'success');
    });
  });

  describe('Switch Providers / Failover Actions', () => {
    test('should switch from failing provider to available fallback in queue', async () => {
      // Configure OpenAI (which will fail) and Anthropic (which will succeed)
      process.env.OPENAI_API_KEY = 'mock_openai_key';
      process.env.ANTHROPIC_API_KEY = 'mock_anthropic_key';

      globalThis.fetch = async (url) => {
        if (url.includes('openai.com')) {
          // OpenAI returns 500 Internal error
          return createMockStream([], 500, 'Internal Server Error');
        }
        if (url.includes('anthropic.com')) {
          // Anthropic succeeds
          return createMockStream(['data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Claude to the rescue"}}\n']);
        }
        return createMockStream([], 404, 'Not Found');
      };

      let output = '';
      let chosenProvider = '';

      await llmGateway.streamCompletion(
        [{ role: 'user', parts: [{ text: 'hi' }] }],
        '',
        { provider: 'openai', maxRetries: 1 }, // Start with OpenAI
        (chunk) => { output += chunk; },
        (provider) => {
          chosenProvider = provider;
        },
        (err) => { throw err; }
      );

      assert.strictEqual(chosenProvider, 'anthropic');
      assert.strictEqual(output, 'Claude to the rescue');
    });
  });

  describe('Integration REST Routes & SSE Gateway Endpoint', () => {
    test('POST /api/llm/stream should return SSE chunks successfully', async () => {
      // Leverage the mock fallback logic in the endpoint
      const res = await request(app)
        .post('/api/llm/stream')
        .send({
          contents: [{ role: 'user', parts: [{ text: 'Tell me a joke' }] }],
          provider: 'openai',
          forceMock: true
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });
  });
});
