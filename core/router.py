import logging
from typing import Dict, Optional
from core.llm import LLMProvider

logger = logging.getLogger("devpilot.core.router")

class TaskRouter:
    """
    Classifies incoming developer requests and routes them to the appropriate agent.
    Uses rule-based classification as a fast/offline fallback, and semantic LLM classification.
    """
    def __init__(self, llm_provider: LLMProvider):
        self.llm_provider = llm_provider
        
        # Tier 1: Technologies & Platforms (Strictest match - override generic errors/actions)
        self.tier1_mapping: Dict[str, str] = {
            "docker": "terminal",
            "git": "terminal",
            "npm": "terminal",
            "pip": "terminal",
            "powershell": "terminal",
            "bash": "terminal",
            "fastapi": "coding",
            "flask": "coding"
        }
        
        # Tier 2: Specific Action & Agent Nouns (Debugger verbs, Doc terms, Planning roadmaps, etc.)
        self.tier2_mapping: Dict[str, str] = {
            # Debugger
            "bug": "debugger",
            "fix": "debugger",
            "debug": "debugger",
            "error": "debugger",
            "exception": "debugger",
            "failing": "debugger",
            "crash": "debugger",
            "broken": "debugger",
            
            # Documentation
            "readme": "documentation",
            "docstring": "documentation",
            "documentation": "documentation",
            "wiki": "documentation",
            
            # Planning
            "roadmap": "planning",
            "milestone": "planning",
            "architecture blueprint": "planning",
            
            # Repository Explainer
            "folder structure": "repository",
            "directory structure": "repository",
            "explain repo": "repository",
            "codebase layout": "repository"
        }
        
        # Tier 3: Generic developer verbs and nouns
        self.tier3_mapping: Dict[str, str] = {
            # Coding
            "generate": "coding",
            "write code": "coding",
            "build code": "coding",
            "implement": "coding",
            "refactor": "coding",
            "rest api": "coding",
            "code": "coding",
            
            # Documentation
            "document": "documentation",
            "comment": "documentation",
            
            # Planning
            "plan": "planning",
            "breakdown": "planning",
            "epic": "planning",
            
            # Repository Explainer
            "repo": "repository",
            "repository": "repository",
            "folder": "repository",
            "directory": "repository",
            "structure": "repository",
            "layout": "repository",
            "codebase": "repository",
            
            # Terminal Assistant
            "command": "terminal",
            "terminal": "terminal",
            "shell": "terminal"
        }

    def route(self, prompt: str) -> str:
        """
        Routes the prompt to the best agent.
        Returns the agent key string (e.g. 'coding', 'debugger').
        """
        # Try deterministic keyword route first (very robust & offline compatible)
        keyword_route = self._check_keywords(prompt)
        if keyword_route:
            logger.info(f"Routed request to '{keyword_route}' using keyword rule-match.")
            return keyword_route

        # Fallback to LLM semantic routing if online, otherwise default to 'coding'
        if self.llm_provider.mode != "offline":
            semantic_route = self._query_llm_route(prompt)
            if semantic_route:
                logger.info(f"Routed request to '{semantic_route}' using LLM semantic routing.")
                return semantic_route

        # Standard fallback agent
        logger.info("Defaulting route to 'coding' agent.")
        return "coding"

    def route_detailed(self, prompt: str) -> Dict[str, Any]:
        """
        Routes the prompt to the best agent and returns explanation details.
        """
        prompt_lower = prompt.lower()
        
        # Tier 1
        sorted_t1 = sorted(self.tier1_mapping.keys(), key=len, reverse=True)
        for keyword in sorted_t1:
            if keyword in prompt_lower:
                return {
                    "agent": self.tier1_mapping[keyword],
                    "method": "Keyword Matching",
                    "tier": "Tier 1: Technologies & Platforms",
                    "matched_keyword": keyword,
                    "explanation": f"Matched tool/technology '{keyword}' which maps directly to the '{self.tier1_mapping[keyword]}' agent."
                }
                
        # Tier 2
        sorted_t2 = sorted(self.tier2_mapping.keys(), key=len, reverse=True)
        for keyword in sorted_t2:
            if keyword in prompt_lower:
                return {
                    "agent": self.tier2_mapping[keyword],
                    "method": "Keyword Matching",
                    "tier": "Tier 2: Actions & Agent Nouns",
                    "matched_keyword": keyword,
                    "explanation": f"Matched specific action/noun '{keyword}' which maps directly to the '{self.tier2_mapping[keyword]}' agent."
                }
                
        # Tier 3
        sorted_t3 = sorted(self.tier3_mapping.keys(), key=len, reverse=True)
        for keyword in sorted_t3:
            if keyword in prompt_lower:
                return {
                    "agent": self.tier3_mapping[keyword],
                    "method": "Keyword Matching",
                    "tier": "Tier 3: Generic Developer Verbs/Nouns",
                    "matched_keyword": keyword,
                    "explanation": f"Matched generic developer verb/noun '{keyword}' which maps directly to the '{self.tier3_mapping[keyword]}' agent."
                }
                
        # Fallback to LLM semantic routing
        if self.llm_provider.mode != "offline":
            semantic_route = self._query_llm_route(prompt)
            if semantic_route:
                return {
                    "agent": semantic_route,
                    "method": "LLM Semantic Analysis",
                    "tier": "N/A (Semantic fallback)",
                    "matched_keyword": None,
                    "explanation": f"No keywords matched. LLM classified query semantically to the '{semantic_route}' agent."
                }
                
        # Default fallback
        return {
            "agent": "coding",
            "method": "Default Fallback",
            "tier": "N/A (Standard fallback)",
            "matched_keyword": None,
            "explanation": "No keywords matched and system is offline or LLM routing failed. Defaulted to the 'coding' agent."
        }

    def _check_keywords(self, prompt: str) -> Optional[str]:
        """Checks for keyword occurrences inside the user prompt."""
        prompt_lower = prompt.lower()
        
        # Tier 1: Check tools & frameworks first
        sorted_t1 = sorted(self.tier1_mapping.keys(), key=len, reverse=True)
        for keyword in sorted_t1:
            if keyword in prompt_lower:
                return self.tier1_mapping[keyword]
                
        # Tier 2: Check highly specific action words
        sorted_t2 = sorted(self.tier2_mapping.keys(), key=len, reverse=True)
        for keyword in sorted_t2:
            if keyword in prompt_lower:
                return self.tier2_mapping[keyword]
                
        # Tier 3: Check generic fallback developer terms
        sorted_t3 = sorted(self.tier3_mapping.keys(), key=len, reverse=True)
        for keyword in sorted_t3:
            if keyword in prompt_lower:
                return self.tier3_mapping[keyword]
                
        return None

    def _query_llm_route(self, prompt: str) -> Optional[str]:
        """Asks the LLM to classify the query semantically."""
        system_instruction = (
            "You are the Task Router for DevPilot AI. Your job is to classify developer requests "
            "into one of these exact keys: 'coding', 'debugger', 'documentation', 'planning', "
            "'repository', 'terminal'. Return ONLY the single key name in lowercase, with no explanation or markup."
        )
        
        user_prompt = f"Classify this developer request: '{prompt}'"
        
        try:
            response = self.llm_provider.generate(user_prompt, system_instruction=system_instruction)
            cleaned = response.strip().lower()
            
            # Verify response is valid
            valid_keys = {"coding", "debugger", "documentation", "planning", "repository", "terminal"}
            for key in valid_keys:
                if key in cleaned:
                    return key
        except Exception as e:
            logger.warning(f"Semantic routing failed: {e}")
        
        return None
