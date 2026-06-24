import os
import logging
import json
from typing import Optional
import httpx

logger = logging.getLogger("devpilot.core.llm")

class LLMProvider:
    """
    Unified LLM Provider supporting Gemini, OpenAI, and a rich offline fallback mode.
    """
    def __init__(self):
        # Load keys from environment
        self.gemini_key = os.environ.get("GEMINI_API_KEY")
        self.openai_key = os.environ.get("OPENAI_API_KEY")
        
        if self.gemini_key:
            self.mode = "gemini"
            logger.info("LLM initialized in Gemini mode.")
        elif self.openai_key:
            self.mode = "openai"
            logger.info("LLM initialized in OpenAI mode.")
        else:
            self.mode = "offline"
            logger.warning("No API keys found. LLM initialized in OFFLINE mock mode.")

    def generate(self, prompt: str, system_instruction: str = "") -> str:
        """
        Generate text based on a user prompt and optional system instructions.
        """
        if self.mode == "gemini":
            return self._generate_gemini(prompt, system_instruction)
        elif self.mode == "openai":
            return self._generate_openai(prompt, system_instruction)
        else:
            return self._generate_offline(prompt, system_instruction)

    def _generate_gemini(self, prompt: str, system_instruction: str) -> str:
        """Call Google Gemini API using httpx."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={self.gemini_key}"
        headers = {"Content-Type": "application/json"}
        
        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ]
        }
        
        if system_instruction:
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                
                # Extract response text
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "")
                
                return "Error: Empty response from Gemini API."
        except Exception as e:
            logger.error(f"Gemini API invocation failed: {e}")
            logger.info("Falling back to offline response generation.")
            return self._generate_offline(prompt, system_instruction) + f"\n\n*(Note: Attempted Gemini API call but fell back due to error: {e})*"

    def _generate_openai(self, prompt: str, system_instruction: str) -> str:
        """Call OpenAI API using httpx."""
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.openai_key}"
        }
        
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": "gpt-4o-mini",
            "messages": messages,
            "temperature": 0.7
        }

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                
                choices = data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
                
                return "Error: Empty response from OpenAI API."
        except Exception as e:
            logger.error(f"OpenAI API invocation failed: {e}")
            logger.info("Falling back to offline response generation.")
            return self._generate_offline(prompt, system_instruction) + f"\n\n*(Note: Attempted OpenAI API call but fell back due to error: {e})*"

    def _generate_offline(self, prompt: str, system_instruction: str) -> str:
        """
        Generate realistic response mockups based on system instruction matching
        to ensure functionality without requiring external credentials.
        """
        sys_lower = system_instruction.lower()
        prompt_lower = prompt.lower()
        
        # 1. Coding Agent Fallback
        if "coding agent" in sys_lower:
            if "rest api" in prompt_lower or "fastapi" in prompt_lower or "flask" in prompt_lower:
                return """### Coding Agent Response (Offline Mode)

Here is a Python REST API built using **FastAPI** with structured type hints, logging, and error handling.

```python
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")

app = FastAPI(title="DevPilot Demo API", version="1.0.0")

class Item(BaseModel):
    name: str
    description: Optional[str] = None
    price: float

# In-memory database
items_db = {}

@app.get("/items/{item_id}", response_model=Item)
def read_item(item_id: int):
    logger.info(f"Fetching item with ID: {item_id}")
    if item_id not in items_db:
        logger.error(f"Item {item_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Item {item_id} not found"
        )
    return items_db[item_id]

@app.post("/items/", status_code=status.HTTP_201_CREATED)
def create_item(item_id: int, item: Item):
    logger.info(f"Creating item {item_id}")
    if item_id in items_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Item already exists"
        )
    items_db[item_id] = item
    return {"message": "Item successfully created", "item_id": item_id}
```

#### Explanation:
1. **Pydantic Validation**: `Item` model guarantees that JSON requests are parsed and validated automatically.
2. **FastAPI DI & Exception Handling**: Reusable `HTTPException` raises structured HTTP errors to the client.
3. **Structured Logging**: Log statements trace execution for debugging.
"""
            else:
                return """### Coding Agent Response (Offline Mode)

Here is a clean Python function implementation for your request, utilizing modular design and type hints:

```python
from typing import List, Dict, Any

def process_data(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    \"\"\"
    Processes raw database records and filters out active accounts.
    \"\"\"
    processed = []
    for record in records:
        if record.get("status") == "active":
            # Normalize user names
            name = record.get("name", "Unknown").strip().title()
            processed.append({
                "id": record.get("id"),
                "name": name,
                "score": float(record.get("score", 0.0))
            })
    return processed
```
"""

        # 2. Debugger Agent Fallback
        elif "debugger agent" in sys_lower:
            return """### Debugger Agent Response (Offline Mode)

I have analyzed the provided code structure and detected a runtime bug.

