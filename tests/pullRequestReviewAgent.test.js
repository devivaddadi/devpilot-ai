import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as pullRequestReviewAgent from '../src/services/pullRequestReviewAgent.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Pull Request Review Agent Service Suite', () => {
  afterEach(() => {
    // Clean all gateway mock overrides
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    // Clean all agent mock overrides
    for (const key in pullRequestReviewAgent.mockOverrides) {
      delete pullRequestReviewAgent.mockOverrides[key];
    }
  });

  describe('Input Model Validation', () => {
    test('validateInput should accept valid modes and prompts', () => {
      const payload = { mode: 'review_changed_files', prompt: 'review code changes' };
      const validated = pullRequestReviewAgent.validateInput(payload);
      assert.strictEqual(validated.mode, 'review_changed_files');
      assert.strictEqual(validated.prompt, 'review code changes');
    });

    test('validateInput should throw errors on invalid modes or missing prompt', () => {
      assert.throws(() => {
        pullRequestReviewAgent.validateInput({ mode: 'invalid_mode', prompt: 'test' });
      }, /Invalid or missing mode/);

      assert.throws(() => {
        pullRequestReviewAgent.validateInput({ mode: 'review_changed_files' });
      }, /Prompt is required/);
    });
  });

  describe('Workspace Context Tools', () => {
    test('getLocalWorkspaceDiff should return git diff content string', async () => {
      const diff = await pullRequestReviewAgent.tools.getLocalWorkspaceDiff();
      assert.strictEqual(typeof diff, 'string');
    });
  });

  describe('Prompt Templates Construction', () => {
    const standardModes = [
      'review_changed_files',
      'detect_bugs',
      'suggest_improvements',
      'review_coding_standards'
    ];

    standardModes.forEach((mode) => {
      test(`should construct valid templates for mode: ${mode}`, () => {
        const template = pullRequestReviewAgent.promptTemplates[mode]('test prompt', 'diff info');
        assert.match(template, /diff info/);
        assert.match(template, /test prompt/);
        assert.match(template, /"reviews":/);
        assert.match(template, /"summary":/);
      });
    });

    test('should construct valid template for explain_review_comments', () => {
      const template = pullRequestReviewAgent.promptTemplates.explain_review_comments('test prompt', 'nice work', 'diff info');
      assert.match(template, /nice work/);
      assert.match(template, /diff info/);
      assert.match(template, /"explanation":/);
    });

    test('should construct valid template for produce_review_summary', () => {
      const template = pullRequestReviewAgent.promptTemplates.produce_review_summary('test prompt', 'diff info', 'reviews list');
      assert.match(template, /reviews list/);
      assert.match(template, /diff info/);
      assert.match(template, /"decision":/);
    });
  });

  describe('Agent Running Pipeline', () => {
    test('runPullRequestReviewAgent should invoke gateway streaming', async () => {
      let chunkResponse = '';
      let completedProvider = '';

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /custom diff content/);
        onChunk('{"reviews":[],"summary":"looks good"}');
        onComplete('gemini');
      };

      await pullRequestReviewAgent.runPullRequestReviewAgent(
        {
          mode: 'review_changed_files',
          prompt: 'review this please',
          diffContent: 'custom diff content'
        },
        (chunk) => { chunkResponse += chunk; },
        (provider) => { completedProvider = provider; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"reviews":[],"summary":"looks good"}');
      assert.strictEqual(completedProvider, 'gemini');
    });

    test('runPullRequestReviewAgent should handle streaming failures gracefully', async () => {
      let errorTriggered = false;

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onError(new Error('Gateway timeout'));
      };

      await pullRequestReviewAgent.runPullRequestReviewAgent(
        {
          mode: 'review_changed_files',
          prompt: 'review this please',
          diffContent: 'custom diff content'
        },
        () => {},
        () => {},
        (err) => {
          assert.strictEqual(err.message, 'Gateway timeout');
          errorTriggered = true;
        }
      );

      assert.ok(errorTriggered);
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/agent/pull-request-review/run should stream chunks successfully via SSE', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"reviews":[],"summary":"complete"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/agent/pull-request-review/run')
        .send({
          mode: 'detect_bugs',
          prompt: 'find bugs in my diff',
          diffContent: 'some lines added'
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /"chunk"/);
      assert.match(res.text, /reviews/);
      assert.match(res.text, /complete/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });

    test('POST /api/agent/pull-request-review/run should return HTTP 500 on invalid inputs', async () => {
      const res = await request(app)
        .post('/api/agent/pull-request-review/run')
        .send({
          mode: 'invalid_mode',
          prompt: 'find bugs'
        })
        .expect(500);

      assert.match(res.headers['content-type'], /application\/json/);
      assert.ok(res.body.error);
    });
  });
});
