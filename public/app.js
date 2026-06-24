// Application State
let currentUser = null;
let repositories = [];
let selectedRepo = null; // { owner: '', name: '' }
let activeTab = 'tab-commits';
let webhooksPollingInterval = null;
let activeRepoName = null;
let activeRepoPath = null;
let analyzerPollingInterval = null;

// DOM Elements
const authLoading = document.getElementById('auth-loading');
const authLoggedOut = document.getElementById('auth-logged-out');
const authLoggedIn = document.getElementById('auth-logged-in');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const btnLogout = document.getElementById('btn-logout');

const landingPage = document.getElementById('landing-page');
const mainContent = document.getElementById('main-content');
const repoSelect = document.getElementById('repo-select');

// Repo Detail card
const repoDetailsCard = document.getElementById('repo-details-card');
const repoOwnerVal = document.getElementById('repo-owner-val');
const repoVisVal = document.getElementById('repo-vis-val');
const repoBranchVal = document.getElementById('repo-branch-val');
const repoStatsVal = document.getElementById('repo-stats-val');

// Navigation & Tabs
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

// Lists containers
const commitsList = document.getElementById('commits-list');
const branchesList = document.getElementById('branches-list');
const pullsList = document.getElementById('pulls-list');
const issuesList = document.getElementById('issues-list');
const webhooksList = document.getElementById('webhooks-list');
const eventsList = document.getElementById('events-list');

// Filters
const prFilter = document.getElementById('pr-filter');
const issueFilter = document.getElementById('issue-filter');

// Modals
const modals = {
  branch: document.getElementById('modal-branch'),
  commit: document.getElementById('modal-commit'),
  pr: document.getElementById('modal-pr'),
  issue: document.getElementById('modal-issue'),
  webhook: document.getElementById('modal-webhook'),
  issueDetail: document.getElementById('modal-issue-detail'),
  fileChunks: document.getElementById('modal-file-chunks'),
};

// Form selectors
const forms = {
  branch: document.getElementById('form-branch'),
  commit: document.getElementById('form-commit'),
  pr: document.getElementById('form-pr'),
  issue: document.getElementById('form-issue'),
  webhook: document.getElementById('form-webhook'),
  comment: document.getElementById('form-comment'),
  analyzerClone: document.getElementById('form-analyzer-clone'),
  analyzerSearch: document.getElementById('form-analyzer-search'),
};

// Start Up
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  setupEventListeners();
});

// Check Session & Auth
async function checkSession() {
  try {
    const response = await fetch('/api/github/session');
    const data = await response.json();
    
    authLoading.classList.add('hidden');
    
    if (data.authenticated) {
      currentUser = data.user;
      showAuthenticatedUser();
      loadRepositories();
      startWebhooksPolling();
    } else {
      showLoggedOutUser();
    }
  } catch (error) {
    console.error('Session check failed:', error);
    showLoggedOutUser();
  }
}

function showAuthenticatedUser() {
  authLoggedOut.classList.add('hidden');
  authLoggedIn.classList.remove('hidden');
  userAvatar.src = currentUser.avatar_url;
  userName.textContent = currentUser.login;
  
  landingPage.classList.add('hidden');
  mainContent.classList.remove('hidden');
}

function showLoggedOutUser() {
  authLoggedIn.classList.add('hidden');
  authLoggedOut.classList.remove('hidden');
  
  mainContent.classList.add('hidden');
  landingPage.classList.remove('hidden');
  
  stopWebhooksPolling();
}

// Log out handler
btnLogout.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/github/logout', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      currentUser = null;
      selectedRepo = null;
      repositories = [];
      showLoggedOutUser();
    }
  } catch (error) {
    alert('Failed to log out: ' + error.message);
  }
});

