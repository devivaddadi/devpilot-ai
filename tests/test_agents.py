import pytest
from core.llm import LLMProvider
from agents.coding_agent import CodingAgent
from agents.debugger_agent import DebuggerAgent
from agents.documentation_agent import DocumentationAgent
from agents.planning_agent import PlanningAgent
from agents.repository_explainer import RepositoryExplainer
from agents.terminal_assistant import TerminalAssistant
from agents.testing_agent import TestingAgent

def test_agents_loading():
    llm = LLMProvider()
    
    coding = CodingAgent(llm)
    assert coding.name == "Coding Agent"
    assert "expert software developer" in coding.system_prompt
    
    debugger = DebuggerAgent(llm)
    assert debugger.name == "Debugger Agent"
    assert "finding bugs and fixing code" in debugger.system_prompt
    
    doc = DocumentationAgent(llm)
    assert doc.name == "Documentation Agent"
    assert "expert technical writer" in doc.system_prompt
    
    planning = PlanningAgent(llm)
    assert planning.name == "Planning Agent"
    assert "seasoned software architect" in planning.system_prompt
    
    repo = RepositoryExplainer(llm)
    assert repo.name == "Repository Explainer Agent"
    assert "explain directory structures" in repo.system_prompt
    
    terminal = TerminalAssistant(llm)
    assert terminal.name == "Terminal Assistant Agent"
    assert "systems administrator" in terminal.system_prompt
    
    testing = TestingAgent(llm)
    assert testing.name == "Testing Agent"
    assert "software quality engineer" in testing.system_prompt

def test_agent_execution_offline():
    llm = LLMProvider()
    coding = CodingAgent(llm)
    
    # Run agent in offline mode and check if response is generated successfully
    response = coding.run("Create a quick python function to add two numbers")
    assert response is not None
    assert "Coding Agent Response" in response or "processed" in response or "def" in response
