import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as agentRegistry from '../src/services/agentRegistry.js';
import * as taskRouter from '../src/services/taskRouter.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Task Router Service Suite', () => {
  beforeEach(async () => {
    agentRegistry.clearRegistry();
    // Register mock available agents
    agentRegistry.registerAgent('codingAgent', { description: 'Code generator', modes: ['generate', 'refactor'] });
    agentRegistry.registerAgent('promptOptimizerAgent', { description: 'Optimizer', modes: ['rewrite'] });
    agentRegistry.registerAgent('pullRequestReviewAgent', { description: 'PR reviewer', modes: ['review_changed_files'] });
    agentRegistry.registerAgent('terminalAssistantAgent', { description: 'Terminal expert', modes: ['generate_command'] });
    agentRegistry.registerAgent('debuggerAgent', { description: 'Debugger expert', modes: ['analyze_exception'] });
    agentRegistry.registerAgent('repositoryExplainerAgent', { description: 'Explainer expert', modes: ['explain_folder_structure'] });
    agentRegistry.registerAgent('documentationAgent', { description: 'Docs writer', modes: ['readme'] });
    agentRegistry.registerAgent('planningAgent', { description: 'Planner planner', modes: ['convert_idea_to_tasks'] });
  });

  afterEach(async () => {
    agentRegistry.clearRegistry();
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    for (const key in taskRouter.mockOverrides) {
      delete taskRouter.mockOverrides[key];
    }
  });

  describe('Rule-Based Intent Selection', () => {
    test('should resolve rewrite keywords to promptOptimizerAgent', () => {
      const decision = taskRouter.ruleBasedSelection('rewrite my instruction prompt', agentRegistry.listAgents());
      assert.strictEqual(decision.agentName, 'promptOptimizerAgent');
      assert.strictEqual(decision.mode, 'rewrite');
    });

    test('should resolve git/docker/terminal keywords to terminalAssistantAgent', () => {
      const decision = taskRouter.ruleBasedSelection('give me a docker run command', agentRegistry.listAgents());
      assert.strictEqual(decision.agentName, 'terminalAssistantAgent');
      assert.strictEqual(decision.mode, 'generate_command');
    });

    test('should resolve debug/error/crash keywords to debuggerAgent', () => {
      const decision = taskRouter.ruleBasedSelection('why did my application crash with TypeError', agentRegistry.listAgents());
      assert.strictEqual(decision.agentName, 'debuggerAgent');
      assert.strictEqual(decision.mode, 'analyze_exception');
    });

    test('should resolve structure/folder keywords to repositoryExplainerAgent', () => {
      const decision = taskRouter.ruleBasedSelection('explain folder layout', agentRegistry.listAgents());
      assert.strictEqual(decision.agentName, 'repositoryExplainerAgent');
      assert.strictEqual(decision.mode, 'explain_folder_structure');
    });

    test('should resolve pr/diff/pull request keywords to pullRequestReviewAgent', () => {
      const decision = taskRouter.ruleBasedSelection('review my git diff changes', agentRegistry.listAgents());
      assert.strictEqual(decision.agentName, 'pullRequestReviewAgent');
      assert.strictEqual(decision.mode, 'review_changed_files');
    });
  });

  describe('LLM Routing Pipeline', () => {
    test('routeTask should select agent via LLM when execution succeeds', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk(JSON.stringify({
          agentName: 'codingAgent',
          mode: 'refactor',
          reasoning: 'matches code patterns'
        }));
        onComplete('gemini');
      };

      const decision = await taskRouter.routeTask('refactor this function');
      assert.strictEqual(decision.agentName, 'codingAgent');
      assert.strictEqual(decision.mode, 'refactor');
    });

    test('routeTask should fallback to ruleBasedSelection if LLM selects unregistered agent', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk(JSON.stringify({
          agentName: 'unregisteredAgent',
          mode: 'some_mode',
          reasoning: 'unregistered reasoning'
        }));
        onComplete('gemini');
      };

      // Query containing git keyword (should match terminalAssistantAgent)
      const decision = await taskRouter.routeTask('give me a git rebase command');
      assert.strictEqual(decision.agentName, 'terminalAssistantAgent');
      assert.strictEqual(decision.mode, 'generate_command');
    });

    test('routeTask should fallback to ruleBasedSelection if LLM throws error', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onError(new Error('Syntax parsing error'));
      };

      // Query containing debug keyword (should match debuggerAgent)
      const decision = await taskRouter.routeTask('fix this crash trace');
      assert.strictEqual(decision.agentName, 'debuggerAgent');
      assert.strictEqual(decision.mode, 'analyze_exception');
    });
  });

  describe('REST Router Integration', () => {
    test('POST /api/task-router/route should return selected agent and mode decisions', async () => {
      const res = await request(app)
        .post('/api/task-router/route')
        .send({
          prompt: 'optimize my prompt instruction',
          forceRules: true
        })
        .expect(200);

      assert.strictEqual(res.body.agentName, 'promptOptimizerAgent');
      assert.strictEqual(res.body.mode, 'rewrite');
    });

    test('POST /api/task-router/route should return 400 bad request if prompt is missing', async () => {
      await request(app)
        .post('/api/task-router/route')
        .send({})
        .expect(400);
    });
  });
});
