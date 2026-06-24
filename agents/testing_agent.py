import logging
from agents.base_agent import BaseAgent
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.agents.testing")

class TestingAgent(BaseAgent):
    """
    Agent specializing in generating, structuring, and running unit and integration tests.
    """
    __test__ = False
    
    def __init__(self, llm_provider: LLMProvider):
        super().__init__(
            name="Testing Agent",
            description="Generates unit tests, test cases, and help improve code test coverage.",
            llm_provider=llm_provider
        )
