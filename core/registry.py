import logging
from typing import Dict, List, Optional
from agents.base_agent import BaseAgent
from agents.coding_agent import CodingAgent
from agents.debugger_agent import DebuggerAgent
from agents.documentation_agent import DocumentationAgent
from agents.planning_agent import PlanningAgent
from agents.repository_explainer import RepositoryExplainer
from agents.terminal_assistant import TerminalAssistant
from agents.testing_agent import TestingAgent
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.core.registry")

class AgentRegistry:
    """
    Registry to manage and discover active Developer Agents in DevPilot AI.
    """
    def __init__(self, llm_provider: LLMProvider):
        self.llm_provider = llm_provider
        self._agents: Dict[str, BaseAgent] = {}
        self._register_default_agents()

    def register(self, key: str, agent: BaseAgent) -> None:
        """Register a new agent instance under a specific key."""
        self._agents[key] = agent
        logger.info(f"Registered agent '{key}': {agent.name}")

    def get_agent(self, key: str) -> Optional[BaseAgent]:
        """Retrieve an agent instance by key."""
        return self._agents.get(key)

    def list_agents(self) -> List[Dict[str, str]]:
        """Return a catalog of registered agent keys and their metadata descriptions."""
        return [
            {
                "key": key,
                "name": agent.name,
                "description": agent.description
            }
            for key, agent in self._agents.items()
        ]

    def get_all_agents(self) -> Dict[str, BaseAgent]:
        """Return a mapping of all registered keys to agent instances."""
        return self._agents

    def _register_default_agents(self) -> None:
        """Register the 7 default specialized developer agents."""
        self.register("coding", CodingAgent(self.llm_provider))
        self.register("debugger", DebuggerAgent(self.llm_provider))
        self.register("documentation", DocumentationAgent(self.llm_provider))
        self.register("planning", PlanningAgent(self.llm_provider))
        self.register("repository", RepositoryExplainer(self.llm_provider))
        self.register("terminal", TerminalAssistant(self.llm_provider))
        self.register("testing", TestingAgent(self.llm_provider))
