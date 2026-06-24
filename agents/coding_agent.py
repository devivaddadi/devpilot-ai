import logging
from agents.base_agent import BaseAgent
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.agents.coding")

class CodingAgent(BaseAgent):
    """
    Agent specializing in generating, explaining, and refactoring source code.
    """
    def __init__(self, llm_provider: LLMProvider):
        super().__init__(
            name="Coding Agent",
            description="Generates, refactors, and explains source code.",
            llm_provider=llm_provider
        )
