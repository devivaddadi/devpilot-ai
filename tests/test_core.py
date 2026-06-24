import pytest
from core.memory import ConversationMemory
from core.registry import AgentRegistry
from core.router import TaskRouter
from core.llm import LLMProvider

def test_conversation_memory():
    # Test memory initialization and limit pruning
    memory = ConversationMemory(max_messages=3)
    assert len(memory.get_history()) == 0
    
    memory.add_message("user", "Hello agent")
    memory.add_message("assistant", "Hi human")
    memory.add_message("user", "How are you?")
    
    history = memory.get_history()
    assert len(history) == 3
    assert history[0]["role"] == "user"
    assert history[2]["content"] == "How are you?"
    
    # Pruning check
    memory.add_message("assistant", "I am doing well")
    history_pruned = memory.get_history()
    assert len(history_pruned) == 3
    assert history_pruned[0]["role"] == "assistant"
    assert history_pruned[0]["content"] == "Hi human"
    
    # String format check
    formatted = memory.get_history_as_string()
    assert "Assistant: Hi human" in formatted
    assert "Assistant: I am doing well" in formatted

def test_agent_registry():
    llm = LLMProvider()
    registry = AgentRegistry(llm)
    
    agents = registry.list_agents()
    # Should contain 7 default agents
    assert len(agents) == 7
    
    keys = [item["key"] for item in agents]
    assert "coding" in keys
    assert "debugger" in keys
    assert "documentation" in keys
    assert "planning" in keys
    assert "repository" in keys
    assert "terminal" in keys
    assert "testing" in keys
    
    # Test retrieving agent
    coding_agent = registry.get_agent("coding")
    assert coding_agent is not None
    assert coding_agent.name == "Coding Agent"
    
    # Non-existent agent retrieval
    assert registry.get_agent("ghost") is None

def test_task_router():
    llm = LLMProvider()
    router = TaskRouter(llm)
    
    # Check rule-based routing against examples
    assert router.route("Generate a Python REST API using FastAPI") == "coding"
    assert router.route("Find the bug in this code stacktrace") == "debugger"
    assert router.route("Create README documentation for the project") == "documentation"
    assert router.route("Create roadmap for my job portal") == "planning"
    assert router.route("Explain this repository folder structure") == "repository"
    assert router.route("Why is docker container failing to start?") == "terminal"
    assert router.route("Write pytest unit tests for the oauth service") == "testing"
    
    # Test default fallback route
    assert router.route("unknown gibberish query pattern") == "coding"
