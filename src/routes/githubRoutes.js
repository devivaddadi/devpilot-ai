import { Router } from 'express';
import * as githubService from '../services/githubService.js';
import config from '../config.js';

const router = Router();

// In-memory store for webhook events to demonstrate webhooks in action
export const webhookEvents = [];

// Helper helper to retrieve token from request
function getAuthToken(req) {
  if (req.cookies && req.cookies.github_token) {
    return req.cookies.github_token;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// Authentication middleware
export function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Please login with GitHub OAuth.' });
  }
  req.githubToken = token;
  next();
}

// --- OAuth Routes ---

// 1. Redirect to GitHub login
router.get('/login', (req, res) => {
  const { clientId, redirectUri } = config.github;
  if (!clientId) {
    return res.status(500).json({ error: 'GitHub Client ID is not configured.' });
  }
  // Requesting permissions for:
  // - repo: read/write repos, commits, branches, issues, PRs
  // - write:repo_hook: create/manage webhooks
  // - user: read profile
  const scopes = ['repo', 'write:repo_hook', 'user'].join(' ');
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
  res.redirect(githubAuthUrl);
});

// 2. OAuth Callback
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is missing.' });
  }

  try {
    const data = await githubService.getAccessToken(code);
    
    // Store token in an httpOnly cookie
    res.cookie('github_token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Redirect to home dashboard
    res.redirect('/');
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.status(500).send(`<h1>Authentication Failed</h1><p>${error.message}</p><a href="/">Go Home</a>`);
  }
});