// Load Repositories dropdown
async function loadRepositories() {
  try {
    const response = await fetch('/api/github/repos');
    if (!response.ok) throw new Error(await response.text());
    
    repositories = await response.json();
    
    repoSelect.innerHTML = '<option value="" disabled selected>-- Select a Repository --</option>';
    repositories.forEach(repo => {
      const option = document.createElement('option');
      option.value = `${repo.owner.login}/${repo.name}`;
      option.textContent = repo.full_name;
      repoSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    alert('Error loading repositories. Please check configuration or try reconnecting OAuth.');
  }
}

// Setup all Event Listeners
function setupEventListeners() {
  // Repo Selection
  repoSelect.addEventListener('change', (e) => {
    const [owner, name] = e.target.value.split('/');
    selectedRepo = { owner, name };
    
    // Find the repo details from local state
    const repoObj = repositories.find(r => r.name === name && r.owner.login === owner);
    displayRepoDetails(repoObj);
    
    // Refresh active tab
    refreshCurrentTab();
  });

  // Tab Navigation
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      navItems.forEach(nav => nav.classList.remove('active'));
      e.target.classList.add('active');
      
      activeTab = e.target.dataset.tab;
      tabPanes.forEach(pane => {
        if (pane.id === activeTab) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
      
      refreshCurrentTab();
    });
  });

  // PR / Issue Filters
  prFilter.addEventListener('change', () => {
    if (selectedRepo && activeTab === 'tab-pulls') loadPullRequests();
  });
  
  issueFilter.addEventListener('change', () => {
    if (selectedRepo && activeTab === 'tab-issues') loadIssues();
  });

  // Open Modal Buttons
  document.getElementById('btn-open-branch-modal').addEventListener('click', () => openModal('branch'));
  document.getElementById('btn-open-commit-modal').addEventListener('click', () => openModal('commit'));
  document.getElementById('btn-open-pr-modal').addEventListener('click', () => openModal('pr'));
  document.getElementById('btn-open-issue-modal').addEventListener('click', () => openModal('issue'));
  document.getElementById('btn-open-webhook-modal').addEventListener('click', () => {
    // Autopopulate webhook URL with current host as helper helper
    document.getElementById('webhook-url').value = `${window.location.origin}/api/github/webhook`;
    openModal('webhook');
  });
  
  // Clear Webhook events button
  document.getElementById('btn-clear-events').addEventListener('click', clearWebhookEvents);

  // Close modals
  document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      closeModal(modal.id.replace('modal-', ''));
    });
  });

  // Handle Form Submissions
  setupFormSubmissions();
}

function displayRepoDetails(repo) {
  if (!repo) return;
  repoDetailsCard.classList.remove('hidden');
  repoOwnerVal.textContent = repo.owner.login;
  repoVisVal.textContent = repo.private ? 'Private' : 'Public';
  repoVisVal.className = repo.private ? 'badge badge-warning' : 'badge badge-info';
  repoBranchVal.textContent = repo.default_branch || 'main';
  repoStatsVal.textContent = `🍴 ${repo.forks_count} / ⭐ ${repo.stargazers_count}`;
}

// Open / Close Modals helper
function openModal(modalId) {
  const modal = modals[modalId];
  if (!modal) return;
  
  modal.classList.remove('hidden');
  
  // Populate dropdowns inside modals if needed
  if (modalId === 'branch' || modalId === 'commit' || modalId === 'pr') {
    populateBranchSelects(modalId);
  }
}

