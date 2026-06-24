import logging
from agents.base_agent import BaseAgent
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.agents.repository")

class RepositoryExplainer(BaseAgent):
    """
    Agent specializing in directory mapping, system flow tracking, and architectural explanations.
    """
    def __init__(self, llm_provider: LLMProvider):
        super().__init__(
            name="Repository Explainer Agent",
            description="Explains folder layouts, tracks integration interfaces, and catalogues files.",
            llm_provider=llm_provider
        )
