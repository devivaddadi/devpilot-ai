import * as agentRegistry from './agentRegistry.js';
import * as llmGateway from './llmGateway.js';

export const mockOverrides = {};

// --- Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Task Router] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Task Router] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Task Router] ERROR: ${msg}`, err.stack || err.message || err)
};

/**
 * Fallback keyword rules classifier
 * @param {string} prompt 
 * @param {Array<Object>} availableAgents 
 * @returns {Object}
 */
export function ruleBasedSelection(prompt, availableAgents) {
  const promptLower = prompt.toLowerCase();

  // 1. Prompt Optimizer
  if (promptLower.includes('prompt') || promptLower.includes('optimizer') || promptLower.includes('rewrite') || promptLower.includes('simplify')) {
    if (availableAgents.some(a => a.name === 'promptOptimizerAgent')) {
      return { agentName: 'promptOptimizerAgent', mode: 'rewrite', reasoning: 'Rule-based match for prompt/rewrite keywords.' };
    }
  }

  // 2. PR Reviewer
  if (promptLower.includes('pr ') || promptLower.includes('pull request') || promptLower.includes('review') || promptLower.includes('diff')) {
    if (availableAgents.some(a => a.name === 'pullRequestReviewAgent')) {
      return { agentName: 'pullRequestReviewAgent', mode: 'review_changed_files', reasoning: 'Rule-based match for PR/review/diff keywords.' };
    }
  }

  // 3. Terminal Assistant
  if (promptLower.includes('terminal') || promptLower.includes('shell') || promptLower.includes('docker') || promptLower.includes('git')) {
    if (availableAgents.some(a => a.name === 'terminalAssistantAgent')) {
      return { agentName: 'terminalAssistantAgent', mode: 'generate_command', reasoning: 'Rule-based match for terminal/shell/docker/git keywords.' };
    }
  }

  // 4. Debugger Agent
  if (promptLower.includes('debug') || promptLower.includes('error') || promptLower.includes('exception') || promptLower.includes('crash') || promptLower.includes('stack')) {
    if (availableAgents.some(a => a.name === 'debuggerAgent')) {
      return { agentName: 'debuggerAgent', mode: 'analyze_exception', reasoning: 'Rule-based match for debug/error/crash keywords.' };
    }
  }

  // 5. Repository Explainer
  if (promptLower.includes('folder') || promptLower.includes('structure') || promptLower.includes('architecture') || promptLower.includes('dependency') || promptLower.includes('entry point')) {
    if (availableAgents.some(a => a.name === 'repositoryExplainerAgent')) {
      return { agentName: 'repositoryExplainerAgent', mode: 'explain_folder_structure', reasoning: 'Rule-based match for folder/structure/architecture keywords.' };
    }
  }

  // 6. Documentation Agent
  if (promptLower.includes('documentation') || promptLower.includes('readme') || promptLower.includes('comments') || promptLower.includes('docstring')) {
    if (availableAgents.some(a => a.name === 'documentationAgent')) {
      return { agentName: 'documentationAgent', mode: 'readme', reasoning: 'Rule-based match for documentation/readme keywords.' };
    }
  }

  // 7. Planning Agent
  if (promptLower.includes('plan') || promptLower.includes('milestone') || promptLower.includes('roadmap') || promptLower.includes('task')) {
    if (availableAgents.some(a => a.name === 'planningAgent')) {
      return { agentName: 'planningAgent', mode: 'convert_idea_to_tasks', reasoning: 'Rule-based match for plan/task/roadmap keywords.' };
    }
  }

  // 8. Coding Agent (Fallback default)
  if (availableAgents.some(a => a.name === 'codingAgent')) {
    return { agentName: 'codingAgent', mode: 'generate', reasoning: 'Default rule match for generic code tasks.' };
  }

  // Final fallback
  if (availableAgents.length > 0) {
    return { agentName: availableAgents[0].name, mode: availableAgents[0].modes?.[0] || 'default', reasoning: 'Fallback to first available registered agent.' };
  }

  throw new Error('No agents available in the registry to route the task to.');
}

/**
 * Route user task intent to the most appropriate agent dynamically
 * @param {string} prompt 
 * @param {boolean} [forceRules=false] 
 * @returns {Promise<Object>}
 */
export async function routeTask(prompt, forceRules = false) {
  if (mockOverrides.routeTask) {
    return mockOverrides.routeTask(prompt, forceRules);
  }

  // 1. Load agents list
  let availableAgents = agentRegistry.listAgents();
  if (availableAgents.length === 0) {
    logger.info('Registry is empty. Pre-loading agents list...');
    await agentRegistry.discoverAgents();
    availableAgents = agentRegistry.listAgents();
  }

  if (forceRules) {
    logger.info('Rules classification override active.');
    return ruleBasedSelection(prompt, availableAgents);
  }

  logger.info(`Analyzing intent for prompt: "${prompt}"...`);

  // 2. Build LLM prompt instructions containing dynamic registry catalog
  const systemInstruction = 'You are the DevPilot AI Task Router. Your job is to classify the user\'s prompt, select the single most appropriate agent from the list of available agents, select its matching execution mode, and provide reasoning. You ONLY respond with valid JSON.';

  const agentsDescription = availableAgents.map(a => 
    `- Agent Name: "${a.name}"\n  Description: ${a.description}\n  Supported Modes: [${a.modes.join(', ')}]`
  ).join('\n\n');

  const userPrompt = `
Available Agents:
${agentsDescription}

User Prompt: "${prompt}"

Format your response strictly as a JSON object:
{
  "agentName": "SELECTED_AGENT_NAME",
  "mode": "SELECTED_MODE",
  "reasoning": "Reason why this agent and mode are the best match."
}
`;

  const contents = [
    { role: 'user', parts: [{ text: userPrompt }] }
  ];

  let completionText = '';

  try {
    await new Promise((resolve, reject) => {
      llmGateway.streamCompletion(
        contents,
        systemInstruction,
        { forceMock: true }, // Auto fallback to mock completions if API keys are missing in tests
        (chunk) => {
          completionText += chunk;
        },
        () => resolve(),
        (err) => reject(err)
      );
    });

    const decision = JSON.parse(completionText.trim());

    // Validation guard: Verify selected agent is actually registered
    if (!availableAgents.some(a => a.name === decision.agentName)) {
      logger.warn(`LLM selected unregistered agent: ${decision.agentName}. Falling back to rule-based classification...`);
      return ruleBasedSelection(prompt, availableAgents);
    }

    return decision;

  } catch (err) {
    logger.warn(`LLM classification failed: ${err.message}. Falling back to rule-based classification...`);
    return ruleBasedSelection(prompt, availableAgents);
  }
}
