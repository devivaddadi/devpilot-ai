import logging
from agents.base_agent import BaseAgent
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.agents.planning")

class PlanningAgent(BaseAgent):
    """
    Agent specializing in technical project roadmaps, task breakdowns, and phase scheduling.
    """
    def __init__(self, llm_provider: LLMProvider):
        super().__init__(
            name="Planning Agent",
            description="Decomposes features, organizes backlogs, and outlines development phases.",
            llm_provider=llm_provider
        )