// 3. Logout
router.post('/logout', (req, res) => {
  res.clearCookie('github_token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

// 4. Session Check
router.get('/session', async (req, res) => {
  const token = getAuthToken(req);
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    const profile = await githubService.getUserProfile(token);
    res.json({ authenticated: true, user: profile });
  } catch (error) {
    // If token is invalid/expired, clear it
    res.clearCookie('github_token');
    res.json({ authenticated: false, error: 'Session expired or invalid token.' });
  }
});


// --- Authenticated GitHub API Routes ---

// Repositories
router.get('/repos', requireAuth, async (req, res) => {
  try {
    const repos = await githubService.listRepositories(req.githubToken);
    res.json(repos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/repos/:owner/:repo', requireAuth, async (req, res) => {
  try {
    const repo = await githubService.getRepository(req.githubToken, req.params.owner, req.params.repo);
    res.json(repo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Branches
router.get('/repos/:owner/:repo/branches', requireAuth, async (req, res) => {
  try {
    const branches = await githubService.listBranches(req.githubToken, req.params.owner, req.params.repo);
    res.json(branches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/repos/:owner/:repo/branches/create', requireAuth, async (req, res) => {
  const { branchName, fromBranch } = req.body;
  if (!branchName) {
    return res.status(400).json({ error: 'branchName is required.' });
  }
  try {
    const ref = await githubService.createBranch(
      req.githubToken,
      req.params.owner,
      req.params.repo,
      branchName,
      fromBranch || 'main'
    );
    res.json({ success: true, ref });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Commits
router.get('/repos/:owner/:repo/commits', requireAuth, async (req, res) => {
  const { sha } = req.query;
  try {
    const commits = await githubService.listCommits(req.githubToken, req.params.owner, req.params.repo, sha);
    res.json(commits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/repos/:owner/:repo/commits/create', requireAuth, async (req, res) => {
  const { filePath, content, commitMessage, branch } = req.body;
  if (!filePath || !content || !commitMessage || !branch) {
    return res.status(400).json({ error: 'filePath, content, commitMessage, and branch are all required.' });
  }
  try {
    const data = await githubService.createCommit(
      req.githubToken,
      req.params.owner,
      req.params.repo,
      branch,
      filePath,
      content,
      commitMessage
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pull Requests
router.get('/repos/:owner/:repo/pulls', requireAuth, async (req, res) => {
  const { state } = req.query;
  try {
    const pulls = await githubService.listPullRequests(req.githubToken, req.params.owner, req.params.repo, state);
    res.json(pulls);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/repos/:owner/:repo/pulls/create', requireAuth, async (req, res) => {
  const { title, head, base, body } = req.body;
  if (!title || !head || !base) {
    return res.status(400).json({ error: 'title, head, and base branches are required.' });
  }
  try {
    const pull = await githubService.createPullRequest(
      req.githubToken,
      req.params.owner,
      req.params.repo,
      title,
      head,
      base,
      body || ''
    );
    res.json(pull);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/repos/:owner/:repo/pulls/:number/merge', requireAuth, async (req, res) => {
  const { commitMessage } = req.body;
  const pullNumber = parseInt(req.params.number, 10);
  if (isNaN(pullNumber)) {
    return res.status(400).json({ error: 'Invalid pull request number.' });
  }
  try {
    const result = await githubService.mergePullRequest(
      req.githubToken,
      req.params.owner,
      req.params.repo,
      pullNumber,
      commitMessage || ''
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Issues
router.get('/repos/:owner/:repo/issues', requireAuth, async (req, res) => {
  const { state } = req.query;
  try {
    const issues = await githubService.listIssues(req.githubToken, req.params.owner, req.params.repo, state);
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/repos/:owner/:repo/issues/create', requireAuth, async (req, res) => {
  const { title, body } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required.' });
  }
  try {
    const issue = await githubService.createIssue(
      req.githubToken,
      req.params.owner,
      req.params.repo,
      title,
      body || ''
    );
    res.json(issue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/repos/:owner/:repo/issues/:number/update', requireAuth, async (req, res) => {
  const { state, title, body } = req.body;
  const issueNumber = parseInt(req.params.number, 10);
  if (isNaN(issueNumber)) {
    return res.status(400).json({ error: 'Invalid issue number.' });
  }
  try {
    const issue = await githubService.updateIssue(
      req.githubToken,
      req.params.owner,
      req.params.repo,
      issueNumber,
      { state, title, body }
    );
    res.json(issue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/repos/:owner/:repo/issues/:number/comment', requireAuth, async (req, res) => {
  const { body } = req.body;
  const issueNumber = parseInt(req.params.number, 10);
  if (!body) {
    return res.status(400).json({ error: 'comment body is required.' });
  }
  if (isNaN(issueNumber)) {
    return res.status(400).json({ error: 'Invalid issue number.' });
  }
  try {
    const comment = await githubService.createIssueComment(
      req.githubToken,
      req.params.owner,
      req.params.repo,
      issueNumber,
      body
    );
    res.json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhooks
router.get('/repos/:owner/:repo/webhooks', requireAuth, async (req, res) => {
  try {
    const hooks = await githubService.listWebhooks(req.githubToken, req.params.owner, req.params.repo);
    res.json(hooks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/repos/:owner/:repo/webhooks/create', requireAuth, async (req, res) => {
  const { callbackUrl, events } = req.body;
  if (!callbackUrl) {
    return res.status(400).json({ error: 'callbackUrl is required.' });
  }
  
  const webhookSecret = config.github.webhookSecret || 'default_webhook_secret';

  try {
    const hook = await githubService.createWebhook(
      req.githubToken,
      req.params.owner,
      req.params.repo,
      callbackUrl,
      webhookSecret,
      events || ['push', 'pull_request', 'issues']
    );
    res.json({ success: true, hook });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// --- Webhook Receiver Route (Public/Unauthenticated) ---

router.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const eventName = req.headers['x-github-event'];
  const deliveryId = req.headers['x-github-delivery'];
  
  const webhookSecret = config.github.webhookSecret || 'default_webhook_secret';

  // Verify signature
  const rawBody = req.rawBody || '';
  const isValid = githubService.verifyWebhookSignature(rawBody, signature, webhookSecret);

  if (!isValid) {
    console.warn(`[Webhook] Invalid signature received for delivery ${deliveryId}`);
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  console.log(`[Webhook] Valid event received: ${eventName} (Delivery ID: ${deliveryId})`);

  const eventData = {
    id: deliveryId,
    event: eventName,
    timestamp: new Date().toISOString(),
    payload: req.body
  };

  // Add to in-memory log, limit to last 100 events
  webhookEvents.unshift(eventData);
  if (webhookEvents.length > 100) {
    webhookEvents.pop();
  }

  res.status(200).json({ received: true });
});

// Fetch webhook events
router.get('/webhook/events', (req, res) => {
  res.json(webhookEvents);
});

// Clear webhook events
router.post('/webhook/events/clear', (req, res) => {
  webhookEvents.length = 0;
  res.json({ success: true });
});

export default router;