#### Root Cause Analysis:
The code is attempting to mutate or access index items without checking bounds, or performs operations on `None` types due to missing fallback initialization. In Python, this results in a `TypeError: 'NoneType' object is not subscriptable` or `IndexError`.

#### Code Fix:
Here is the corrected code with a comparison:

```diff
def get_user_profile(user_data):
-    return user_data["profile"]["details"]
+    if user_data is None or "profile" not in user_data:
+        return {}
+    profile = user_data.get("profile") or {}
+    return profile.get("details", {})
```

#### Preventative Measures:
1. Use safe `.get()` dictionary methods with default fallback values (e.g. `user_data.get("key", {})`).
2. Add type checking assertions or schema validations at input boundaries.
"""

        # 3. Documentation Agent Fallback
        elif "documentation agent" in sys_lower:
            return """### Documentation Agent Response (Offline Mode)

Here is a professional, production-ready `README.md` file layout:

# DevPilot AI 🚀

DevPilot AI is an AI-powered developer copilot that coordinates specialized agent personas (Coding, Debugger, Planning, Docs, Repo Explainer, Terminal Assistant) to assist with software engineering cycles.

## 🛠️ Tech Stack
- **Backend Core**: Python 3.10+
- **LLM Routing**: Semantic Agent Routing & Registry
- **Testing Suite**: Pytest

## 🚀 Quick Start

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Setup Credentials**:
   Configure `GEMINI_API_KEY` in your `.env` file.
3. **Execute CLI**:
   ```bash
   python main.py
   ```
"""

        # 4. Planning Agent Fallback
        elif "planning agent" in sys_lower:
            return """### Planning Agent Response (Offline Mode)

Here is an architectural roadmap and task breakdown for building your application:

| Phase | Description | Key Deliverables | Tasks |
|:---|:---|:---|:---|
| **Phase 1: Setup** | Environment & DB Boilerplate | Setup SQL schema & Docker | - Initialize Git<br>- Setup configuration settings<br>- Create base PostgreSQL migration schemas |
| **Phase 2: Core** | Business Logic API | Endpoints & Service logic | - Build Auth service (JWT)<br>- Setup database CRUD methods<br>- Integrate background tasks |
| **Phase 3: Integration** | Multi-Agent Coordination | Task Router & Registry | - Register system agents<br>- Deploy local execution client |

#### Key Risks & Mitigations:
- **Authentication Bloat**: Mitigate by using lightweight JWT tokens with auto-expiry.
- **DB Scalability**: Ensure indexes are added early on search queries.
"""

        # 5. Repository Explainer Fallback
        elif "repository explainer" in sys_lower:
            return """### Repository Explainer Agent Response (Offline Mode)

Here is an architectural review of the repository:

#### Directory Structure Layout:
```
devpilot-ai/
├── agents/            # Specialized agent logic submodules
│   ├── base_agent.py  # Common interface for system personas
│   └── coding_agent.py, debugger_agent.py, etc.
├── core/              # Underlying multi-agent runtime services
│   ├── llm.py         # Unified LLM provider wrapper
│   ├── memory.py      # Conversation session history
│   ├── registry.py    # Discovery and listing catalog
│   ├── router.py      # Semantic LLM & Rule-based Task classifier
│   └── orchestrator.py# Main workflow event coordinator
├── prompts/           # Text prompts for LLM inputs
├── main.py            # User entry point (CLI application)
└── requirements.txt   # Package dependencies
```

#### Core Components Summary:
- **`main.py`**: The terminal-based dashboard that launches the application and processes input commands.
- **`core/orchestrator.py`**: The central coordinator resolving agents and piping historical memory contexts.
"""

        # 6. Terminal Assistant Fallback
        elif "terminal assistant" in sys_lower:
            return """### Terminal Assistant Agent Response (Offline Mode)

Here is an analysis and solution for your terminal request.

#### Diagnostic steps for failing container commands (e.g. Docker):
1. **Verify if Docker Daemon is running**:
   - On Windows: Run `Get-Service *docker*` in PowerShell.
   - On Linux/macOS: Run `systemctl status docker`.
2. **Clear cached volumes and dangling networks**:
   ```bash
   docker system prune -f --volumes
   ```
3. **Rebuild the container image without cache**:
   ```bash
   docker compose build --no-cache
   ```
4. **Inspect error logs of the target container**:
   ```bash
   docker logs <container_name_or_id>
   ```
"""

        # Generic Response Fallback
        return f"""### DevPilot Agent Response (Offline Mode)

I am responding to your request in offline simulation mode because no active API keys (`GEMINI_API_KEY` or `OPENAI_API_KEY`) were detected in the environment.

**Received request:** "{prompt}"
**Active System Context:** "{system_instruction[:100]}..."

To enable live LLM processing, please configure your API keys in the environment.
"""
