# DevPilot AI: Multi-Agent Developer Copilot 🚀

DevPilot AI is a Python-based, multi-agent developer assistant that decomposes, classifies, and coordinates specialized developer agent personas to help software engineers with day-to-day tasks. It is designed to be lightweight, modular, and fully functional out-of-the-box.

The project features a **Zero-Configuration Fallback (Offline Mode)**, allowing the agents to generate realistic mock developer outputs when API keys are not present in the environment. This makes it perfect for local grading and offline evaluation.

---

## 🏗️ Architecture Design

The core system coordinates requests using a modular pipeline:

```
User Request / CLI
        │
        ▼
 Agent Orchestrator <──────> Conversation Memory
        │
        ▼
   Task Router
        │
        ▼
  Agent Registry ──────> [ Selected Specialized Agent ]
                                 │
                                 ▼
                         Unified LLM Engine
                     (Gemini / OpenAI / Offline)
```

1. **Agent Orchestrator** ([core/orchestrator.py](file:///C:/Users/deviv/devpilot-ai/core/orchestrator.py)): The central workflow manager. It resolves queries via the router, injects conversation history, executes the agent, and logs outputs.
2. **Task Router** ([core/router.py](file:///C:/Users/deviv/devpilot-ai/core/router.py)): Uses a 3-tier keyword classification check (and semantic LLM routing if online) to map prompts to the optimal agent persona.
3. **Agent Registry** ([core/registry.py](file:///C:/Users/deviv/devpilot-ai/core/registry.py)): Auto-catalogs and instantiates the active agents on startup.
4. **Conversation Memory** ([core/memory.py](file:///C:/Users/deviv/devpilot-ai/core/memory.py)): Stores user-assistant messages, pruning them thread-safely when thresholds are reached.
5. **Unified LLM Engine** ([core/llm.py](file:///C:/Users/deviv/devpilot-ai/core/llm.py)): Routes inference calls to Gemini, OpenAI, or the smart Offline fallbacks.

---

## 🤖 Core Agents

Each agent has its own system instructions in [prompts/](file:///C:/Users/deviv/devpilot-ai/prompts) and inherits from a unified base class:

| Key | Agent Persona | Purpose | Prompts |
| :--- | :--- | :--- | :--- |
| `coding` | **Coding Agent** | Generates source code, refactors functions, and explains logic. | [coding.txt](file:///C:/Users/deviv/devpilot-ai/prompts/coding.txt) |
| `debugger` | **Debugger Agent** | Inspects crash reports, analyzes exceptions, and creates code fixes. | [debugger.txt](file:///C:/Users/deviv/devpilot-ai/prompts/debugger.txt) |
| `documentation` | **Documentation Agent** | Generates docstrings, system guides, and markdown files. | [documentation.txt](file:///C:/Users/deviv/devpilot-ai/prompts/documentation.txt) |
| `planning` | **Planning Agent** | Outlines project development roadmaps and task breakdowns. | [planning.txt](file:///C:/Users/deviv/devpilot-ai/prompts/planning.txt) |
| `repository` | **Repository Explainer** | Explains codebase tree layouts, entry points, and module interfaces. | [repository.txt](file:///C:/Users/deviv/devpilot-ai/prompts/repository.txt) |
| `terminal` | **Terminal Assistant** | Diagnoses terminal failures, Docker ports, and suggests shell commands. | [terminal.txt](file:///C:/Users/deviv/devpilot-ai/prompts/terminal.txt) |

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.10 or higher installed.

### Setup Steps
1. **Clone & Navigate**:
   ```bash
   cd devpilot-ai
   ```
2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Configure Environment Variables (Optional)**:
   Create a `.env` file in the root directory:
   ```env
   # To run online with Gemini
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Or to run online with OpenAI
   OPENAI_API_KEY=your_openai_api_key_here
   ```
   *If no API key is specified, the framework launches in `OFFLINE` mode and generates contextual mockups.*

---

## 🛠️ Execution Guides

### 1. Run the Interactive CLI Dashboard
Start the command line interface to chat with the agent system:
```bash
python main.py
```
- Type any request.
- Type `help` to inspect registered agents.
- Type `clear` to clean session memory.
- Type `exit` to quit.

### 2. Run the Automated Demo Suite
Executes the 6 core scenarios requested in the Kaggle capstone specification, printing routing logs, memory sizes, and outputs:
```bash
python main.py --demo
```

### 3. Run the Streamlit Web Dashboard UI
Start the premium web dashboard:
```bash
streamlit run streamlit_app.py
```

### 4. Run the Unit Tests
Executes the `pytest` test suite covering memory management, keyword routing overrides, agent prompt loading, and orchestrator execution pipeline:
```bash
python -m pytest tests/test_core.py tests/test_agents.py tests/test_orchestrator.py
```

---

## 📝 Directory Layout

```
devpilot-ai/
├── agents/                  # Specialized agent classes
│   ├── __init__.py
│   ├── base_agent.py        # Abstract agent parent class
│   ├── coding_agent.py
│   ├── debugger_agent.py
│   ├── documentation_agent.py
│   ├── planning_agent.py
│   ├── repository_explainer.py
│   └── terminal_assistant.py
│
├── core/                    # Core multi-agent pipeline
│   ├── __init__.py
│   ├── llm.py               # Unified online/offline LLM wrapper
│   ├── memory.py            # Conversation session memory
│   ├── registry.py          # Central agent catalog
│   ├── router.py            # 3-tier task router classifier
│   └── orchestrator.py      # Core workflow manager
│
├── prompts/                 # Agent system instruction templates
│   ├── coding.txt
│   ├── debugger.txt
│   ├── documentation.txt
│   ├── planning.txt
│   ├── repository.txt
│   └── terminal.txt
│
├── tests/                   # Pytest test suite
│   ├── test_agents.py
│   ├── test_core.py
│   └── test_orchestrator.py
│
├── main.py                  # CLI and Demo runner
├── requirements.txt         # Core dependencies
└── README.md                # System documentation
```
