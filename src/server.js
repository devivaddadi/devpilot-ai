import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import githubRoutes from './routes/githubRoutes.js';
import analyzerRoutes from './routes/analyzerRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import llmRoutes from './routes/llmRoutes.js';
import codingAgentRoutes from './routes/codingAgentRoutes.js';
import documentationAgentRoutes from './routes/documentationAgentRoutes.js';
import debuggerAgentRoutes from './routes/debuggerAgentRoutes.js';
import planningAgentRoutes from './routes/planningAgentRoutes.js';
import promptOptimizerAgentRoutes from './routes/promptOptimizerAgentRoutes.js';
import repositoryExplainerAgentRoutes from './routes/repositoryExplainerAgentRoutes.js';
import pullRequestReviewAgentRoutes from './routes/pullRequestReviewAgentRoutes.js';
import terminalAssistantAgentRoutes from './routes/terminalAssistantAgentRoutes.js';
import conversationMemoryRoutes from './routes/conversationMemoryRoutes.js';
import agentRegistryRoutes from './routes/agentRegistryRoutes.js';
import * as agentRegistry from './services/agentRegistry.js';
import taskRouterRoutes from './routes/taskRouterRoutes.js';
import agentOrchestratorRoutes from './routes/agentOrchestratorRoutes.js';
import promptManagerRoutes from './routes/promptManagerRoutes.js';
import sharedToolLayerRoutes from './routes/sharedToolLayerRoutes.js';
import agentWorkflowRoutes from './routes/agentWorkflowRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Capture raw body for GitHub Webhook HMAC verification before body parsers run
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use('/api/github', githubRoutes);
app.use('/api/analyzer', analyzerRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/agent/coding', codingAgentRoutes);
app.use('/api/agent/documentation', documentationAgentRoutes);
app.use('/api/agent/debugger', debuggerAgentRoutes);
app.use('/api/agent/planning', planningAgentRoutes);
app.use('/api/agent/prompt-optimizer', promptOptimizerAgentRoutes);
app.use('/api/agent/repository-explainer', repositoryExplainerAgentRoutes);
app.use('/api/agent/pull-request-review', pullRequestReviewAgentRoutes);
app.use('/api/agent/terminal-assistant', terminalAssistantAgentRoutes);
app.use('/api/memory', conversationMemoryRoutes);
app.use('/api/agent-registry', agentRegistryRoutes);
app.use('/api/task-router', taskRouterRoutes);
app.use('/api/orchestrator', agentOrchestratorRoutes);
app.use('/api/prompt-manager', promptManagerRoutes);
app.use('/api/shared-tools', sharedToolLayerRoutes);
app.use('/api/workflow', agentWorkflowRoutes);

// Fallback HTML page routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start listening if not running in a test environment
const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT || process.execArgv.some(arg => arg.startsWith('--test'));
if (!isTest) {
  // Pre-load dynamic agent registry on server start
  agentRegistry.discoverAgents().catch(err => console.error('Startup agent discovery failed:', err));

  app.listen(config.port, () => {
    console.log(`=================================================`);
    console.log(`🚀 devpilot-ai GitHub Integration Server Running`);
    console.log(`🔗 Local Address: http://localhost:${config.port}`);
    console.log(`=================================================`);
  });
}

export default app;
