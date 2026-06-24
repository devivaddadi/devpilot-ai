import os
import sys
import logging
import json
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
    page_title="DevPilot AI | Multi-Agent Dashboard",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Premium Global Styling Injection
st.markdown("""
<style>
    /* Google Fonts */
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@300;400;700&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
    }
    
    code, pre, [class*="mono"] {
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* Premium Theme & Colors */
    .main-title {
        background: linear-gradient(135deg, #a5b4fc 0%, #6366f1 50%, #4338ca 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 800;
        font-size: 3rem;
        margin-bottom: 0.2rem;
        letter-spacing: -0.025em;
    }
    .subtitle {
        color: #94a3b8;
        font-size: 1.25rem;
        margin-bottom: 2rem;
        font-weight: 300;
    }
    
    /* Sleek Cards */
    .premium-card {
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.3);
        margin-bottom: 20px;
    }
    
    .agent-card {
        background: rgba(15, 23, 42, 0.3);
        border-left: 4px solid #6366f1;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        border-right: 1px solid rgba(255, 255, 255, 0.05);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 20px;
        height: 100%;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .agent-card:hover {
        transform: translateY(-4px);
        background: rgba(30, 41, 59, 0.5);
        box-shadow: 0 12px 20px -8px rgba(99, 102, 241, 0.25);
    }
    
    .agent-header {
        font-size: 1.25rem;
        font-weight: 600;
        color: #818cf8;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    /* Badge Status */
    .status-badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .status-badge.active {
        background-color: rgba(16, 185, 129, 0.15);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-badge.offline {
        background-color: rgba(239, 68, 68, 0.15);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .status-badge.info {
        background-color: rgba(99, 102, 241, 0.15);
        color: #818cf8;
        border: 1px solid rgba(99, 102, 241, 0.3);
    }

    /* Workflow Diagram Styling */
    .flow-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 20px 0;
    }
    .flow-node {
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 16px 24px;
        width: 280px;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .flow-node.highlight {
        border: 2px solid #6366f1;
        background: rgba(99, 102, 241, 0.1);
    }
    .flow-arrow {
        color: #6366f1;
        font-size: 1.5rem;
        font-weight: bold;
    }
</style>
""", unsafe_allow_html=True)

# ----------------------------------------------------
# 1. State Management & Core Core Loading
# ----------------------------------------------------
def init_devpilot_session():
    """Initializes the backend agent orchestrator inside Streamlit Session State."""
    if "orchestrator" not in st.session_state:
        try:
            logger.info("Initializing DevPilot AI backend services.")
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
            st.session_state.last_routed_details = None
            st.session_state.last_response = None
            st.session_state.multi_agent_steps = None
        except Exception as e:
            st.error(f"Failed to initialize DevPilot AI Core: {e}")
            logger.error(f"Session initialization failure: {e}", exc_info=True)

init_devpilot_session()

# ----------------------------------------------------
# 2. Page Renderers
# ----------------------------------------------------

