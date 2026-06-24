import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/server.js';
import * as repositoryExplainerAgent from '../src/services/repositoryExplainerAgent.js';
import { mockOverrides as gatewayOverrides } from '../src/services/llmGateway.js';

describe('Repository Explainer Agent Service Suite', () => {
  afterEach(() => {
    // Clean all gateway mock overrides
    for (const key in gatewayOverrides) {
      delete gatewayOverrides[key];
    }
    // Clean all agent mock overrides
    for (const key in repositoryExplainerAgent.mockOverrides) {
      delete repositoryExplainerAgent.mockOverrides[key];
    }
  });

  describe('Input Model Validation & Sandbox Security', () => {
    test('validateInput should accept valid modes and prompts', () => {
      const payload = { mode: 'summarize_repo', prompt: 'explain repo structure' };
      const validated = repositoryExplainerAgent.validateInput(payload);
      assert.strictEqual(validated.mode, 'summarize_repo');
      assert.strictEqual(validated.prompt, 'explain repo structure');
    });

    test('validateInput should throw errors on invalid modes or missing prompt', () => {
      assert.throws(() => {
        repositoryExplainerAgent.validateInput({ mode: 'invalid_mode', prompt: 'test' });
      }, /Invalid or missing mode/);

      assert.throws(() => {
        repositoryExplainerAgent.validateInput({ mode: 'summarize_repo' });
      }, /Prompt is required/);
    });

    test('getRepoDir should protect workspace sandbox against path traversal', () => {
      assert.throws(() => {
        repositoryExplainerAgent.getRepoDir('../../outside_sandbox');
      }, /Security Error: Repository path must reside within the cloned_repos directory/);
    });
  });

  describe('Workspace Context Tools', () => {
    test('getFileListRecursive should return directory list excluding ignored folders', async () => {
      const fileTree = await repositoryExplainerAgent.tools.getFileListRecursive(process.cwd());
      assert.ok(Array.isArray(fileTree));
      
      // Make sure ignored directories do not show up
      const hasIgnoredNodeModules = fileTree.some(f => f.path.includes('node_modules/'));
      assert.strictEqual(hasIgnoredNodeModules, false);

      const hasIgnoredGit = fileTree.some(f => f.path.includes('.git/'));
      assert.strictEqual(hasIgnoredGit, false);
    });

    test('getDependenciesContent should fetch package.json content when run on workspace root', async () => {
      const depContent = await repositoryExplainerAgent.tools.getDependenciesContent(process.cwd());
      assert.ok(depContent);
      assert.match(depContent, /Dependency File \(package\.json\)/);
      assert.match(depContent, /"dependencies"/);
    });
  });

  describe('Prompt Templates Construction', () => {
    const modes = [
      'explain_folder_structure',
      'summarize_repo',
      'identify_entry_points',
      'explain_dependencies'
    ];

    modes.forEach((mode) => {
      test(`should construct valid templates for mode: ${mode}`, () => {
        let template = '';
        if (mode === 'explain_dependencies') {
          template = repositoryExplainerAgent.promptTemplates[mode]('test prompt', 'package.json details');
          assert.match(template, /package\.json details/);
        } else {
          template = repositoryExplainerAgent.promptTemplates[mode]('test prompt', [{ path: 'src/', isDir: true }]);
          assert.match(template, /src\//);
        }
        assert.match(template, /test prompt/);
        assert.match(template, /"explanation":/);
        assert.match(template, /"summary":/);
      });
    });

    test('should construct valid templates for key files architectural modes', () => {
      const archTemplate = repositoryExplainerAgent.promptTemplates.explain_architecture('explain design patterns', [], 'server.js, app.js');
      assert.match(archTemplate, /server\.js, app\.js/);
      assert.match(archTemplate, /"explanation":/);

      const modulesTemplate = repositoryExplainerAgent.promptTemplates.describe_modules('describe system systems', [], 'server.js, app.js');
      assert.match(modulesTemplate, /server\.js, app\.js/);
      assert.match(modulesTemplate, /"explanation":/);
    });
  });

  describe('Agent Running Pipeline', () => {
    test('runRepositoryExplainerAgent should run dependencies inspection and call gateway', async () => {
      let chunkResponse = '';
      let completedProvider = '';

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        assert.match(contents[0].parts[0].text, /Dependency File/);
        onChunk('{"explanation":"deps","summary":"none"}');
        onComplete('gemini');
      };

      await repositoryExplainerAgent.runRepositoryExplainerAgent(
        {
          mode: 'explain_dependencies',
          prompt: 'what third party libraries do we use?'
        },
        (chunk) => { chunkResponse += chunk; },
        (provider) => { completedProvider = provider; },
        (err) => { throw err; }
      );

      assert.strictEqual(chunkResponse, '{"explanation":"deps","summary":"none"}');
      assert.strictEqual(completedProvider, 'gemini');
    });

    test('runRepositoryExplainerAgent should handle streaming failures gracefully', async () => {
      let errorTriggered = false;

      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onError(new Error('LLM connection timeout'));
      };

      await repositoryExplainerAgent.runRepositoryExplainerAgent(
        {
          mode: 'explain_folder_structure',
          prompt: 'explain folder structure'
        },
        () => {},
        () => {},
        (err) => {
          assert.strictEqual(err.message, 'LLM connection timeout');
          errorTriggered = true;
        }
      );

      assert.ok(errorTriggered);
    });
  });

  describe('REST Endpoint SSE Integration', () => {
    test('POST /api/agent/repository-explainer/run should stream chunks successfully via SSE', async () => {
      gatewayOverrides.streamCompletion = async (contents, system, opts, onChunk, onComplete, onError) => {
        onChunk('{"explanation":"structure"}');
        onComplete('openai');
      };

      const res = await request(app)
        .post('/api/agent/repository-explainer/run')
        .send({
          mode: 'explain_folder_structure',
          prompt: 'explain folder layout'
        })
        .expect(200);

      assert.match(res.headers['content-type'], /text\/event-stream/);
      assert.match(res.text, /data:/);
      assert.match(res.text, /{"chunk":"{\\"explanation\\":\\"structure\\"}"}/);
      assert.match(res.text, /"provider":"openai"/);
      assert.match(res.text, /\[DONE\]/);
    });

    test('POST /api/agent/repository-explainer/run should return HTTP 500 error on invalid inputs', async () => {
      const res = await request(app)
        .post('/api/agent/repository-explainer/run')
        .send({
          mode: 'invalid_mode',
          prompt: 'explain layout'
        })
        .expect(500);

      assert.match(res.headers['content-type'], /application\/json/);
      assert.ok(res.body.error);
    });
  });
});
