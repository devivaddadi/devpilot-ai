import os
import logging
from abc import ABC, abstractmethod
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.agents.base")

class BaseAgent(ABC):
    """
    Abstract base class for all developer agent personas.
    """
    def __init__(self, name: str, description: str, llm_provider: LLMProvider):
        self.name = name
        self.description = description
        self.llm_provider = llm_provider
        self.system_prompt = self._load_prompt()

    def _load_prompt(self) -> str:
        """
        Loads the system prompt from the prompts/ directory based on agent name.
        If file doesn't exist, returns a basic fallback.
        """
        # Convert "Coding Agent" -> "coding.txt"
        file_name = self.name.lower().split(" ")[0] + ".txt"
        # Since project root contains prompts/, resolve prompts/file_name relative to root
        # Let's find project root
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        prompt_path = os.path.join(root_dir, "prompts", file_name)
        
        if os.path.exists(prompt_path):
            try:
                with open(prompt_path, "r", encoding="utf-8") as f:
                    prompt = f.read().strip()
                    logger.debug(f"Loaded prompt template for {self.name} from {prompt_path}")
                    return prompt
            except Exception as e:
                logger.error(f"Failed to read prompt template file {prompt_path}: {e}")
        
        logger.warning(f"Prompt template for {self.name} not found at {prompt_path}. Using fallback system prompt.")
        return f"You are the {self.name}. Description: {self.description}."

    def run(self, prompt: str, memory_context: str = "") -> str:
        """
        Run the agent with the user prompt and conversation history memory.
        """
        logger.info(f"Running agent: {self.name}")
        
        # Inject memory context if available
        full_prompt = prompt
        if memory_context:
            full_prompt = f"### CONVERSATION HISTORY CONTEXT\n{memory_context}\n\n### CURRENT REQUEST\n{prompt}"
            
        return self.llm_provider.generate(full_prompt, system_instruction=self.system_prompt)