function closeModal(modalId) {
  const modal = modals[modalId];
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function populateBranchSelects(modalId) {
  if (!selectedRepo) return;
  
  try {
    const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/branches`);
    const branches = await response.json();
    
    if (modalId === 'branch') {
      const select = document.getElementById('branch-source');
      select.innerHTML = '';
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        select.appendChild(opt);
      });
    } else if (modalId === 'commit') {
      const select = document.getElementById('commit-branch');
      select.innerHTML = '';
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        select.appendChild(opt);
      });
    } else if (modalId === 'pr') {
      const headSelect = document.getElementById('pr-head');
      const baseSelect = document.getElementById('pr-base');
      headSelect.innerHTML = '';
      baseSelect.innerHTML = '';
      
      branches.forEach(b => {
        const headOpt = document.createElement('option');
        headOpt.value = b.name;
        headOpt.textContent = b.name;
        headSelect.appendChild(headOpt);
        
        const baseOpt = document.createElement('option');
        baseOpt.value = b.name;
        baseOpt.textContent = b.name;
        // Default to repo's default branch for base
        if (b.name === 'main' || b.name === 'master') baseOpt.selected = true;
        baseSelect.appendChild(baseOpt);
      });
    }
  } catch (error) {
    console.error('Failed to populate branches:', error);
  }
}

// Refresh whatever tab is currently active
function refreshCurrentTab() {
  if (activeTab === 'tab-analyzer') {
    loadIndexedFiles();
    return;
  }

  if (!selectedRepo) return;
  
  switch(activeTab) {
    case 'tab-commits':
      loadCommits();
      break;
    case 'tab-branches':
      loadBranches();
      break;
    case 'tab-pulls':
      loadPullRequests();
      break;
    case 'tab-issues':
      loadIssues();
      break;
    case 'tab-webhooks':
      loadWebhooks();
      break;
    case 'tab-incoming':
      loadWebhookEvents();
      break;
  }
}

// --- Data Fetchers ---

// 1. Commits
async function loadCommits() {
  commitsList.innerHTML = '<div class="placeholder-text">Loading commits...</div>';
  try {
    const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/commits`);
    if (!response.ok) throw new Error(await response.text());
    const commits = await response.json();
    
    if (commits.length === 0) {
      commitsList.innerHTML = '<div class="empty-state">No commits found.</div>';
      return;
    }

    commitsList.innerHTML = '';
    commits.forEach(item => {
      const date = new Date(item.commit.author.date).toLocaleString();
      const div = document.createElement('div');
      div.className = 'card-item';
      div.innerHTML = `
        <div class="card-meta">
          <span class="card-title">${escapeHtml(item.commit.message)}</span>
          <span class="card-subtitle">By ${escapeHtml(item.commit.author.name)} on ${date}</span>
        </div>
        <span class="commit-hash">${item.sha.substring(0, 7)}</span>
      `;
      commitsList.appendChild(div);
    });
  } catch (error) {
    commitsList.innerHTML = `<div class="empty-state error">Error: ${error.message}</div>`;
  }
}

// 2. Branches
async function loadBranches() {
  branchesList.innerHTML = '<div class="placeholder-text">Loading branches...</div>';
  try {
    const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/branches`);
    if (!response.ok) throw new Error(await response.text());
    const branches = await response.json();
    
    branchesList.innerHTML = '';
    branches.forEach(b => {
      const div = document.createElement('div');
      div.className = 'card-item';
      div.innerHTML = `
        <div class="card-meta">
          <span class="card-title">${escapeHtml(b.name)}</span>
          <span class="card-subtitle">Commit SHA: ${b.commit.sha.substring(0, 10)}...</span>
        </div>
        ${b.protected ? '<span class="badge badge-success">Protected</span>' : '<span class="badge badge-info">Active</span>'}
      `;
      branchesList.appendChild(div);
    });
  } catch (error) {
    branchesList.innerHTML = `<div class="empty-state error">Error: ${error.message}</div>`;
  }
}

// 3. PRs
async function loadPullRequests() {
  pullsList.innerHTML = '<div class="placeholder-text">Loading pull requests...</div>';
  const state = prFilter.value;
  try {
    const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/pulls?state=${state}`);
    if (!response.ok) throw new Error(await response.text());
    const pulls = await response.json();
    
    if (pulls.length === 0) {
      pullsList.innerHTML = `<div class="empty-state">No ${state} pull requests found.</div>`;
      return;
    }
    
    pullsList.innerHTML = '';
    pulls.forEach(pr => {
      const date = new Date(pr.created_at).toLocaleDateString();
      const div = document.createElement('div');
      div.className = 'card-item';
      
      const badgeClass = pr.state === 'open' ? 'badge-success' : (pr.merged_at ? 'badge-info' : 'badge-danger');
      const stateLabel = pr.state === 'open' ? 'Open' : (pr.merged_at ? 'Merged' : 'Closed');
      
      div.innerHTML = `
        <div class="card-meta">
          <span class="card-title">#${pr.number} - ${escapeHtml(pr.title)}</span>
          <span class="card-subtitle">Opened by ${escapeHtml(pr.user.login)} on ${date} • ${escapeHtml(pr.head.ref)} ➔ ${escapeHtml(pr.base.ref)}</span>
        </div>
        <div class="pr-badge-container">
          <span class="badge ${badgeClass}">${stateLabel}</span>
          ${pr.state === 'open' ? `<button class="btn btn-outline btn-sm btn-merge" data-number="${pr.number}">Merge</button>` : ''}
        </div>
      `;
      
      // Merge Button Event
      const mergeBtn = div.querySelector('.btn-merge');
      if (mergeBtn) {
        mergeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const number = e.target.dataset.number;
          if (confirm(`Are you sure you want to merge Pull Request #${number}?`)) {
            mergePullRequest(number);
          }
        });
      }
      
      pullsList.appendChild(div);
    });
  } catch (error) {
    pullsList.innerHTML = `<div class="empty-state error">Error: ${error.message}</div>`;
  }
}

