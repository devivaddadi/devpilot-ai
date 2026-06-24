import os
import sys
import logging
import argparse
from typing import Dict, Any
from dotenv import load_dotenv

# Ensure UTF-8 output encoding on Windows consoles to prevent UnicodeEncodeErrors
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Load environment variables from .env
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
# Reduce verbose logging from third party libs
logging.getLogger("httpx").setLevel(logging.WARNING)

from core.llm import LLMProvider
from core.memory import ConversationMemory
from core.registry import AgentRegistry
from core.router import TaskRouter
from core.orchestrator import AgentOrchestrator

# Setup console colors
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
MAGENTA = "\033[95m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def print_banner(llm_mode: str):
    banner = f"""
{BLUE}{BOLD}=============================================================
             ⚡ DEVPILOT AI: MULTI-AGENT COPILOT ⚡
============================================================={RESET}
{CYAN}Status: Active{RESET}
{CYAN}LLM Execution Engine: {BOLD}{llm_mode.upper()}{RESET}
{CYAN}Usage:{RESET}
  - Type your request and press Enter.
  - Type {YELLOW}'help'{RESET} to see registered agents and commands.
  - Type {YELLOW}'clear'{RESET} to clear conversation memory.
  - Type {YELLOW}'exit'{RESET} or {YELLOW}'quit'{RESET} to stop.
=============================================================
"""
    print(banner)

def print_help(registry: AgentRegistry):
    print(f"\n{BOLD}Registered System Agents:{RESET}")
    for agent in registry.list_agents():
        print(f"  • {GREEN}{agent['name']}{RESET} ({CYAN}{agent['key']}{RESET}): {agent['description']}")
    print("")

def run_demo(orchestrator: AgentOrchestrator):
    """
    Executes a structured batch run showing the 6 required demo scenarios.
    """
    demo_requests = [
        {
            "category": "1. Coding Request",
            "prompt": "Generate a Python REST API using FastAPI"
        },
        {
            "category": "2. Debugging Request",
            "prompt": "Find the bug in this code:\n\ndef calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\nprint(calculate_average([]))"
        },
        {
            "category": "3. Documentation Request",
            "prompt": "Create a professional README.md structure for DevPilot AI"
        },
        {
            "category": "4. Planning Request",
            "prompt": "Create a phased engineering roadmap for building a job portal"
        },
        {
            "category": "5. Repository Explanation Request",
            "prompt": "Explain the folder structure and architectural components of the devpilot-ai repository"
        },
        {
            "category": "6. Terminal Assistance Request",
            "prompt": "Why is docker container failing to start with port bind error on 80?"
        }
    ]

    print(f"\n{BLUE}{BOLD}=== RUNNING DEVPILOT AI DEMO SUITE ==={RESET}")
    print(f"{CYAN}Processing {len(demo_requests)} test scenarios...{RESET}\n")

    for i, req in enumerate(demo_requests, 1):
        print(f"{MAGENTA}{BOLD}------------------------------------------------------------{RESET}")
        print(f"{MAGENTA}{BOLD}Scenario {req['category']}{RESET}")
        print(f"{BOLD}User request:{RESET} {req['prompt']}")
        print(f"{MAGENTA}{BOLD}------------------------------------------------------------{RESET}")
        
        # Process the request
        result = orchestrator.process_request(req["prompt"])
        
        print(f"\n{GREEN}{BOLD}[Task Router]{RESET} Routed to Agent: {BOLD}{result['routed_agent_name']}{RESET} (key: {result['routed_agent_key']})")
        print(f"{GREEN}{BOLD}[Conversation Memory]{RESET} History size: {result['memory_messages_count']} messages")
        print(f"\n{CYAN}{BOLD}[Agent Output]{RESET}\n")
        print(result["response"])
        print("\n")

    print(f"{BLUE}{BOLD}=== DEMO SUITE COMPLETED SUCCESSFULLY ==={RESET}\n")

def main():
    parser = argparse.ArgumentParser(description="DevPilot AI Multi-Agent CLI")
    parser.add_argument("--demo", action="store_true", help="Run the automated 6-step developer request demo")
    args = parser.parse_args()

    # Initialize Core Pipeline
    llm_provider = LLMProvider()
    registry = AgentRegistry(llm_provider)
    router = TaskRouter(llm_provider)
    memory = ConversationMemory()
    orchestrator = AgentOrchestrator(llm_provider, registry, router, memory)

    if args.demo:
        run_demo(orchestrator)
        sys.exit(0)

    # REPL interactive loop
    print_banner(llm_provider.mode)
    
    while True:
        try:
            user_input = input(f"{BOLD}DevPilot>{RESET} ").strip()
            if not user_input:
                continue
            
            # CLI Commands
            if user_input.lower() in ("exit", "quit"):
                print(f"\n{BLUE}Goodbye! Thank you for using DevPilot AI.{RESET}")
                break
                
            elif user_input.lower() == "help":
                print_help(registry)
                continue
                
            elif user_input.lower() == "clear":
                memory.clear()
                print(f"{GREEN}Conversation history cleared successfully.{RESET}\n")
                continue

            # Process prompt
            print(f"{CYAN}Thinking...{RESET}")
            result = orchestrator.process_request(user_input)
            
            # Print routing information
            print(f"\n{GREEN}🤖 {result['routed_agent_name']} selected for execution.{RESET}")
            print(f"{BLUE}============================================================={RESET}")
            print(result["response"])
            print(f"{BLUE}============================================================={RESET}\n")

        except KeyboardInterrupt:
            print(f"\n\n{BLUE}Goodbye! Thank you for using DevPilot AI.{RESET}")
            break
        except Exception as e:
            print(f"\n{RED}Error processing request: {e}{RESET}\n")

if __name__ == "__main__":
    main()
