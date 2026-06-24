import pytest
from core.llm import LLMProvider
from core.memory import ConversationMemory
from core.registry import AgentRegistry
from core.router import TaskRouter
from core.orchestrator import AgentOrchestrator

def test_orchestrator_integrated_workflow():
    llm = LLMProvider()
    registry = AgentRegistry(llm)
    router = TaskRouter(llm)
    memory = ConversationMemory()
    
    orchestrator = AgentOrchestrator(
        llm_provider=llm,
        registry=registry,
        router=router,
        memory=memory
    )
    
    # Process coding request
    result_coding = orchestrator.process_request("Generate a Python REST API using FastAPI")
    assert result_coding["routed_agent_key"] == "coding"
    assert result_coding["routed_agent_name"] == "Coding Agent"
    assert "FastAPI" in result_coding["response"] or "Coding Agent Response" in result_coding["response"]
    assert result_coding["memory_messages_count"] == 2
    
    # Process debugging request
    result_debug = orchestrator.process_request("Find the bug in this function: def f(): return 1/0")
    assert result_debug["routed_agent_key"] == "debugger"
    assert result_debug["routed_agent_name"] == "Debugger Agent"
    assert result_debug["memory_messages_count"] == 4
    
    # Verify memory context was preserved
    history = memory.get_history()
    assert history[0]["content"] == "Generate a Python REST API using FastAPI"
    assert history[2]["content"] == "Find the bug in this function: def f(): return 1/0"