async function mergePullRequest(number) {
  try {
    const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/pulls/${number}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitMessage: `Merges pull request #${number} automatically via devpilot-ai` })
    });
    const result = await response.json();
    if (result.merged) {
      alert(`Pull Request #${number} successfully merged!`);
      loadPullRequests();
    } else {
      alert(`Merge failed: ${result.message || 'Check conflicts'}`);
    }
  } catch (error) {
    alert(`Error merging PR: ${error.message}`);
  }
}

// 4. Issues
async function loadIssues() {
  issuesList.innerHTML = '<div class="placeholder-text">Loading issues...</div>';
  const state = issueFilter.value;
  try {
    const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/issues?state=${state}`);
    if (!response.ok) throw new Error(await response.text());
    const issues = await response.json();
    
    if (issues.length === 0) {
      issuesList.innerHTML = `<div class="empty-state">No ${state} issues found.</div>`;
      return;
    }
    
    issuesList.innerHTML = '';
    issues.forEach(issue => {
      const date = new Date(issue.created_at).toLocaleDateString();
      const div = document.createElement('div');
      div.className = 'card-item';
      div.style.cursor = 'pointer';
      
      const badgeClass = issue.state === 'open' ? 'badge-success' : 'badge-danger';
      
      div.innerHTML = `
        <div class="card-meta">
          <span class="card-title">#${issue.number} - ${escapeHtml(issue.title)}</span>
          <span class="card-subtitle">Opened by ${escapeHtml(issue.user.login)} on ${date} • 💬 ${issue.comments} comments</span>
        </div>
        <span class="badge ${badgeClass}">${issue.state === 'open' ? 'Open' : 'Closed'}</span>
      `;
      
      // Click to view issue detail / comment modal
      div.addEventListener('click', () => openIssueDetailModal(issue));
      
      issuesList.appendChild(div);
    });
  } catch (error) {
    issuesList.innerHTML = `<div class="empty-state error">Error: ${error.message}</div>`;
  }
}

// 5. Issues Details & Comments
let activeIssue = null;
async function openIssueDetailModal(issue) {
  activeIssue = issue;
  document.getElementById('detail-issue-title').textContent = `Issue #${issue.number} - ${issue.title}`;
  document.getElementById('detail-issue-body').textContent = issue.body || 'No description provided.';
  
  const statusBadge = document.getElementById('detail-issue-status');
  statusBadge.textContent = issue.state === 'open' ? 'Open' : 'Closed';
  statusBadge.className = `badge ${issue.state === 'open' ? 'badge-success' : 'badge-danger'}`;
  
  const toggleBtn = document.getElementById('btn-toggle-issue-state');
  toggleBtn.textContent = issue.state === 'open' ? 'Close Issue' : 'Reopen Issue';
  
  // Clear comments list
  const commentContainer = document.getElementById('issue-comments-container');
  commentContainer.innerHTML = '<div class="placeholder-text">Loading comments...</div>';
  
  openModal('issueDetail');
  
  // Load Comments
  try {
    const commentsUrl = issue.comments_url.replace('https://api.github.com', '');
    const response = await fetch(`/api/github${commentsUrl}`);
    const comments = await response.json();
    
    if (comments.length === 0) {
      commentContainer.innerHTML = '<div class="placeholder-text">No comments on this issue yet.</div>';
      return;
    }
    
    commentContainer.innerHTML = '';
    comments.forEach(comment => {
      const date = new Date(comment.created_at).toLocaleString();
      const div = document.createElement('div');
      div.className = 'comment-card';
      div.innerHTML = `
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(comment.user.login)}</span>
          <span>${date}</span>
        </div>
        <p>${escapeHtml(comment.body)}</p>
      `;
      commentContainer.appendChild(div);
    });
  } catch (error) {
    commentContainer.innerHTML = `<div class="placeholder-text">Failed to load comments: ${error.message}</div>`;
  }
}

// Toggle Issue State (Close/Reopen)
document.getElementById('btn-toggle-issue-state').addEventListener('click', async () => {
  if (!activeIssue) return;
  const newState = activeIssue.state === 'open' ? 'closed' : 'open';
  try {
    const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${activeIssue.number}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: newState })
    });
    
    if (!response.ok) throw new Error(await response.text());
    const updatedIssue = await response.json();
    
    alert(`Issue state updated successfully to ${newState}!`);
    closeModal('issueDetail');
    loadIssues();
  } catch (error) {
    alert(`Failed to update issue state: ${error.message}`);
  }
});

