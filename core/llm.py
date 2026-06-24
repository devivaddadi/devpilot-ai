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
        """Call Google Gemini API using httpx with exponential backoff retry logic."""
        import time
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

        max_retries = 3
        initial_delay = 1.0
        backoff_factor = 2.0
        
        for attempt in range(max_retries + 1):
            try:
                with httpx.Client(timeout=30.0) as client:
                    response = client.post(url, headers=headers, json=payload)
                    
                    # If server is overloaded (503) or rate-limited (429), sleep and retry
                    if response.status_code in (429, 503) and attempt < max_retries:
                        delay = initial_delay * (backoff_factor ** attempt)
                        logger.warning(f"Gemini API returned status {response.status_code}. Retrying in {delay:.1f}s (attempt {attempt + 1}/{max_retries})...")
                        time.sleep(delay)
                        continue
                        
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
                if attempt < max_retries:
                    delay = initial_delay * (backoff_factor ** attempt)
                    logger.warning(f"Gemini API attempt {attempt + 1} failed: {e}. Retrying in {delay:.1f}s...")
                    time.sleep(delay)
                else:
                    logger.error(f"Gemini API invocation failed after {max_retries + 1} attempts: {e}")
                    logger.info("Falling back to offline response generation.")
                    return self._generate_offline(prompt, system_instruction) + f"\n\n*(Note: Attempted Gemini API call but fell back due to error: {e})*"

    def _generate_openai(self, prompt: str, system_instruction: str) -> str:
        """Call OpenAI API using httpx with exponential backoff retry logic."""
        import time
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

        max_retries = 3
        initial_delay = 1.0
        backoff_factor = 2.0

        for attempt in range(max_retries + 1):
            try:
                with httpx.Client(timeout=30.0) as client:
                    response = client.post(url, headers=headers, json=payload)
                    
                    # If server is rate-limited (429) or has internal/gateway issue (502, 503, 504), sleep and retry
                    if response.status_code in (429, 502, 503, 504) and attempt < max_retries:
                        delay = initial_delay * (backoff_factor ** attempt)
                        logger.warning(f"OpenAI API returned status {response.status_code}. Retrying in {delay:.1f}s (attempt {attempt + 1}/{max_retries})...")
                        time.sleep(delay)
                        continue
                        
                    response.raise_for_status()
                    data = response.json()
                    
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0].get("message", {}).get("content", "")
                    
                    return "Error: Empty response from OpenAI API."
            except Exception as e:
                if attempt < max_retries:
                    delay = initial_delay * (backoff_factor ** attempt)
                    logger.warning(f"OpenAI API attempt {attempt + 1} failed: {e}. Retrying in {delay:.1f}s...")
                    time.sleep(delay)
                else:
                    logger.error(f"OpenAI API invocation failed after {max_retries + 1} attempts: {e}")
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
            # Check prompt for specific domains
            if any(k in prompt_lower for k in ["placement", "college", "tpo", "student portal"]):
                return """### Planning Agent Response (Offline Mode - College Placement Portal)

#### 📋 Identified Domain: College Placement Portal
An online platform connecting students, companies, and training & placement officers (TPOs) to automate placements.

#### 👥 User Roles:
1. **Student**: Updates profile, uploads resume, browses jobs, and tracks applications.
2. **TPO (Admin)**: Manages placement drives, verifies student data, and schedules rounds.
3. **Company Recruiter**: Posts vacancies, views profiles, shortlists applicants, and records offers.

#### ⚙️ Core Modules:
* **Authentication**: JWT-based secure sign-on for multiple roles.
* **Student Profile Builder**: CGPA, branch, resume links, and skill list.
* **Placement Drives**: CRUD API for recruiters/TPOs to publish drives.
* **Job Application Pipeline**: Student application dashboard and status tracker.

#### 🗄️ Database Entities (PostgreSQL):
* `users` (id, email, password_hash, role)
* `students` (user_id, branch, cgpa, resume_url)
* `companies` (id, name, industry, website)
* `placement_drives` (id, company_id, role_title, eligibility_criteria_cgpa, salary_package)
* `applications` (id, student_id, drive_id, status)
* `interviews` (id, application_id, round_name, scheduled_time)

#### 🌿 Key Workflow:
1. **Drive Publication**: Recruiter creates `placement_drives` with `eligibility_criteria_cgpa >= 7.5`.
2. **Apply Phase**: Students with CGPA >= 7.5 view and apply for the drive.
3. **Application Review**: TPO approves candidates.
4. **Shortlisting**: Recruiter logs round statuses inside `interviews`.

#### 🚀 Recommended Technology Stack:
* **Backend**: FastAPI (Python)
* **Frontend**: React (TypeScript)
* **Database**: PostgreSQL
* **Containerization**: Docker Compose
"""

            elif any(k in prompt_lower for k in ["e-commerce", "shopping", "ecommerce", "store", "product"]):
                return """### Planning Agent Response (Offline Mode - E-Commerce Platform)

#### 📋 Identified Domain: E-Commerce Platform
A highly scalable online retail storefront supporting merchant inventories, shopping carts, and secure checkouts.

#### 👥 User Roles:
1. **Buyer**: Searches items, manages cart, checkouts, and views order history.
2. **Seller**: Manages product listings, views sales metrics, and updates inventory.
3. **Admin**: Manages categories, flags users, and processes refund audits.

#### ⚙️ Core Modules:
* **Catalog Management**: Elastic-searchable product indexing and reviews.
* **Cart & Checkout**: Stateful local or Redis-cached shopping carts.
* **Order Orchestration**: State machine tracking order states (pending, paid, shipped).
* **Payment Gateway**: Integration with Stripe APIs for checkout flows.

#### 🗄️ Database Entities (MongoDB/PostgreSQL):
* `users` (id, email, address, payment_methods)
* `products` (id, seller_id, title, description, price, inventory_stock)
* `orders` (id, buyer_id, total_amount, payment_status, shipping_status)
* `order_items` (id, order_id, product_id, quantity, unit_price)
* `reviews` (id, product_id, user_id, rating, comment)

#### 🌿 Key Workflow:
1. **Cart Checkout**: Buyer submits cart checkout request.
2. **Payment Authorization**: Stripe Webhook triggers transaction confirmation.
3. **Inventory Decrement**: System updates `products.inventory_stock = inventory_stock - quantity`.
4. **Fulfillment**: System alerts Seller to ship order.

#### 🚀 Recommended Technology Stack:
* **Backend**: Node.js (Express) or NestJS
* **Frontend**: Next.js (React)
* **Database**: MongoDB (Flexible catalog) + Redis (Session/Cart)
* **Payment Gateway**: Stripe SDK
"""

            elif any(k in prompt_lower for k in ["hospital", "clinic", "patient", "doctor", "health"]):
                return """### Planning Agent Response (Offline Mode - Hospital Management System)

#### 📋 Identified Domain: Hospital Management System
A HIPAA-compliant medical enterprise application managing patient registries, appointments, and billing.

#### 👥 User Roles:
1. **Patient**: Registers profiles, schedules doctor visits, and reads prescription receipts.
2. **Doctor**: Reviews patient history records, logs diagnosis, and writes prescriptions.
3. **Receptionist**: Registers check-ins, allocates consultation slots, and processes payments.
4. **Pharmacist**: Manages drug inventories and dispenses items.

#### ⚙️ Core Modules:
* **Patient Portal**: Profile management, registration, and booking schedules.
* **Electronic Health Records (EHR)**: Encrypted medical record logs and diagnoses.
* **Billing System**: Invoice ledger computing consultant fees, room rent, and medicine costs.
* **Ward Allocation**: Tracking occupied bed vacancies.

#### 🗄️ Database Entities (PostgreSQL/SQL Server):
* `patients` (id, name, date_of_birth, contact_info)
* `doctors` (id, name, specialization, consultation_fee)
* `appointments` (id, patient_id, doctor_id, slot_time, status)
* `medical_records` (id, patient_id, doctor_id, diagnosis, prescription_details)
* `invoices` (id, patient_id, total_fee, tax, payment_status)

#### 🌿 Key Workflow:
1. **Booking slot**: Patient selects date/doctor and creates `appointments`.
2. **Doctor consultation**: Doctor reviews `medical_records` and appends current visit diagnosis.
3. **Ledger generation**: Receptionist issues patient bill linking `consultation_fee` and medicines.

#### 🚀 Recommended Technology Stack:
* **Backend**: Django (Python) or Spring Boot (Java)
* **Frontend**: Angular (TypeScript)
* **Database**: PostgreSQL (with encrypt-at-rest modules)
* **API Security**: OAuth2 with active audit logs
"""

            elif any(k in prompt_lower for k in ["library", "book", "librarian"]):
                return """### Planning Agent Response (Offline Mode - Library Management System)

#### 📋 Identified Domain: Library Management System
An administrative records manager automating book catalogs, borrowing logs, and fine assessments.

#### 👥 User Roles:
1. **Member (Student/Teacher)**: Browses catalog, reserves books, and tracks return deadlines.
2. **Librarian**: Issues/returns books, updates catalog copies, and processes overdue fines.
3. **Admin**: Oversees memberships and handles settings.

#### ⚙️ Core Modules:
* **Book Inventory**: ISBN-based indexing, categorization, and physical location mapping.
* **Borrowing Pipeline**: Tracking checkouts, return due dates, and renewals.
* **Reservation Engine**: Queue management for highly demanded titles.
* **Fine Calculator**: Scheduled task calculating overdue charges.

#### 🗄️ Database Entities (MySQL/PostgreSQL):
* `books` (isbn, title, author, category, copies_total, copies_available)
* `members` (id, name, email, registration_date, status)
* `borrow_records` (id, member_id, isbn, borrow_date, due_date, return_date)
* `fines` (id, borrow_record_id, amount, status)
* `reservations` (id, member_id, isbn, reservation_date, status)

#### 🌿 Key Workflow:
1. **Search & Reserve**: Member reserves an unavailable book, appending to queue.
2. **Checkout**: Book returned; next reserving member receives alert. Librarian logs `borrow_records`.
3. **Overdue Check**: If `current_date > due_date` and `return_date` is null, daily cron task appends value to `fines`.

#### 🚀 Recommended Technology Stack:
* **Backend**: Spring Boot (Java) or ASP.NET Core (C#)
* **Frontend**: Vue.js or React
* **Database**: MySQL
* **Scheduler**: Spring Batch / Quartz Scheduler (for daily overdue fine cron jobs)
"""

            elif any(k in prompt_lower for k in ["food", "delivery", "restaurant", "order"]):
                return """### Planning Agent Response (Offline Mode - Food Delivery Application)

#### 📋 Identified Domain: Food Delivery Application
A real-time, location-based food ordering network coordinating customers, kitchens, and couriers.

#### 👥 User Roles:
1. **Customer**: Lists restaurant menus, places orders, and tracks courier coordinates.
2. **Restaurant Manager**: Updates menu prices, accepts orders, and signals cook milestones.
3. **Delivery Partner**: Receives route dispatch alerts, updates status, and shares GPS telemetry.

#### ⚙️ Core Modules:
* **Menu Listings**: Dynamic catalog with category grouping, dietary tags, and prices.
* **Order Pipeline**: State tracking: Pending ➔ Cooking ➔ Dispatched ➔ Delivered.
* **Telemetry Routing**: Real-time geolocation coordinates shared via WebSockets.
* **Notification Dispatcher**: Alerts users of transit status updates.

#### 🗄️ Database Entities (MongoDB/PostgreSQL):
* `users` (id, email, phone, address_coordinates)
* `restaurants` (id, name, location_coordinates, rating)
* `menu_items` (id, restaurant_id, item_name, description, price)
* `orders` (id, customer_id, restaurant_id, status, subtotal, delivery_fee)
* `order_items` (id, order_id, menu_item_id, quantity)
* `delivery_routes` (id, order_id, driver_id, start_location, current_location)

#### 🌿 Key Workflow:
1. **Submission**: Customer orders food; kitchen accepts order and updates status to `preparing`.
2. **Dispatch**: Order packed; system finds nearest available courier using geolocation distance match.
3. **Telemetry**: Courier updates progress; WebSockets stream longitude/latitude to Customer UI.

#### 🚀 Recommended Technology Stack:
* **Backend**: Node.js (with Socket.io) or Go (Golang)
* **Frontend**: React Native or Flutter (Mobile native focus)
* **Database**: PostgreSQL (with PostGIS extensions for spatial queries)
* **Live In-Memory Geolocation Tracking**: Redis (geospatial indexes)
"""

            else:
                # Dynamically try to infer a domain or fallback cleanly
                words = [w.title() for w in prompt_lower.replace("create", "").replace("build", "").replace("want to", "").split() if len(w) > 3][:4]
                guessed_domain = " ".join(words) if words else "Custom Service Web App"
                return f"""### Planning Agent Response (Offline Mode - Custom Domain)

#### 📋 Identified Domain: {guessed_domain}
A custom service application engineered to support specialized database schemas and user management workflows.

#### 👥 User Roles:
1. **User (Customer)**: Invokes primary core service actions and views custom listings.
2. **Staff (Manager)**: Administers operations and resolves request items.
3. **Administrator**: Full system oversight, security policy settings, and configuration mappings.

#### ⚙️ Core Modules:
* **Identity Management**: Secure authentication & RBAC (Role-Based Access Control) schemas.
* **Record Intake**: Custom CRUD actions mapping business entity transactions.
* **Search Engine**: Terms matching filtering with custom fields.
* **Analytics Panel**: Aggregates usage reports and logs stats.

#### 🗄️ Database Entities (Relational PostgreSQL):
* `users` (id, email, password_hash, role_type, created_at)
* `records` (id, user_id, title, payload_json, status_label)
* `action_logs` (id, actor_id, record_id, action_taken, timestamp)

#### 🚀 Recommended Technology Stack:
* **Backend**: FastAPI (Python) or Spring Boot (Java)
* **Frontend**: Next.js / React (TypeScript)
* **Database**: PostgreSQL
* **API Integration**: REST API endpoints mapping JSON schema payloads
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
