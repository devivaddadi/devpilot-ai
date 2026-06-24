import logging
from agents.base_agent import BaseAgent
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.agents.debugger")

class DebuggerAgent(BaseAgent):
    """
    Agent specializing in code analysis, runtime errors diagnostics, and bug fixing.
    """
    def __init__(self, llm_provider: LLMProvider):
        super().__init__(
            name="Debugger Agent",
            description="Analyzes code errors, explains exceptions, and proposes bug fixes.",
            llm_provider=llm_provider
        )
