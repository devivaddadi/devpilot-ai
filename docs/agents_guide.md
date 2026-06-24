# DevPilot AI: Specialized Agent Reference Guide

This document describes the design, system prompt logic, and expected developer query routing for each of the six specialized agents registered in the DevPilot AI ecosystem.

---

## 1. Coding Agent (`coding`)
- **System Prompt**: [coding.txt](file:///C:/Users/deviv/devpilot-ai/prompts/coding.txt)
- **Role**: Software Developer & Code Generator
- **Focus**: Generating type-safe, commented code, refactoring logic, and explaining implementations.
- **Routing Example**: *"Generate a Python REST API using FastAPI"*

### Sample Output Response:
```python
from fastapi import FastAPI
app = FastAPI()

@app.get("/")
def home():
    return {"message": "Hello from DevPilot Coding Agent"}
```

---

## 2. Debugger Agent (`debugger`)
- **System Prompt**: [debugger.txt](file:///C:/Users/deviv/devpilot-ai/prompts/debugger.txt)
- **Role**: Diagnostic Engineer & Code Repair Assistant
- **Focus**: Detecting runtime exceptions, memory leaks, and logical errors. Proposes unified diff fixes.
- **Routing Example**: *"Find the bug in this code: print(calculate_average([]))"*

### Sample Output Response:
```diff
def calculate_average(numbers):
-   return sum(numbers) / len(numbers)
+   if not numbers:
+       return 0.0
+   return sum(numbers) / len(numbers)
```

---

## 3. Documentation Agent (`documentation`)
- **System Prompt**: [documentation.txt](file:///C:/Users/deviv/devpilot-ai/prompts/documentation.txt)
- **Role**: Technical Writer & Documentation Automator
- **Focus**: Writing code docstrings, generating Markdown README layouts, and documenting class modules.
- **Routing Example**: *"Create a professional README.md file layout"*

### Sample Output Response:
```markdown
# Project Summary
This module handles all input-output logic for the DevPilot orchestrator pipeline.
```

---

## 4. Planning Agent (`planning`)
- **System Prompt**: [planning.txt](file:///C:/Users/deviv/devpilot-ai/prompts/planning.txt)
- **Role**: Technical Project Manager & Systems Architect
- **Focus**: Feature decomposition, phased milestone scheduling, and architecture roadmap charting.
- **Routing Example**: *"Create a roadmap for my job portal"*

### Sample Output Response:
- **Phase 1**: Database schema configuration (PostgreSQL indexes, model layout)
- **Phase 2**: Session handling and Core REST APIs
- **Phase 3**: Integration and agent orchestration pipeline

---

## 5. Repository Explainer Agent (`repository`)
- **System Prompt**: [repository.txt](file:///C:/Users/deviv/devpilot-ai/prompts/repository.txt)
- **Role**: Project Archivist & Codebase Navigator
- **Focus**: Cataloging file trees, identifying system entry points, and documenting codebase boundaries.
- **Routing Example**: *"Explain the folder structure of this devpilot-ai repository"*

### Sample Output Response:
- `main.py`: Interactive console interface.
- `core/`: Multi-agent pipeline framework.
- `agents/`: Python files containing agent persona definitions.

---

## 6. Terminal Assistant Agent (`terminal`)
- **System Prompt**: [terminal.txt](file:///C:/Users/deviv/devpilot-ai/prompts/terminal.txt)
- **Role**: Systems Administrator & DevOps Advisor
- **Focus**: Explaining shell parameters, container troubleshooting (Docker), and version control assistance (Git).
- **Routing Example**: *"Why is docker container failing to start with port bind error on 80?"*

### Sample Output Response:
1. Identify if port 80 is occupied: `netstat -ano | findstr 80` (Windows) or `sudo lsof -i :80` (Linux).
2. Kill the conflicting process or change the docker-compose mapping: `"8080:80"`.
