import logging
from agents.base_agent import BaseAgent
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.agents.terminal")

class TerminalAssistant(BaseAgent):
    """
    Agent specializing in shell syntax explanation, Git/Docker command assistance, and console debugging.
    """
    def __init__(self, llm_provider: LLMProvider):
        super().__init__(
            name="Terminal Assistant Agent",
            description="Recommends shell scripts, helps with container management, and fixes script failures.",
            llm_provider=llm_provider
        )