// 6. Webhooks
async function loadWebhooks() {
  webhooksList.innerHTML = '<div class="placeholder-text">Loading webhooks...</div>';
  try {
    const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/webhooks`);
    if (!response.ok) throw new Error(await response.text());
    const hooks = await response.json();
    
    if (hooks.length === 0) {
      webhooksList.innerHTML = '<div class="empty-state">No webhooks registered for this repository.</div>';
      return;
    }
    
    webhooksList.innerHTML = '';
    hooks.forEach(hook => {
      const activeLabel = hook.active ? 'Active' : 'Inactive';
      const eventsStr = hook.events.join(', ');
      const div = document.createElement('div');
      div.className = 'card-item';
      div.innerHTML = `
        <div class="card-meta">
          <span class="card-title">${escapeHtml(hook.config.url)}</span>
          <span class="card-subtitle">Events: <b>${escapeHtml(eventsStr)}</b></span>
        </div>
        <span class="badge ${hook.active ? 'badge-success' : 'badge-warning'}">${activeLabel}</span>
      `;
      webhooksList.appendChild(div);
    });
  } catch (error) {
    webhooksList.innerHTML = `<div class="empty-state error">Error: ${error.message}</div>`;
  }
}

// 7. Webhook Events Log
async function loadWebhookEvents() {
  try {
    const response = await fetch('/api/github/webhook/events');
    const events = await response.json();
    
    if (events.length === 0) {
      eventsList.innerHTML = '<div class="empty-state">No webhook events received yet. Configure a webhook and trigger it.</div>';
      return;
    }
    
    eventsList.innerHTML = '';
    events.forEach(item => {
      const date = new Date(item.timestamp).toLocaleString();
      const div = document.createElement('div');
      div.className = 'event-card';
      
      // Determine user and details depending on event type
      let sender = item.payload.sender ? item.payload.sender.login : 'unknown';
      let details = '';
      if (item.event === 'push') {
        details = `Pushed commits to <code>${escapeHtml(item.payload.ref)}</code>`;
      } else if (item.event === 'pull_request') {
        details = `Pull Request #${item.payload.number} <b>${item.payload.action}</b>: <i>${escapeHtml(item.payload.pull_request.title)}</i>`;
      } else if (item.event === 'issues') {
        details = `Issue #${item.payload.issue.number} <b>${item.payload.action}</b>: <i>${escapeHtml(item.payload.issue.title)}</i>`;
      } else {
        details = `Triggered <code>${escapeHtml(item.event)}</code> action.`;
      }

      div.innerHTML = `
        <div class="event-header">
          <div class="event-meta">
            <span class="event-badge">${escapeHtml(item.event)}</span>
            <span class="card-subtitle">By <b>${escapeHtml(sender)}</b> at ${date}</span>
          </div>
          <button class="event-payload-toggle" onclick="togglePayload('${item.id}')">View Payload</button>
        </div>
        <div class="event-description">${details}</div>
        <pre id="payload-${item.id}" class="event-payload hidden">${escapeHtml(JSON.stringify(item.payload, null, 2))}</pre>
      `;
      eventsList.appendChild(div);
    });
  } catch (error) {
    console.error('Failed to load webhook events:', error);
  }
}

function togglePayload(id) {
  const pre = document.getElementById(`payload-${id}`);
  if (pre) {
    pre.classList.toggle('hidden');
  }
}

async function clearWebhookEvents() {
  if (confirm('Clear all webhook events from the logs?')) {
    try {
      await fetch('/api/github/webhook/events/clear', { method: 'POST' });
      loadWebhookEvents();
    } catch (error) {
      alert('Error clearing events: ' + error.message);
    }
  }
}

// Start / Stop Polling loop
function startWebhooksPolling() {
  if (webhooksPollingInterval) clearInterval(webhooksPollingInterval);
  // Poll webhook events every 3 seconds to keep UI current
  webhooksPollingInterval = setInterval(() => {
    // Only fetch if session is active
    if (currentUser) {
      loadWebhookEvents();
      // Also fetch other items if tab is currently on webhook events
      if (selectedRepo && activeTab === 'tab-incoming') {
        loadWebhookEvents();
      }
    }
  }, 3000);
}

