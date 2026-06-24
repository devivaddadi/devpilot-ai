import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import crypto from 'crypto';
import app from '../src/server.js';
import config from '../src/config.js';
import { mockOverrides } from '../src/services/githubService.js';
import { webhookEvents } from '../src/routes/githubRoutes.js';

describe('GitHub Integration Server Tests', () => {

  afterEach(() => {
    // Clear all mock overrides
    for (const key in mockOverrides) {
      delete mockOverrides[key];
    }
    // Clear webhook events
    webhookEvents.length = 0;
  });

  describe('Static Assets', () => {
    test('GET / should serve the landing/dashboard page', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      assert.match(response.text, /devpilot-ai/);
    });
  });

  describe('OAuth & Session Management', () => {
    test('GET /api/github/session should return authenticated false when no token is present', async () => {
      const response = await request(app)
        .get('/api/github/session')
        .expect(200);
      assert.deepStrictEqual(response.body, { authenticated: false });
    });

    test('GET /api/github/session should return authenticated true and user info when valid cookie is present', async () => {
      mockOverrides.getUserProfile = async (token) => {
        assert.strictEqual(token, 'test_token_123');
        return { login: 'octocat', id: 5832347, avatar_url: 'https://avatars.githubusercontent.com/u/5832347' };
      };

      const response = await request(app)
        .get('/api/github/session')
        .set('Cookie', ['github_token=test_token_123'])
        .expect(200);

      assert.strictEqual(response.body.authenticated, true);
      assert.strictEqual(response.body.user.login, 'octocat');
    });

    test('POST /api/github/logout should clear the cookie', async () => {
      const response = await request(app)
        .post('/api/github/logout')
        .expect(200);
      
      const cookies = response.headers['set-cookie'] || [];
      assert.ok(cookies.some(cookie => cookie.includes('github_token=;')));
      assert.deepStrictEqual(response.body, { success: true, message: 'Logged out successfully.' });
    });
  });

  describe('API Authorization Guards', () => {
    test('GET /api/github/repos should return 401 when unauthorized', async () => {
      const response = await request(app)
        .get('/api/github/repos')
        .expect(401);
      assert.match(response.body.error, /Unauthorized/);
    });
  });

  describe('Repositories & Branches', () => {
    test('GET /api/github/repos should return list of repos when authorized', async () => {
      mockOverrides.listRepositories = async (token) => {
        assert.strictEqual(token, 'valid_token');
        return [{ id: 1, name: 'repo-1', full_name: 'octocat/repo-1', owner: { login: 'octocat' } }];
      };

      const response = await request(app)
        .get('/api/github/repos')
        .set('Cookie', ['github_token=valid_token'])
        .expect(200);

      assert.strictEqual(response.body.length, 1);
      assert.strictEqual(response.body[0].name, 'repo-1');
    });

    test('POST /api/github/repos/:owner/:repo/branches/create should create branch', async () => {
      mockOverrides.createBranch = async (token, owner, repo, branchName, fromBranch) => {
        assert.strictEqual(token, 'valid_token');
        assert.strictEqual(owner, 'octocat');
        assert.strictEqual(repo, 'repo-1');
        assert.strictEqual(branchName, 'feature-branch');
        assert.strictEqual(fromBranch, 'main');
        return { ref: 'refs/heads/feature-branch', object: { sha: 'abc123sha' } };
      };

      const response = await request(app)
        .post('/api/github/repos/octocat/repo-1/branches/create')
        .set('Cookie', ['github_token=valid_token'])
        .send({ branchName: 'feature-branch', fromBranch: 'main' })
        .expect(200);

      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.ref.ref, 'refs/heads/feature-branch');
    });
  });

  describe('Commits & Pull Requests', () => {
    test('POST /api/github/repos/:owner/:repo/commits/create should commit file changes', async () => {
      mockOverrides.createCommit = async (token, owner, repo, branch, filePath, content, commitMessage) => {
        assert.strictEqual(token, 'valid_token');
        assert.strictEqual(branch, 'main');
        assert.strictEqual(filePath, 'README.md');
        assert.strictEqual(content, 'Hello World');
        assert.strictEqual(commitMessage, 'Update readme');
        return { commit: { sha: 'hash123' } };
      };

      const response = await request(app)
        .post('/api/github/repos/octocat/repo-1/commits/create')
        .set('Cookie', ['github_token=valid_token'])
        .send({
          branch: 'main',
          filePath: 'README.md',
          content: 'Hello World',
          commitMessage: 'Update readme'
        })
        .expect(200);

      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.data.commit.sha, 'hash123');
    });

    test('POST /api/github/repos/:owner/:repo/pulls/create should open pull request', async () => {
      mockOverrides.createPullRequest = async (token, owner, repo, title, head, base, body) => {
        return { number: 42, title, state: 'open' };
      };

      const response = await request(app)
        .post('/api/github/repos/octocat/repo-1/pulls/create')
        .set('Cookie', ['github_token=valid_token'])
        .send({
          title: 'Awesome PR',
          head: 'feature',
          base: 'main',
          body: 'PR Description'
        })
        .expect(200);

      assert.strictEqual(response.body.number, 42);
      assert.strictEqual(response.body.title, 'Awesome PR');
    });

    test('POST /api/github/repos/:owner/:repo/pulls/:number/merge should merge pull request', async () => {
      mockOverrides.mergePullRequest = async (token, owner, repo, pullNumber, commitMessage) => {
        assert.strictEqual(pullNumber, 42);
        return { sha: 'mergeSha123', merged: true, message: 'PR successfully merged' };
      };

      const response = await request(app)
        .post('/api/github/repos/octocat/repo-1/pulls/42/merge')
        .set('Cookie', ['github_token=valid_token'])
        .send({ commitMessage: 'merging' })
        .expect(200);

      assert.strictEqual(response.body.merged, true);
      assert.strictEqual(response.body.sha, 'mergeSha123');
    });
  });

  describe('Issues API', () => {
    test('POST /api/github/repos/:owner/:repo/issues/create should open new issue', async () => {
      mockOverrides.createIssue = async (token, owner, repo, title, body) => {
        return { number: 101, title, state: 'open' };
      };

      const response = await request(app)
        .post('/api/github/repos/octocat/repo-1/issues/create')
        .set('Cookie', ['github_token=valid_token'])
        .send({ title: 'New Bug', body: 'Bug details' })
        .expect(200);

      assert.strictEqual(response.body.number, 101);
      assert.strictEqual(response.body.title, 'New Bug');
    });
  });

  describe('Webhook Events Receiver', () => {
    const webhookSecret = 'test_webhook_secret';
    
    before(() => {
      config.github.webhookSecret = webhookSecret;
    });
    
    test('POST /api/github/webhook should fail on invalid HMAC signature', async () => {
      const payload = { zen: 'Mindfulness' };
      const response = await request(app)
        .post('/api/github/webhook')
        .set('x-hub-signature-256', 'sha256=invalid-signature')
        .set('x-github-event', 'ping')
        .set('x-github-delivery', 'del-123')
        .send(payload)
        .expect(401);

      assert.deepStrictEqual(response.body, { error: 'Invalid HMAC signature' });
      assert.strictEqual(webhookEvents.length, 0);
    });

    test('POST /api/github/webhook should succeed on valid HMAC signature and save the event', async () => {
      const payload = { zen: 'Mindfulness' };
      const payloadStr = JSON.stringify(payload);
      
      // Calculate valid signature using the configured webhookSecret
      const hmac = crypto.createHmac('sha256', webhookSecret);
      const digest = 'sha256=' + hmac.update(payloadStr).digest('hex');

      const response = await request(app)
        .post('/api/github/webhook')
        .set('x-hub-signature-256', digest)
        .set('x-github-event', 'ping')
        .set('x-github-delivery', 'del-123')
        .send(payload)
        .expect(200);

      assert.deepStrictEqual(response.body, { received: true });
      assert.strictEqual(webhookEvents.length, 1);
      assert.strictEqual(webhookEvents[0].event, 'ping');
      assert.strictEqual(webhookEvents[0].id, 'del-123');
      assert.deepStrictEqual(webhookEvents[0].payload, payload);
    });

    test('GET /api/github/webhook/events should return logged events', async () => {
      webhookEvents.push({ id: '1', event: 'push', timestamp: 'now', payload: {} });
      
      const response = await request(app)
        .get('/api/github/webhook/events')
        .expect(200);
      
      assert.strictEqual(response.body.length, 1);
      assert.strictEqual(response.body[0].id, '1');
    });

    test('POST /api/github/webhook/events/clear should clear stored events', async () => {
      webhookEvents.push({ id: '1', event: 'push', timestamp: 'now', payload: {} });
      
      await request(app)
        .post('/api/github/webhook/events/clear')
        .expect(200);
      
      assert.strictEqual(webhookEvents.length, 0);
    });
  });
});
