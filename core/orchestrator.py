import logging
from typing import Dict, Any
from core.llm import LLMProvider
from core.memory import ConversationMemory
from core.registry import AgentRegistry
from core.router import TaskRouter

logger = logging.getLogger("devpilot.core.orchestrator")

class AgentOrchestrator:
    """
    Main orchestrator for DevPilot AI. Connects routing, memory, registry, and execution.
    """
    def __init__(
        self,
        llm_provider: LLMProvider,
        registry: AgentRegistry,
        router: TaskRouter,
        memory: ConversationMemory
    ):
        self.llm_provider = llm_provider
        self.registry = registry
        self.router = router
        self.memory = memory

    def process_request(self, prompt: str) -> Dict[str, Any]:
        """
        Processes a developer prompt through the full multi-agent pipeline.
        
        Workflow:
        User Request -> Task Router -> Select Agent -> Load Memory -> Execute -> Save Memory -> Return Response
        """
        logger.info(f"Received request: '{prompt[:60]}...'")
        
        # 1. Route the task to the correct agent key with detailed information
        routing_details = self.router.route_detailed(prompt)
        agent_key = routing_details["agent"]
        
        # 2. Retrieve agent instance from registry
        agent = self.registry.get_agent(agent_key)
        if not agent:
            logger.error(f"Agent key '{agent_key}' resolved but not found in registry. Falling back to base coding agent.")
            agent = self.registry.get_agent("coding")
            agent_key = "coding"
            
        # 3. Pull conversation context from memory
        memory_context = self.memory.get_history_as_string()
        
        # 4. Execute the agent
        logger.info(f"Executing agent '{agent_key}' ({agent.name})...")
        response = agent.run(prompt, memory_context=memory_context)
        
        # 5. Update memory with user request and agent response
        self.memory.add_message(role="user", content=prompt)
        self.memory.add_message(role="assistant", content=response)
        
        # 6. Build structured response metadata
        result = {
            "routed_agent_key": agent_key,
            "routed_agent_name": agent.name,
            "response": response,
            "memory_messages_count": len(self.memory.get_history()),
            "routing_details": routing_details
        }
        
        logger.info("Request processed successfully.")
        return result