function stopWebhooksPolling() {
  if (webhooksPollingInterval) {
    clearInterval(webhooksPollingInterval);
    webhooksPollingInterval = null;
  }
}


// --- Form Submissions Handlers ---

function setupFormSubmissions() {
  // 1. Create Branch
  forms.branch.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRepo) return;
    
    const branchName = document.getElementById('branch-name').value;
    const fromBranch = document.getElementById('branch-source').value;
    
    try {
      const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/branches/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchName, fromBranch })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error');
      
      alert(`Branch "${branchName}" successfully created!`);
      closeModal('branch');
      forms.branch.reset();
      loadBranches();
    } catch (error) {
      alert('Failed to create branch: ' + error.message);
    }
  });

  // 2. Create Commit
  forms.commit.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRepo) return;
    
    const branch = document.getElementById('commit-branch').value;
    const filePath = document.getElementById('commit-path').value;
    const content = document.getElementById('commit-content').value;
    const commitMessage = document.getElementById('commit-msg').value;
    
    try {
      const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/commits/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, filePath, content, commitMessage })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error');
      
      alert(`File committed successfully!`);
      closeModal('commit');
      forms.commit.reset();
      loadCommits();
    } catch (error) {
      alert('Commit failed: ' + error.message);
    }
  });

  // 3. Create PR
  forms.pr.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRepo) return;
    
    const title = document.getElementById('pr-title').value;
    const head = document.getElementById('pr-head').value;
    const base = document.getElementById('pr-base').value;
    const body = document.getElementById('pr-body').value;
    
    try {
      const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/pulls/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, head, base, body })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error');
      
      alert(`Pull Request "${title}" successfully opened!`);
      closeModal('pr');
      forms.pr.reset();
      loadPullRequests();
    } catch (error) {
      alert('Failed to create Pull Request: ' + error.message);
    }
  });

  // 4. Create Issue
  forms.issue.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRepo) return;
    
    const title = document.getElementById('issue-title').value;
    const body = document.getElementById('issue-body').value;
    
    try {
      const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error');
      
      alert(`Issue #${result.number} opened successfully!`);
      closeModal('issue');
      forms.issue.reset();
      loadIssues();
    } catch (error) {
      alert('Failed to open issue: ' + error.message);
    }
  });

  // 5. Create Comment
  forms.comment.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRepo || !activeIssue) return;
    
    const body = document.getElementById('comment-body').value;
    
    try {
      const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/issues/${activeIssue.number}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error');
      
      document.getElementById('comment-body').value = '';
      
      // Reload comments inside active issue detail modal
      openIssueDetailModal(activeIssue);
      // Reload issue comments count in main list
      loadIssues();
    } catch (error) {
      alert('Failed to add comment: ' + error.message);
    }
  });

  // 6. Create Webhook
  forms.webhook.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedRepo) return;
    
    const callbackUrl = document.getElementById('webhook-url').value;
    
    // Collect checkboxes checked events
    const checkboxes = document.querySelectorAll('input[name="webhook-event"]:checked');
    const events = Array.from(checkboxes).map(cb => cb.value);
    
    if (events.length === 0) {
      alert('Please select at least one trigger event.');
      return;
    }
    
    try {
      const response = await fetch(`/api/github/repos/${selectedRepo.owner}/${selectedRepo.name}/webhooks/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl, events })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error');
      
      alert(`Webhook registered successfully with GitHub!`);
      closeModal('webhook');
      forms.webhook.reset();
      loadWebhooks();
    } catch (error) {
      alert('Failed to register webhook: ' + error.message);
    }
  });

  // 7. Analyzer Clone & Index
  forms.analyzerClone.addEventListener('submit', async (e) => {
    e.preventDefault();
    const gitUrl = document.getElementById('analyzer-git-url').value;
    
    const progressContainer = document.getElementById('analyzer-progress-container');
    const badge = document.getElementById('analyzer-status-badge');
    const message = document.getElementById('analyzer-status-message');
    const fill = document.getElementById('analyzer-progress-bar');
    
    progressContainer.classList.remove('hidden');
    badge.textContent = 'Cloning';
    badge.className = 'badge badge-info';
    message.textContent = 'Cloning remote git repository...';
    fill.style.width = '15%';

    try {
      const cloneResponse = await fetch('/api/analyzer/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitUrl })
      });
      
      const cloneResult = await cloneResponse.json();
      if (!cloneResponse.ok) throw new Error(cloneResult.error || 'Clone failed');
      
      activeRepoName = cloneResult.repoName;
      activeRepoPath = cloneResult.repoPath;
      
      const analyzeResponse = await fetch('/api/analyzer/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: activeRepoName, repoPath: activeRepoPath })
      });
      
      const analyzeResult = await analyzeResponse.json();
      if (!analyzeResponse.ok) throw new Error(analyzeResult.error || 'Analysis start failed');
      
      startAnalyzerPolling(activeRepoName);
    } catch (error) {
      alert('Analyzer Error: ' + error.message);
      progressContainer.classList.add('hidden');
    }
  });

  // 8. Analyzer Semantic Search
  forms.analyzerSearch.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeRepoName) {
      alert('Please clone and index a repository first before performing queries.');
      return;
    }

    const queryText = document.getElementById('analyzer-search-query').value;
    const resultsSection = document.getElementById('analyzer-results-section');
    const resultsList = document.getElementById('search-results-list');
    
    resultsSection.classList.remove('hidden');
    resultsList.innerHTML = '<div class="placeholder-text">Searching codebase...</div>';

    try {
      const response = await fetch('/api/analyzer/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: activeRepoName, queryText, limit: 5 })
      });
      
      if (!response.ok) throw new Error(await response.text());
      const results = await response.json();

      if (results.length === 0) {
        resultsList.innerHTML = '<div class="empty-state">No semantic code snippets matched your query.</div>';
        return;
      }

      resultsList.innerHTML = '';
      results.forEach(res => {
        const percentage = Math.round(res.similarity * 100);
        const div = document.createElement('div');
        div.className = 'search-result-card';
        
        const functionsStr = res.metadata.functions?.length ? res.metadata.functions.join(', ') : 'None';
        const classesStr = res.metadata.classes?.length ? res.metadata.classes.join(', ') : 'None';
        
        div.innerHTML = `
          <div class="search-result-header">
            <span class="search-result-file" title="${escapeHtml(res.file)}">${escapeHtml(res.file)} (Lines ${res.startLine}-${res.endLine})</span>
            <span class="match-percentage">${percentage}% Match</span>
          </div>
          <pre class="chunk-code"><code>${escapeHtml(res.content)}</code></pre>
          <div class="chunk-metadata-badges">
            <span class="badge badge-info" style="background: rgba(124, 77, 255, 0.08); color: var(--accent-primary-hover);">Language: ${escapeHtml(res.metadata.language)}</span>
            <span class="badge badge-info" style="background: rgba(0, 229, 255, 0.08); color: var(--accent-primary-hover);">Functions: ${escapeHtml(functionsStr)}</span>
            <span class="badge badge-info" style="background: rgba(0, 229, 255, 0.08); color: var(--accent-primary-hover);">Classes: ${escapeHtml(classesStr)}</span>
          </div>
        `;
        resultsList.appendChild(div);
      });
    } catch (error) {
      resultsList.innerHTML = `<div class="empty-state error">Search failed: ${error.message}</div>`;
    }
  });
}

// Helper: Escape HTML strings to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Repository Analyzer Data Fetchers & Handlers ---

// Fetch and display list of files from repository index cache
async function loadIndexedFiles() {
  const filesList = document.getElementById('analyzer-files-list');
  if (!activeRepoName) {
    filesList.innerHTML = '<div class="placeholder-text">Clone and analyze a repository to view indexed files.</div>';
    return;
  }

  filesList.innerHTML = '<div class="placeholder-text">Loading indexed files...</div>';
  try {
    const response = await fetch(`/api/analyzer/files/${activeRepoName}`);
    if (!response.ok) throw new Error(await response.text());
    const files = await response.json();

    if (files.length === 0) {
      filesList.innerHTML = '<div class="empty-state">No files indexed for this repository.</div>';
      return;
    }

    filesList.innerHTML = '';
    files.forEach(file => {
      const sizeKB = (file.size / 1024).toFixed(1);
      const div = document.createElement('div');
      div.className = 'file-item';
      div.innerHTML = `
        <span class="file-path" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</span>
        <span class="file-size">${sizeKB} KB</span>
        <span class="file-chunks">${file.chunksCount}</span>
      `;
      div.addEventListener('click', () => browseFileChunks(file.path, sizeKB, file.hash));
      filesList.appendChild(div);
    });
  } catch (error) {
    filesList.innerHTML = `<div class="empty-state error">Error: ${error.message}</div>`;
  }
}

// Fetch and display code chunks for a specific file inside modal
async function browseFileChunks(filePath, sizeKB, fileHash) {
  if (!activeRepoName) return;

  const listContainer = document.getElementById('chunks-modal-list');
  document.getElementById('chunks-modal-title').textContent = `File: ${filePath}`;
  document.getElementById('chunks-modal-size').textContent = `${sizeKB} KB`;
  document.getElementById('chunks-modal-hash').textContent = fileHash;

  listContainer.innerHTML = '<div class="placeholder-text">Loading chunks...</div>';
  openModal('fileChunks');

  try {
    const response = await fetch(`/api/analyzer/files/${activeRepoName}/chunks?path=${encodeURIComponent(filePath)}`);
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();

    listContainer.innerHTML = '';
    data.chunks.forEach((chunk, index) => {
      const div = document.createElement('div');
      div.className = 'chunk-box';
      
      const functionsStr = chunk.metadata.functions?.length ? chunk.metadata.functions.join(', ') : 'None';
      const classesStr = chunk.metadata.classes?.length ? chunk.metadata.classes.join(', ') : 'None';
      
      div.innerHTML = `
        <div class="chunk-header">
          <span>Chunk #${index + 1} (Lines ${chunk.startLine}-${chunk.endLine})</span>
          <span class="badge badge-info">${escapeHtml(chunk.metadata.language)}</span>
        </div>
        <pre class="chunk-code"><code>${escapeHtml(chunk.content)}</code></pre>
        <div class="chunk-metadata-badges">
          <span class="badge badge-info" style="background: rgba(124, 77, 255, 0.08); color: var(--accent-primary-hover);">Functions: ${escapeHtml(functionsStr)}</span>
          <span class="badge badge-info" style="background: rgba(0, 229, 255, 0.08); color: var(--accent-secondary-hover);">Classes: ${escapeHtml(classesStr)}</span>
        </div>
      `;
      listContainer.appendChild(div);
    });
  } catch (error) {
    listContainer.innerHTML = `<div class="placeholder-text error">Failed to load chunks: ${error.message}</div>`;
  }
}

// Poll index progress from background status endpoint
function startAnalyzerPolling(repoName) {
  if (analyzerPollingInterval) clearInterval(analyzerPollingInterval);
  
  const container = document.getElementById('analyzer-progress-container');
  const badge = document.getElementById('analyzer-status-badge');
  const message = document.getElementById('analyzer-status-message');
  const fill = document.getElementById('analyzer-progress-bar');
  
  container.classList.remove('hidden');

  analyzerPollingInterval = setInterval(async () => {
    try {
      const response = await fetch(`/api/analyzer/status/${repoName}`);
      if (!response.ok) return;
      const status = await response.json();

      message.textContent = status.message;
      fill.style.width = `${status.progress}%`;

      const statusMap = {
        'scanning': { text: 'Scanning', class: 'badge-info' },
        'caching': { text: 'Caching', class: 'badge-warning' },
        'analyzing': { text: 'Embedding', class: 'badge-info' },
        'completed': { text: 'Completed', class: 'badge-success' },
        'failed': { text: 'Failed', class: 'badge-danger' },
        'cloned': { text: 'Cloned', class: 'badge-info' }
      };

      const mapObj = statusMap[status.status] || { text: status.status, class: 'badge-info' };
      badge.textContent = mapObj.text;
      badge.className = `badge ${mapObj.class}`;

      if (status.status === 'completed') {
        clearInterval(analyzerPollingInterval);
        analyzerPollingInterval = null;
        alert('Repository analysis successfully completed!');
        loadIndexedFiles();
      } else if (status.status === 'failed') {
        clearInterval(analyzerPollingInterval);
        analyzerPollingInterval = null;
        alert(`Analysis failed: ${status.message}`);
      }
    } catch (err) {
      console.error('Error polling status:', err);
    }
  }, 1000);
}
