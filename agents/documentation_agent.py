import logging
from agents.base_agent import BaseAgent
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.agents.documentation")

class DocumentationAgent(BaseAgent):
    """
    Agent specializing in writing code docstrings, system documentation, and repository guides.
    """
    def __init__(self, llm_provider: LLMProvider):
        super().__init__(
            name="Documentation Agent",
            description="Generates READMEs, project wikis, and standard source docstrings.",
            llm_provider=llm_provider
        )
