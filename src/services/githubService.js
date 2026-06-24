import { Octokit } from 'octokit';
import crypto from 'crypto';
import config from '../config.js';

// Holds mock functions for unit/integration testing
export const mockOverrides = {};

/**
 * Exchange OAuth authorization code for an access token
 * @param {string} code 
 * @returns {Promise<Object>} Token response data containing access_token
 */
export async function getAccessToken(code) {
  if (mockOverrides.getAccessToken) return mockOverrides.getAccessToken(code);

  const { clientId, clientSecret, redirectUri } = config.github;
  
  if (!clientId || !clientSecret) {
    throw new Error('GitHub Client ID or Client Secret is not configured.');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`GitHub OAuth Error: ${data.error_description || data.error}`);
  }
  return data;
}

/**
 * Get authenticated user profile
 * @param {string} token 
 */
export async function getUserProfile(token) {
  if (mockOverrides.getUserProfile) return mockOverrides.getUserProfile(token);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.users.getAuthenticated();
  return data;
}

/**
 * List repositories of the authenticated user
 * @param {string} token 
 */
export async function listRepositories(token) {
  if (mockOverrides.listRepositories) return mockOverrides.listRepositories(token);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 50,
  });
  return data;
}

/**
 * Get repository details
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 */
export async function getRepository(token, owner, repo) {
  if (mockOverrides.getRepository) return mockOverrides.getRepository(token, owner, repo);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data;
}

/**
 * List branches of a repository
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 */
export async function listBranches(token, owner, repo) {
  if (mockOverrides.listBranches) return mockOverrides.listBranches(token, owner, repo);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.repos.listBranches({ owner, repo, per_page: 100 });
  return data;
}

/**
 * Create a new branch
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} branchName 
 * @param {string} fromBranch 
 */
export async function createBranch(token, owner, repo, branchName, fromBranch = 'main') {
  if (mockOverrides.createBranch) return mockOverrides.createBranch(token, owner, repo, branchName, fromBranch);

  const octokit = new Octokit({ auth: token });
  
  // 1. Get SHA of the reference (fromBranch)
  const refRes = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${fromBranch}`,
  });
  const sha = refRes.data.object.sha;

  // 2. Create new reference
  const { data } = await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha,
  });
  return data;
}

/**
 * List commits of a branch or repository
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} [sha] - Branch name, SHA, or tag
 */
export async function listCommits(token, owner, repo, sha) {
  if (mockOverrides.listCommits) return mockOverrides.listCommits(token, owner, repo, sha);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    sha,
    per_page: 50,
  });
  return data;
}

/**
 * Create a commit by creating/updating a file
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} branch 
 * @param {string} filePath 
 * @param {string} content 
 * @param {string} commitMessage 
 */
export async function createCommit(token, owner, repo, branch, filePath, content, commitMessage) {
  if (mockOverrides.createCommit) return mockOverrides.createCommit(token, owner, repo, branch, filePath, content, commitMessage);

  const octokit = new Octokit({ auth: token });
  
  let sha;
  try {
    const fileRes = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });
    if (!Array.isArray(fileRes.data)) {
      sha = fileRes.data.sha;
    }
  } catch (e) {
    // File doesn't exist, which is fine
  }

  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(content).toString('base64'),
    branch,
    sha,
  });
  return data;
}

/**
 * List pull requests
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} [state='open'] 
 */
export async function listPullRequests(token, owner, repo, state = 'open') {
  if (mockOverrides.listPullRequests) return mockOverrides.listPullRequests(token, owner, repo, state);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.pulls.list({ owner, repo, state, per_page: 50 });
  return data;
}

/**
 * Create a pull request
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} title 
 * @param {string} head - Source branch
 * @param {string} base - Target branch (e.g. main)
 * @param {string} body - Description
 */
export async function createPullRequest(token, owner, repo, title, head, base, body) {
  if (mockOverrides.createPullRequest) return mockOverrides.createPullRequest(token, owner, repo, title, head, base, body);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    head,
    base,
    body,
  });
  return data;
}

/**
 * Merge a pull request
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {number} pullNumber 
 * @param {string} [commitMessage] 
 */
export async function mergePullRequest(token, owner, repo, pullNumber, commitMessage) {
  if (mockOverrides.mergePullRequest) return mockOverrides.mergePullRequest(token, owner, repo, pullNumber, commitMessage);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: pullNumber,
    commit_message: commitMessage,
  });
  return data;
}

/**
 * List issues in a repository
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} [state='all'] 
 */
export async function listIssues(token, owner, repo, state = 'all') {
  if (mockOverrides.listIssues) return mockOverrides.listIssues(token, owner, repo, state);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state,
    per_page: 50,
  });
  // Filter out pull requests since GitHub API lists PRs as issues
  return data.filter(issue => !issue.pull_request);
}

/**
 * Create an issue
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} title 
 * @param {string} body 
 */
export async function createIssue(token, owner, repo, title, body) {
  if (mockOverrides.createIssue) return mockOverrides.createIssue(token, owner, repo, title, body);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.issues.create({
    owner,
    repo,
    title,
    body,
  });
  return data;
}

/**
 * Update an issue (e.g., close it, edit it)
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {number} issueNumber 
 * @param {Object} updates 
 */
export async function updateIssue(token, owner, repo, issueNumber, updates) {
  if (mockOverrides.updateIssue) return mockOverrides.updateIssue(token, owner, repo, issueNumber, updates);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    ...updates,
  });
  return data;
}

/**
 * Create an issue comment
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {number} issueNumber 
 * @param {string} body 
 */
export async function createIssueComment(token, owner, repo, issueNumber, body) {
  if (mockOverrides.createIssueComment) return mockOverrides.createIssueComment(token, owner, repo, issueNumber, body);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return data;
}

/**
 * Create a webhook for a repository
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 * @param {string} callbackUrl 
 * @param {string} secret 
 * @param {string[]} events 
 */
export async function createWebhook(token, owner, repo, callbackUrl, secret, events = ['push', 'pull_request', 'issues']) {
  if (mockOverrides.createWebhook) return mockOverrides.createWebhook(token, owner, repo, callbackUrl, secret, events);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: callbackUrl,
      content_type: 'json',
      secret,
    },
    events,
    active: true,
  });
  return data;
}

/**
 * List webhooks for a repository
 * @param {string} token 
 * @param {string} owner 
 * @param {string} repo 
 */
export async function listWebhooks(token, owner, repo) {
  if (mockOverrides.listWebhooks) return mockOverrides.listWebhooks(token, owner, repo);

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.repos.listWebhooks({ owner, repo, per_page: 50 });
  return data;
}

/**
 * Verify GitHub webhook HMAC signature
 * @param {string} rawBody 
 * @param {string} signature 
 * @param {string} secret 
 * @returns {boolean} 
 */
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(rawBody).digest('hex');
    
    const digestBuffer = Buffer.from(digest);
    const signatureBuffer = Buffer.from(signature);
    
    if (digestBuffer.length !== signatureBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}