def show_home():
    """Renders the Home Welcome Dashboard Page."""
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
        st.write("")
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
        st.write("")
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
        st.write("")
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
    """Renders the Interactive AI Assistant Page along with Router Decisions and Export."""
    st.markdown('<div class="main-title">AI Assistant & Chat</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Interact with DevPilot and inspect real-time agent routing decisions</div>', unsafe_allow_html=True)
    
    col_chat, col_side_panel = st.columns([2, 1])
    
    history = st.session_state.memory.get_history()
    mode_label = st.session_state.llm.mode.upper()
    
    with col_chat:
        st.subheader("💬 Conversations")
        
        # Chat Messages Window
        chat_container = st.container(height=450)
        with chat_container:
            if not history:
                st.info("No messages in current thread. Enter a prompt below to get started.")
            for message in history:
                role = "user" if message["role"] == "user" else "assistant"
                with st.chat_message(role):
                    st.markdown(message["content"])
                    
        # Chat input
        user_query = st.chat_input("Ask DevPilot a developer question...")
        
        if user_query:
            # Process prompt
            with st.spinner("Determining optimal agent and executing..."):
                try:
                    result = st.session_state.orchestrator.process_request(user_query)
                    st.session_state.last_routed_details = result.get("routing_details")
                    st.session_state.last_response = result.get("response")
                    st.rerun()
                except Exception as e:
                    st.error(f"Orchestration Error: {e}")
                    logger.error(f"Error in UI prompt submit: {e}", exc_info=True)

    with col_side_panel:
        # Router Decision Panel
        st.subheader("⚙️ Router Decision Panel")
        if st.session_state.last_routed_details:
            details = st.session_state.last_routed_details
            st.markdown(f"""
            <div class="premium-card">
                <div style="font-weight:bold; color:#818cf8; margin-bottom: 8px;">Target Agent</div>
                <div style="font-size:1.5rem; font-weight:bold; margin-bottom:12px;">{details.get('agent').upper()}</div>
                <div style="font-weight:bold; color:#818cf8; margin-bottom: 4px;">Classification Method</div>
                <div style="font-size:1.1rem; margin-bottom:12px;">{details.get('method')}</div>
                <div style="font-weight:bold; color:#818cf8; margin-bottom: 4px;">Routing Category</div>
                <div style="font-size:1.1rem; margin-bottom:12px;">{details.get('tier')}</div>
                <div style="font-weight:bold; color:#818cf8; margin-bottom: 4px;">Matched Trigger Word</div>
                <div style="font-size:1.1rem; font-family: monospace; margin-bottom:12px;">"{details.get('matched_keyword') or 'None'}"</div>
                <div style="font-weight:bold; color:#818cf8; margin-bottom: 4px;">Decision Log</div>
                <div style="font-size:0.95rem; color:#94a3b8;">{details.get('explanation')}</div>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.info("Submit a prompt in the chat window to view the Router Decision path.")

        # Export Response & Actions
        st.subheader("📤 Output Actions")
        if st.session_state.last_response:
            st.download_button(
                label="📥 Export Latest Response as Markdown",
                data=st.session_state.last_response,
                file_name="devpilot_response.md",
                mime="text/markdown",
                use_container_width=True
            )
        else:
            st.button("📥 Export Response (Disabled)", disabled=True, use_container_width=True)
            
        if st.button("🗑️ Clear Thread History", use_container_width=True):
            st.session_state.memory.clear()
            st.session_state.last_routed_details = None
            st.session_state.last_response = None
            st.rerun()


def show_agent_dashboard():
    """Renders the Agent Status Dashboard."""
    st.markdown('<div class="main-title">Agent Status Dashboard</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Monitor system metrics and system prompt overrides</div>', unsafe_allow_html=True)
    
    agents = st.session_state.registry.list_agents()
    
    # Render overall metrics
    col_stat1, col_stat2, col_stat3 = st.columns(3)
    with col_stat1:
        st.markdown("""
        <div class="premium-card">
            <div class="metric-title">Online Provider Mode</div>
            <div class="metric-value" style="color:#34d399;">ACTIVE (OFFLINE FALLBACK)</div>
        </div>
        """, unsafe_allow_html=True)
    with col_stat2:
        st.markdown(f"""
        <div class="premium-card">
            <div class="metric-title">Registered Agents</div>
            <div class="metric-value">{len(agents)} Active</div>
        </div>
        """, unsafe_allow_html=True)
    with col_stat3:
        st.markdown(f"""
        <div class="premium-card">
            <div class="metric-title">Memory Type</div>
            <div class="metric-value">Thread-Safe FIFO</div>
        </div>
        """, unsafe_allow_html=True)
        
    st.write("---")
    st.subheader("📋 Specialized Agents")
    
    for agent_data in agents:
        agent_key = agent_data["key"]
        agent = st.session_state.registry.get_agent(agent_key)
        
        col_name, col_status = st.columns([4, 1])
        with col_name:
            st.markdown(f"#### 🤖 {agent.name} (key: `{agent_key}`)")
        with col_status:
            # Show a green badge indicating they are active
            st.markdown('<span class="status-badge active">🟢 Active</span>', unsafe_allow_html=True)
            
        st.write(f"*{agent.description}*")
        
        with st.expander("👁️ View Agent Instructions (System Prompt)"):
            st.code(agent.system_prompt, language="markdown")
        st.write("")


def show_demo_scenarios():
    """Renders the Demo Scenarios Page."""
    st.markdown('<div class="main-title">Demo Scenarios Page</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Run predefined developer workloads and trace the execution logging</div>', unsafe_allow_html=True)
    
    demo_scenarios = [
        {
            "title": "💻 Python REST API Generation",
            "agent": "Coding Agent",
            "key": "coding",
            "prompt": "Generate a Python REST API using FastAPI",
            "description": "Tests coding generation and refactoring capability by requesting a standard web api layout."
        },
        {
            "title": "🩺 Debug Division-by-Zero",
            "agent": "Debugger Agent",
            "key": "debugger",
            "prompt": "Find the bug in this code:\n\ndef calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\nprint(calculate_average([]))",
            "description": "Submits error code blocks to test exception tracing and generation of git diff corrections."
        },
        {
            "title": "📝 Project Markdown README",
            "agent": "Documentation Agent",
            "key": "documentation",
            "prompt": "Create a professional README.md structure for DevPilot AI",
            "description": "Validates system documentation capability, drafting markdown readmes."
        },
        {
            "title": "🗺️ Milestone Engineering Roadmap",
            "agent": "Planning Agent",
            "key": "planning",
            "prompt": "Create a phased engineering roadmap for building a job portal",
            "description": "Runs planning sequence, laying out task backlogs, risks, and sprints."
        },
        {
            "title": "🔍 Explain Codebase Layout",
            "agent": "Repository Explainer",
            "key": "repository",
            "prompt": "Explain the folder structure and architectural components of the devpilot-ai repository",
            "description": "Scans repository layouts, listing modules, core systems, and entry scripts."
        },
        {
            "title": "🐚 Docker Container Failure",
            "agent": "Terminal Assistant",
            "key": "terminal",
            "prompt": "Why is docker container failing to start with port bind error on 80?",
            "description": "Diagnoses terminal command failures, volumes, ports, and suggestions."
        }
    ]
    
    col_left, col_right = st.columns(2)
    
    for idx, scenario in enumerate(demo_scenarios):
        target_col = col_left if idx % 2 == 0 else col_right
        
        with target_col:
            st.markdown(f"""
            <div class="premium-card">
                <h3>{scenario['title']}</h3>
                <p><strong>Mapped Persona:</strong> <code>{scenario['agent']}</code></p>
                <p style="color:#94a3b8;">{scenario['description']}</p>
                <blockquote style="font-style: italic; border-left: 2px solid #818cf8; padding-left: 10px;">"{scenario['prompt'][:70]}..."</blockquote>
            </div>
            """, unsafe_allow_html=True)
            
            if st.button(f"🚀 Trigger Scenario {idx + 1}", key=f"demo_btn_{idx}"):
                with st.spinner("Processing request..."):
                    try:
                        result = st.session_state.orchestrator.process_request(scenario["prompt"])
                        st.session_state.last_routed_details = result.get("routing_details")
                        st.session_state.last_response = result.get("response")
                        
                        st.success(f"Successfully processed by {result['routed_agent_name']}!")
                        
                        # Tabs to show response vs. logs
                        tab_out, tab_trace = st.tabs(["📄 Agent Output", "⚙️ Router Trace"])
                        with tab_out:
                            st.markdown(result["response"])
                            st.download_button(
                                label="📥 Download This Output",
                                data=result["response"],
                                file_name=f"demo_scenario_{idx+1}.md",
                                mime="text/markdown",
                                key=f"dl_demo_{idx}"
                            )
                        with tab_trace:
                            st.json(result["routing_details"])
                    except Exception as e:
                        st.error(f"Failed to process scenario: {e}")
            st.write("")


def show_multi_agent_demo():
    """Renders a custom Sequential Multi-Agent Collaboration flow."""
    st.markdown('<div class="main-title">Multi-Agent Demo</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Run multiple specialized agents sequentially to collaborate on a single task</div>', unsafe_allow_html=True)
    
    st.markdown("""
    This demo shows **collaborative multi-agent chaining**:
    1. **Planning Agent** decomposes the request into an architectural plan.
    2. **Coding Agent** takes the plan and generates the functional codebase scripts.
    3. **Debugger Agent** inspects the code for syntax, logic, or security gaps.
    """)
    
    col_input, col_action = st.columns([3, 1])
    with col_input:
        user_input = st.text_area("Define a complex development task:", value="Build a secure user authentication API endpoint with JSON Web Tokens (JWT).", height=80)
    with col_action:
        st.write("")
        st.write("")
        run_chain = st.button("🚀 Execute Collaborative Chain", use_container_width=True)
        
    if run_chain and user_input:
        steps_placeholder = st.container()
        
        with steps_placeholder:
            # Step 1: Planning
            st.write("---")
            st.subheader("Step 1: Planning Agent 🗺️")
            with st.spinner("Generating milestone roadmap..."):
                try:
                    planner = st.session_state.registry.get_agent("planning")
                    plan_out = planner.run(f"Create an architectural layout and milestones to build: {user_input}", memory_context="")
                    st.success("Milestones established!")
                    st.markdown(plan_out)
                except Exception as e:
                    st.error(f"Planner failed: {e}")
                    plan_out = "Failed planning stage."
                    
            # Step 2: Coding
            st.write("---")
            st.subheader("Step 2: Coding Agent 💻")
            with st.spinner("Translating milestones to source code..."):
                try:
                    coder = st.session_state.registry.get_agent("coding")
                    code_prompt = f"Implement the source code following this plan:\n\n{plan_out}"
                    code_out = coder.run(code_prompt, memory_context="")
                    st.success("Source code generated!")
                    st.code(code_out, language="python")
                except Exception as e:
                    st.error(f"Coder failed: {e}")
                    code_out = "Failed coding stage."
                    
            # Step 3: Debugger
            st.write("---")
            st.subheader("Step 3: Debugger Agent 🩺")
            with st.spinner("Auditing codebase for bugs/security gaps..."):
                try:
                    debugger = st.session_state.registry.get_agent("debugger")
                    debug_prompt = f"Verify if there are security loopholes or flaws in this code, and fix them:\n\n{code_out}"
                    debug_out = debugger.run(debug_prompt, memory_context="")
                    st.success("Security & logical audit complete!")
                    st.markdown(debug_out)
                except Exception as e:
                    st.error(f"Debugger failed: {e}")
                    debug_out = "Failed debugging stage."
                    
            # Export Combined
            st.write("---")
            st.subheader("💾 Export Collaborative Results")
            combined_report = f"""# Multi-Agent Collaboration Report
## Task
{user_input}

## Step 1: Architectural Plan
{plan_out}

## Step 2: Generated Code
```python
{code_out}
```

## Step 3: Debugger & Security Audit
{debug_out}
"""
            st.download_button(
                label="📥 Export Complete Combined Report",
                data=combined_report,
                file_name="collaborative_agent_report.md",
                mime="text/markdown",
                use_container_width=True
            )


def show_workflow_viz():
    """Renders the Workflow Visualization Page."""
    st.markdown('<div class="main-title">Workflow Visualization</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Interactive mapping of the orchestrator pipeline architecture</div>', unsafe_allow_html=True)
    
    st.write("Below is the structural pipeline showing how a developer query is processed, routed, and answered.")
    
    # Render pipeline chart
    col_info, col_chart = st.columns([1, 1])
    
    with col_info:
        st.subheader("Pipeline Milestones")
        st.markdown("""
        1. **User Request**: Developer inputs a prompt via CLI or Streamlit UI.
        2. **Task Router**: Parses keywords and matches prompt intents to specific agents. Falls back to LLM Semantic check if online.
        3. **Registry Match**: Fetches the correct agent matching the key. Default is base coding agent.
        4. **Memory Injection**: Pulls previous threads, limits size, and feeds historical context.
        5. **Agent Run**: System prompt is merged with context and executed via the LLM Provider.
        6. **Memory Save**: Updates the global state thread with new messages.
        """)
        
    with col_chart:
        st.subheader("Interactive Visual Flowchart")
        
        # Draw interactive visual flow using styled HTML boxes
        st.markdown("""
        <div class="flow-container">
            <div class="flow-node highlight">
                <strong>1. User Prompt Input</strong><br>
                <span style="font-size:0.8rem; color:#94a3b8;">Streamlit UI / CLI</span>
            </div>
            <div class="flow-arrow">▼</div>
            <div class="flow-node">
                <strong>2. Task Router Classification</strong><br>
                <span style="font-size:0.8rem; color:#94a3b8;">Tiers 1-3 Rules or Semantic Check</span>
            </div>
            <div class="flow-arrow">▼</div>
            <div class="flow-node">
                <strong>3. Agent Registry Match</strong><br>
                <span style="font-size:0.8rem; color:#94a3b8;">Registry fetches agent class matching key</span>
            </div>
            <div class="flow-arrow">▼</div>
            <div class="flow-node">
                <strong>4. Memory Context Injection</strong><br>
                <span style="font-size:0.8rem; color:#94a3b8;">Injects historical chat context safely</span>
            </div>
            <div class="flow-arrow">▼</div>
            <div class="flow-node highlight">
                <strong>5. LLM Engine Execution</strong><br>
                <span style="font-size:0.8rem; color:#94a3b8;">Gemini / OpenAI / Offline Simulator</span>
            </div>
            <div class="flow-arrow">▼</div>
            <div class="flow-node">
                <strong>6. Output & Memory Save</strong><br>
                <span style="font-size:0.8rem; color:#94a3b8;">Saves interaction and shows result</span>
            </div>
        </div>
        """, unsafe_allow_html=True)


def show_memory_viewer():
    """Renders the Memory Viewer and Editor Page."""
    st.markdown('<div class="main-title">Memory Viewer & Editor</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Inspect, modify, delete or mock the stored conversation context</div>', unsafe_allow_html=True)
    
    history = st.session_state.memory.get_history()
    
    if not history:
        st.info("No conversation memory currently exists. Ask questions in the AI Assistant to see logs here.")
        
        # Mock loader
        st.subheader("📂 Seed Mock Memory for Testing")
        if st.button("🌱 Load Sample Developer Chat Session"):
            st.session_state.memory.add_message("user", "Explain how to initialize a git repo")
            st.session_state.memory.add_message("assistant", "Run `git init` in your project folder to start tracking files.")
            st.session_state.memory.add_message("user", "How do I ignore node_modules?")
            st.session_state.memory.add_message("assistant", "Create a `.gitignore` file and write `node_modules/` inside it.")
            st.rerun()
        return

    st.subheader("🧠 Thread Memory Logs")
    
    # Message Editor/Inspector
    edited_history = []
    
    for idx, msg in enumerate(history):
        col_role, col_content, col_del = st.columns([1, 4, 1])
        with col_role:
            role = st.selectbox(f"Role #{idx+1}", ["user", "assistant"], index=0 if msg["role"] == "user" else 1, key=f"role_{idx}")
        with col_content:
            content = st.text_area(f"Message #{idx+1} Content", value=msg["content"], height=70, key=f"content_{idx}")
        with col_del:
            st.write("")
            st.write("")
            delete = st.button("❌ Remove", key=f"del_{idx}")
            
        if not delete:
            edited_history.append({"role": role, "content": content})
            
    # Save changes button
    if len(edited_history) != len(history) or any(edited_history[i] != history[i] for i in range(len(edited_history))):
        st.session_state.memory.messages = edited_history
        st.success("Memory updated successfully!")
        st.rerun()
        
    st.write("---")
    st.subheader("💾 Export/Download Memory Transcript")
    raw_str = st.session_state.memory.get_history_as_string()
    
    col_dl1, col_dl2 = st.columns(2)
    with col_dl1:
        st.download_button(
            label="📥 Download JSON Log File",
            data=json.dumps(history, indent=2),
            file_name="devpilot_memory.json",
            mime="application/json"
        )
    with col_dl2:
        st.download_button(
            label="📥 Download Formatted TXT Log",
            data=raw_str,
            file_name="devpilot_memory.txt",
            mime="text/plain"
        )

# ----------------------------------------------------
# 3. Sidebar Navigation Panel
# ----------------------------------------------------
st.sidebar.title("🧭 Navigation")

selected_page = st.sidebar.radio(
    "Go To:",
    [
        "Home", 
        "AI Assistant", 
        "Agent Status Dashboard", 
        "Demo Scenarios", 
        "Multi-Agent Demo", 
        "Workflow Visualization", 
        "Memory Viewer"
    ]
)

st.sidebar.write("---")
st.sidebar.markdown(f"**LLM Mode**: `{st.session_state.llm.mode.upper()}`")
st.sidebar.markdown(f"**Memory Count**: `{len(st.session_state.memory.get_history())} messages`")

# Render page
if selected_page == "Home":
    show_home()
elif selected_page == "AI Assistant":
    show_assistant()
elif selected_page == "Agent Status Dashboard":
    show_agent_dashboard()
elif selected_page == "Demo Scenarios":
    show_demo_scenarios()
elif selected_page == "Multi-Agent Demo":
    show_multi_agent_demo()
elif selected_page == "Workflow Visualization":
    show_workflow_viz()
elif selected_page == "Memory Viewer":
    show_memory_viewer()
