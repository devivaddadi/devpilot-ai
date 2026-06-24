import os
import sys
import logging
from typing import Dict, Any, List

# Ensure UTF-8 output encoding on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger("devpilot.ui")

# Resolve import paths to find core backend modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.llm import LLMProvider
from core.memory import ConversationMemory
from core.registry import AgentRegistry
from core.router import TaskRouter
from core.orchestrator import AgentOrchestrator

# Set up Streamlit Page Configuration
st.set_page_config(
    page_title="DevPilot AI | Multi-Agent Copilot",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Premium Styling injection
st.markdown("""
<style>
    /* Gradient Headers */
    .main-title {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 800;
        font-size: 2.8rem;
        margin-bottom: 0.5rem;
    }
    .subtitle {
        color: #718096;
        font-size: 1.2rem;
        margin-bottom: 2rem;
    }
    /* Metric Cards */
    .metric-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        margin-bottom: 15px;
    }
    .metric-title {
        font-size: 0.9rem;
        text-transform: uppercase;
        color: #a0aec0;
        letter-spacing: 0.05em;
    }
    .metric-value {
        font-size: 1.8rem;
        font-weight: bold;
        color: #4c51bf;
    }
    /* Agent & Demo Cards */
    .agent-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 25px;
        height: 100%;
        transition: transform 0.2s;
        margin-bottom: 20px;
    }
    .agent-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
    }
    .agent-header {
        font-size: 1.3rem;
        font-weight: bold;
        color: #5a67d8;
        margin-bottom: 10px;
    }
</style>
""", unsafe_allow_html=True)

# ----------------------------------------------------
# 1. Integration & State Management Layer
# ----------------------------------------------------
def init_devpilot_session():
    """Initializes the backend agent orchestrator inside Streamlit Session State."""
    if "orchestrator" not in st.session_state:
        try:
            logger.info("Initializing DevPilot AI backend services inside Streamlit Session State.")
            llm = LLMProvider()
            registry = AgentRegistry(llm)
            router = TaskRouter(llm)
            memory = ConversationMemory()
            orchestrator = AgentOrchestrator(llm, registry, router, memory)
            
            st.session_state.llm = llm
            st.session_state.registry = registry
            st.session_state.router = router
            st.session_state.memory = memory
            st.session_state.orchestrator = orchestrator
            st.session_state.last_routed_agent = None
            st.session_state.last_response = None
        except Exception as e:
            st.error(f"Failed to initialize DevPilot AI Core: {e}")
            logger.error(f"Session initialization failure: {e}", exc_info=True)

init_devpilot_session()

# ----------------------------------------------------
# 2. Page Renderers
# ----------------------------------------------------

def show_home():
    """Renders the Home Dashboard Page."""
    st.markdown('<div class="main-title">DevPilot AI Copilot</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Multi-Agent Collaborative Framework for Software Engineering</div>', unsafe_allow_html=True)
    
    st.markdown("""
    ### Welcome to DevPilot AI! 🚀
    
    DevPilot AI is a modular developer assistant that parses user prompts and automatically assigns them to
    specialized AI agent roles based on a **3-Tier Priority Task Router**.
    
    This visual dashboard connects directly to the core python backend libraries, exposing conversation states,
    routing paths, and agent instruction contexts.
    
    ---
    """)
    
    # Showcase Agent Features
    st.subheader("🤖 The Agent Suite")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.markdown("""
        <div class="agent-card">
            <div class="agent-header">💻 Coding Agent</div>
            <p>Generates production-grade scripts, refactors files, and explains mathematical/algorithmic logic.</p>
            <strong>Default Key:</strong> <code>coding</code>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("""
        <div class="agent-card">
            <div class="agent-header">📝 Documentation Agent</div>
            <p>Drafts high-level Markdown README files, writes docstrings, and organizes API specifications.</p>
            <strong>Default Key:</strong> <code>documentation</code>
        </div>
        """, unsafe_allow_html=True)
        
    with col2:
        st.markdown("""
        <div class="agent-card">
            <div class="agent-header">🩺 Debugger Agent</div>
            <p>Analyzes exception logs and stack traces to detect logical bugs and generate code diff patches.</p>
            <strong>Default Key:</strong> <code>debugger</code>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("""
        <div class="agent-card">
            <div class="agent-header">🗺️ Planning Agent</div>
            <p>Decomposes complex requests into incremental phased roadmaps, checklists, and risk matrices.</p>
            <strong>Default Key:</strong> <code>planning</code>
        </div>
        """, unsafe_allow_html=True)
        
    with col3:
        st.markdown("""
        <div class="agent-card">
            <div class="agent-header">🔍 Repository Explainer</div>
            <p>Summarizes folder structures, explains package relations, and traces system entry points.</p>
            <strong>Default Key:</strong> <code>repository</code>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("""
        <div class="agent-card">
            <div class="agent-header">🐚 Terminal Assistant</div>
            <p>Troubleshoots Docker port errors, configures Git actions, and suggests platform-agnostic shell scripts.</p>
            <strong>Default Key:</strong> <code>terminal</code>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")
    st.subheader("💡 Quick Start Guide")
    st.info("""
    1. **Online Mode**: Add your keys (e.g. `GEMINI_API_KEY` or `OPENAI_API_KEY`) to the `.env` configuration file to run live LLM requests.
    2. **Offline Fallback**: Run right away! The system activates a high-fidelity simulator to process queries instantly without keys.
    3. **Start Chatting**: Select the **AI Assistant** in the sidebar navigation and submit your queries!
    """)


def show_assistant():
    """Renders the Interactive AI Assistant Page."""
    st.markdown('<div class="main-title">Interactive AI Assistant</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Enter queries and trace multi-agent task execution</div>', unsafe_allow_html=True)
    
    # Active Session Information Header
    history = st.session_state.memory.get_history()
    mode_label = st.session_state.llm.mode.upper()
    
    col_info1, col_info2, col_info3 = st.columns(3)
    with col_info1:
        st.markdown(f"""
        <div class="metric-card">
            <div class="metric-title">Inference Engine</div>
            <div class="metric-value">{mode_label}</div>
        </div>
        """, unsafe_allow_html=True)
    with col_info2:
        st.markdown(f"""
        <div class="metric-card">
            <div class="metric-title">Messages Tracked</div>
            <div class="metric-value">{len(history)}</div>
        </div>
        """, unsafe_allow_html=True)
    with col_info3:
        # Clear button
        st.markdown('<div style="height: 10px;"></div>', unsafe_allow_html=True)
        if st.button("🗑️ Clear Conversation Memory", use_container_width=True):
            st.session_state.memory.clear()
            st.session_state.last_routed_agent = None
            st.session_state.last_response = None
            st.rerun()

    st.write("---")
    
    # Render last routing decision
    if st.session_state.last_routed_agent:
        st.success(f"🤖 **Routing Classification**: Routed to **{st.session_state.last_routed_agent}** based on query intent classification.")

    # Chat Messages Window
    chat_container = st.container()
    with chat_container:
        for message in history:
            role = "user" if message["role"] == "user" else "assistant"
            with st.chat_message(role):
                st.markdown(message["content"])
                
    # Input box
    user_query = st.chat_input("Ask DevPilot a developer question...")
    
    if user_query:
        # Render user message instantly
        with chat_container:
            with st.chat_message("user"):
                st.markdown(user_query)
                
        # Run pipeline
        with st.spinner("Classifying request and generating agent response..."):
            try:
                result = st.session_state.orchestrator.process_request(user_query)
                st.session_state.last_routed_agent = f"{result['routed_agent_name']} (key: {result['routed_agent_key']})"
                st.session_state.last_response = result["response"]
                st.rerun()
            except Exception as e:
                st.error(f"Execution Error: {e}")
                logger.error(f"Error processing user request: {e}")


def show_agents():
    """Renders the Agents Catalog Page."""
    st.markdown('<div class="main-title">Agents Catalog</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Inspect system prompt templates and responsibilities</div>', unsafe_allow_html=True)
    
    # Expose descriptions and prompts directly from registry configurations
    agents = st.session_state.registry.list_agents()
    
    for agent_data in agents:
        agent_key = agent_data["key"]
        agent = st.session_state.registry.get_agent(agent_key)
        
        with st.expander(f"🤖 {agent.name} (Key: {agent_key})", expanded=True):
            st.write(f"**Purpose**: {agent.description}")
            
            # System prompt preview
            st.markdown("**System Prompt Directive**:")
            st.code(agent.system_prompt, language="markdown")
            
            # Example queries
            st.markdown("**Example Requests**:")
            example_queries = {
                "coding": ["Generate a FastAPI REST endpoint with error handling", "Refactor this list comprehension for readability"],
                "debugger": ["Find the bug in this binary search recursion function", "Why does this script throw IndexError?"],
                "documentation": ["Generate docstrings for my core validation script", "Draft a README guide explaining local setup"],
                "planning": ["Create a project roadmap for building a web scraper app", "Decompose the development phases for my dashboard"],
                "repository": ["Explain the file structure of this repository", "Identify entry points and configurations"],
                "terminal": ["Why is docker failing to mount a volume?", "Explain the syntax for the git rebase command"]
            }
            for q in example_queries.get(agent_key, ["General query"]):
                st.markdown(f"- *\"{q}\"*")


def show_memory():
    """Renders the Conversation Memory Page."""
    st.markdown('<div class="main-title">Conversation Memory</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Review stored session contexts and memory statistics</div>', unsafe_allow_html=True)
    
    history = st.session_state.memory.get_history()
    
    if not history:
        st.info("No conversation history currently recorded. Ask a question on the AI Assistant page to initialize memory logs.")
        return
        
    st.subheader("📈 Memory Statistics")
    col1, col2 = st.columns(2)
    with col1:
        st.metric("Total Logged Interactions", len(history))
    with col2:
        st.metric("Pruning Max Message Capacity", st.session_state.memory.max_messages)
        
    st.write("---")
    st.subheader("📜 Raw Memory Transcript Context")
    st.text_area(
        "Formatted Prompt Context (Injected into Agent API calls):",
        value=st.session_state.memory.get_history_as_string(),
        height=300,
        disabled=True
    )
    
    st.subheader("🔍 Message Log Inspector")
    for index, message in enumerate(history):
        role_label = "🧑‍💻 USER" if message["role"] == "user" else "🤖 ASSISTANT"
        with st.expander(f"Interaction #{index + 1} - {role_label}"):
            st.markdown(message["content"])


def show_demo():
    """Renders the Demo Scenarios Page."""
    st.markdown('<div class="main-title">Pre-Built Demo Scenarios</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">One-click pipeline executions for capstone demonstration</div>', unsafe_allow_html=True)
    
    demo_scenarios = [
        {
            "title": "💻 Generate Python REST API",
            "agent": "Coding Agent",
            "key": "coding",
            "prompt": "Generate a Python REST API using FastAPI",
            "description": "Demonstrates the Coding Agent writing a clean, type-safe API structure using FastAPI."
        },
        {
            "title": "🩺 Debug Division-by-Zero",
            "agent": "Debugger Agent",
            "key": "debugger",
            "prompt": "Find the bug in this code:\n\ndef calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\nprint(calculate_average([]))",
            "description": "Demonstrates the Debugger Agent inspecting bounds, locating division errors, and generating a diff patch."
        },
        {
            "title": "📝 Create Project README",
            "agent": "Documentation Agent",
            "key": "documentation",
            "prompt": "Create a professional README.md structure for DevPilot AI",
            "description": "Demonstrates the Documentation Agent outputting setup guides and markdown layouts."
        },
        {
            "title": "🗺️ Build Project Roadmap",
            "agent": "Planning Agent",
            "key": "planning",
            "prompt": "Create a phased engineering roadmap for building a job portal",
            "description": "Demonstrates the Planning Agent breaking architectural backlogs into deliverables."
        },
        {
            "title": "🔍 Explain Repo Folder Structure",
            "agent": "Repository Explainer",
            "key": "repository",
            "prompt": "Explain the folder structure and architectural components of the devpilot-ai repository",
            "description": "Demonstrates the Repository Explainer mapping modules, configuration locations, and entry scripts."
        },
        {
            "title": "🐚 Explain Docker Port Conflict",
            "agent": "Terminal Assistant",
            "key": "terminal",
            "prompt": "Why is docker container failing to start with port bind error on 80?",
            "description": "Demonstrates the Terminal Assistant diagnosing network conflicts and suggesting shell resolutions."
        }
    ]
    
    # Display cards in a structured layout
    col1, col2 = st.columns(2)
    
    for idx, scenario in enumerate(demo_scenarios):
        target_col = col1 if idx % 2 == 0 else col2
        
        with target_col:
            st.markdown(f"""
            <div class="agent-card">
                <div class="agent-header">{scenario['title']}</div>
                <p><strong>Target Agent:</strong> {scenario['agent']} (key: {scenario['key']})</p>
                <p><strong>Query:</strong> <em>"{scenario['prompt'][:70]}..."</em></p>
                <p>{scenario['description']}</p>
            </div>
            """, unsafe_allow_html=True)
            
            # Button to trigger execution
            if st.button(f"🚀 Run Scenario {idx + 1}", key=f"run_scenario_{idx}"):
                with st.spinner("Processing scenario..."):
                    try:
                        result = st.session_state.orchestrator.process_request(scenario["prompt"])
                        
                        # Store in session state and redirect or show output below
                        st.session_state.last_routed_agent = f"{result['routed_agent_name']} (key: {result['routed_agent_key']})"
                        st.session_state.last_response = result["response"]
                        
                        st.success(f"🤖 Routed query successfully to: **{result['routed_agent_name']}**")
                        
                        st.subheader("Response Output:")
                        st.markdown(result["response"])
                    except Exception as e:
                        st.error(f"Error executing scenario: {e}")
            st.write("")

# ----------------------------------------------------
# 3. Sidebar Navigation Panel
# ----------------------------------------------------
st.sidebar.title("🧭 DevPilot Navigation")

selected_page = st.sidebar.radio(
    "Choose Page:",
    ["Home", "AI Assistant", "Agents Catalog", "Conversation Memory", "Demo Scenarios"]
)

# Expose backend state indicator
st.sidebar.write("---")
st.sidebar.markdown(f"**LLM Backend Engine**: `{st.session_state.llm.mode.upper()}`")
st.sidebar.markdown(f"**Memory History size**: `{len(st.session_state.memory.get_history())} messages`")

# Render selected page
if selected_page == "Home":
    show_home()
elif selected_page == "AI Assistant":
    show_assistant()
elif selected_page == "Agents Catalog":
    show_agents()
elif selected_page == "Conversation Memory":
    show_memory()
elif selected_page == "Demo Scenarios":
    show_demo()
