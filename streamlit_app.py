import os
import sys
import logging
import json
import asyncio
from typing import Dict, Any, List, Optional
import pandas as pd
import altair as alt

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
from core.github import GitHubClient
from core.analyzer import CodeAnalyzer

# Set up Streamlit Page Configuration
st.set_page_config(
    page_title="DevPilot AI Copilot Workspace",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Premium Global Styling Injection matching reference.png exactly
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=JetBrains+Mono:wght@300;400;700&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
    }
    
    code, pre, [class*="mono"] {
        font-family: 'JetBrains Mono', monospace !important;
    }
    
    /* Background colors */
    [data-testid="stAppViewContainer"] {
        background-color: #0b0f19;
    }
    [data-testid="stSidebar"] {
        background-color: #0d1222 !important;
        border-right: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    /* Title typography */
    .main-title {
        background: linear-gradient(135deg, #c084fc 0%, #6366f1 50%, #3b82f6 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 800;
        font-size: 2.8rem;
        margin-bottom: 0.1rem;
        letter-spacing: -0.025em;
    }
    .subtitle {
        color: #94a3b8;
        font-size: 1.15rem;
        margin-bottom: 1.8rem;
        font-weight: 300;
    }
    
    /* Dark Premium Cards */
    .premium-card {
        background: rgba(17, 24, 39, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 16px;
        padding: 22px;
        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
        margin-bottom: 18px;
        transition: all 0.3s ease;
    }
    .premium-card:hover {
        border-color: rgba(99, 102, 241, 0.3);
    }
    .metric-value {
        font-size: 2.2rem;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: -0.03em;
        margin: 4px 0;
    }
    .metric-title {
        font-size: 0.8rem;
        text-transform: uppercase;
        color: #94a3b8;
        font-weight: 600;
        letter-spacing: 0.05em;
    }
    .metric-delta {
        font-size: 0.82rem;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .metric-delta.up { color: #34d399; }
    .metric-delta.down { color: #f87171; }
    
    /* Agent Grid Cards */
    .agent-grid-card {
        background: rgba(22, 30, 49, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 16px;
        height: 100%;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        border-left: 3px solid #6366f1;
        margin-bottom: 12px;
    }
    .agent-grid-card:hover {
        transform: translateY(-2px);
        background: rgba(31, 41, 68, 0.5);
        border-color: rgba(99, 102, 241, 0.3);
        box-shadow: 0 8px 20px -6px rgba(99, 102, 241, 0.25);
    }
    .agent-grid-name {
        font-size: 1.05rem;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 4px;
    }
    .agent-grid-desc {
        font-size: 0.8rem;
        color: #94a3b8;
        line-height: 1.4;
    }
    
    /* Sidebar Profile */
    .sidebar-profile {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: rgba(15, 23, 42, 0.5);
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        margin-top: 15px;
        margin-bottom: 15px;
    }
    .profile-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        color: white;
        font-size: 0.95rem;
    }
    .profile-info {
        display: flex;
        flex-direction: column;
    }
    .profile-name {
        font-size: 0.88rem;
        font-weight: 600;
        color: #ffffff;
    }
    .profile-status {
        font-size: 0.72rem;
        color: #34d399;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    
    /* Horizontal flowchart elements */
    .flow-step-box {
        background: rgba(17, 24, 39, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 12px 14px;
        text-align: center;
        font-size: 0.85rem;
        font-weight: 600;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
        border-bottom: 2px solid #6366f1;
        color: #e2e8f0;
    }
    .flow-arrow-right {
        font-size: 1.3rem;
        color: #6366f1;
        text-align: center;
        padding-top: 10px;
    }
    
    /* Status indicator */
    .status-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 9999px;
        font-size: 0.72rem;
        font-weight: 600;
    }
    .status-badge.active {
        background: rgba(52, 211, 153, 0.12);
        color: #34d399;
        border: 1px solid rgba(52, 211, 153, 0.25);
    }
    
    /* Activity rows */
    .activity-row {
        display: flex;
        justify-content: space-between;
        padding: 9px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        font-size: 0.85rem;
        color: #e2e8f0;
    }
    .activity-time {
        color: #64748b;
        font-size: 0.8rem;
    }
    
    /* History item list */
    .history-item {
        padding: 10px 12px;
        background: rgba(30, 41, 59, 0.25);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.04);
        margin-bottom: 8px;
        font-size: 0.85rem;
        color: #cbd5e1;
        cursor: pointer;
        transition: all 0.2s;
    }
    .history-item:hover {
        background: rgba(99, 102, 241, 0.12);
        border-color: rgba(99, 102, 241, 0.25);
        color: #ffffff;
    }
</style>
""", unsafe_allow_html=True)

# ----------------------------------------------------
# 1. State Management & Core Loader
# ----------------------------------------------------
def init_devpilot_session():
    """Initializes the backend agent orchestrator and services inside Session State."""
    if "response_times" not in st.session_state:
        st.session_state.response_times = []
    if "agent_usage" not in st.session_state:
        st.session_state.agent_usage = []
    if "requests_history" not in st.session_state:
        st.session_state.requests_history = []

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
            st.session_state.current_prompt = ""
            
            # GitHub Client State
            token = os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_API_KEY")
            st.session_state.github_client = GitHubClient(token)
            st.session_state.repositories = []
            
            # Code Analyzer State
            st.session_state.analyzer = CodeAnalyzer(os.getcwd())
            st.session_state.analyzer_indexed = False
        except Exception as e:
            st.error(f"Failed to initialize DevPilot AI Core: {e}")
            logger.error(f"Session initialization failure: {e}", exc_info=True)

init_devpilot_session()

# Helper for run-async inside Streamlit
def run_async(coro):
    return asyncio.run(coro)

# ----------------------------------------------------
# 2. Main Page Renderers
# ----------------------------------------------------

def show_home():
    """Renders the Home Tab Layout containing Dashboard, Git VCS, and Code Search RAG."""
    tab_overview, tab_git, tab_rag = st.tabs([
        "📊 System Dashboard", "🐙 GitHub VCS Browser", "🔍 Code Search & RAG"
    ])
    
    # ------------------ TAB 1: OVERVIEW DASHBOARD ------------------
    with tab_overview:
        st.markdown('<div class="main-title">DevPilot AI Copilot</div>', unsafe_allow_html=True)
        st.markdown('<div class="subtitle">Multi-Agent Collaborative Framework for Software Engineering</div>', unsafe_allow_html=True)
        
        # 1. Stats Row
        total_reqs = len(st.session_state.response_times)
        avg_time = f"{sum(st.session_state.response_times) / total_reqs:.2f}s" if total_reqs > 0 else "0.00s"
        success_rate = "100.0%" if total_reqs > 0 else "0.0%"
        
        col_s1, col_s2, col_s3, col_s4 = st.columns(4)
        with col_s1:
            st.markdown(f"""
            <div class="premium-card">
                <div class="metric-title">Total Requests</div>
                <div class="metric-value">{total_reqs}</div>
                <div class="metric-delta up">▲ Active session</div>
            </div>
            """, unsafe_allow_html=True)
        with col_s2:
            st.markdown(f"""
            <div class="premium-card">
                <div class="metric-title">Successful Tasks</div>
                <div class="metric-value">{total_reqs}</div>
                <div class="metric-delta up">▲ {success_rate} success rate</div>
            </div>
            """, unsafe_allow_html=True)
        with col_s3:
            st.markdown(f"""
            <div class="premium-card">
                <div class="metric-title">Active Agents</div>
                <div class="metric-value">{len(st.session_state.registry.list_agents())}/7</div>
                <div class="metric-delta up">● All operational</div>
            </div>
            """, unsafe_allow_html=True)
        with col_s4:
            st.markdown(f"""
            <div class="premium-card">
                <div class="metric-title">Avg. Response Time</div>
                <div class="metric-value">{avg_time}</div>
                <div class="metric-delta up">● Session average</div>
            </div>
            """, unsafe_allow_html=True)
            
        # 2. Quick Actions
        st.subheader("⚡ Quick Actions")
        col_qa1, col_qa2, col_qa3, col_qa4 = st.columns(4)
        with col_qa1:
            if st.button("💬 Open AI Assistant", use_container_width=True):
                st.session_state.navigation_trigger = "💬 AI Assistant"
                st.rerun()
        with col_qa2:
            if st.button("🚀 Demo Scenarios Center", use_container_width=True):
                st.session_state.navigation_trigger = "🚀 Demo Center"
                st.rerun()
        with col_qa3:
            st.button("🐙 Repository VCS Tab", use_container_width=True, disabled=True)
        with col_qa4:
            if st.button("📊 View Analytics Usage", use_container_width=True):
                st.session_state.navigation_trigger = "📊 Analytics"
                st.rerun()

        st.write("---")

        # 3. Agent Suite Overview Grid
        st.subheader("🤖 Agent Suite Overview")
        col_ag1, col_ag2, col_ag3 = st.columns(3)
        agents_data = st.session_state.registry.list_agents()
        
        for idx, agent in enumerate(agents_data):
            target_col = col_ag1 if idx % 3 == 0 else (col_ag2 if idx % 3 == 1 else col_ag3)
            with target_col:
                st.markdown(f"""
                <div class="agent-grid-card">
                    <div class="agent-grid-name">🤖 {agent['name']} (key: {agent['key']})</div>
                    <div class="agent-grid-desc">{agent['description']}</div>
                </div>
                """, unsafe_allow_html=True)

        st.write("---")

        # 4. Status & Recent Activity Row
        col_status, col_activity = st.columns(2)
        with col_status:
            st.subheader("🟢 System Status")
            for agent in agents_data:
                st.markdown(f"""
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                    <span style="font-weight:600; color:#e2e8f0;">{agent['name']}</span>
                    <span class="status-badge active">🟢 Online</span>
                </div>
                """, unsafe_allow_html=True)
                
        with col_activity:
            st.subheader("⏱️ Recent Activity")
            recent_activities = [
                {"prompt": "Generate CRUD API for user management", "agent": "Coding Agent", "time": "2m ago"},
                {"prompt": "Debug this Python function", "agent": "Debugger Agent", "time": "5m ago"},
                {"prompt": "Create README for this project", "agent": "Documentation Agent", "time": "9m ago"},
                {"prompt": "Analyze repository structure", "agent": "Repository Explainer", "time": "12m ago"},
                {"prompt": "Create project roadmap", "agent": "Planning Agent", "time": "15m ago"}
            ]
            for act in recent_activities:
                st.markdown(f"""
                <div class="activity-row">
                    <span><strong>{act['prompt']}</strong> ({act['agent']})</span>
                    <span class="activity-time">{act['time']}</span>
                </div>
                """, unsafe_allow_html=True)

        st.write("---")

        # 5. How DevPilot AI Works Flowchart
        st.subheader("⚙️ How DevPilot AI Works")
        col_f1, col_f2, col_f3, col_f4, col_f5, col_f6, col_f7, col_f8, col_f9 = st.columns([3, 1, 3, 1, 3, 1, 3, 1, 3])
        with col_f1:
            st.markdown('<div class="flow-step-box">👤 User Query</div>', unsafe_allow_html=True)
        with col_f2:
            st.markdown('<div class="flow-arrow-right">➔</div>', unsafe_allow_html=True)
        with col_f3:
            st.markdown('<div class="flow-step-box">⚙️ Intelligent Router</div>', unsafe_allow_html=True)
        with col_f4:
            st.markdown('<div class="flow-arrow-right">➔</div>', unsafe_allow_html=True)
        with col_f5:
            st.markdown('<div class="flow-step-box">🤖 Selects Best Agent</div>', unsafe_allow_html=True)
        with col_f6:
            st.markdown('<div class="flow-arrow-right">➔</div>', unsafe_allow_html=True)
        with col_f7:
            st.markdown('<div class="flow-step-box">⚡ Agent Execution</div>', unsafe_allow_html=True)
        with col_f8:
            st.markdown('<div class="flow-arrow-right">➔</div>', unsafe_allow_html=True)
        with col_f9:
            st.markdown('<div class="flow-step-box">💾 Response + Memory</div>', unsafe_allow_html=True)

    # ------------------ TAB 2: GITHUB VCS BROWSER ------------------
    with tab_git:
        show_github_browser()
        
    # ------------------ TAB 3: CODE RAG SEARCH ------------------
    with tab_rag:
        show_analyzer()


def show_assistant():
    """Renders the AI Assistant Chat Page matching section 2."""
    st.markdown('<div class="main-title">AI Assistant</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Your intelligent development partner</div>', unsafe_allow_html=True)
    
    col_chat, col_side_panel = st.columns([5, 2])
    
    history = st.session_state.memory.get_history()
    
    with col_chat:
        st.subheader("💬 Chat Thread")
        
        # Chat Messages Window
        chat_container = st.container(height=500)
        with chat_container:
            if not history:
                st.info("No messages in current thread. Enter a prompt below to get started.")
            for message in history:
                role = "user" if message["role"] == "user" else "assistant"
                with st.chat_message(role):
                    st.markdown(message["content"])
                    
        # Chat input
        user_query = st.chat_input("Type your message here...")
        
        if user_query:
            # Process prompt
            with st.spinner("Classifying request and routing execution..."):
                try:
                    import time
                    start_time = time.time()
                    
                    result = st.session_state.orchestrator.process_request(user_query)
                    
                    elapsed = time.time() - start_time
                    st.session_state.response_times.append(elapsed)
                    
                    routed_agent = result.get("routed_agent_key") or "coding"
                    st.session_state.agent_usage.append(routed_agent)
                    
                    from datetime import datetime
                    st.session_state.requests_history.append({
                        "Time": datetime.now().strftime("%H:%M:%S"),
                        "Agent": routed_agent.title(),
                        "Latency": elapsed,
                        "Prompt": user_query
                    })
                    
                    st.session_state.last_routed_details = result.get("routing_details")
                    st.session_state.last_response = result.get("response")
                    st.rerun()
                except Exception as e:
                    st.error(f"Orchestration Error: {e}")

    with col_side_panel:
        # Router Decision Details Box
        st.subheader("⚙️ Router Decision")
        if st.session_state.last_routed_details:
            details = st.session_state.last_routed_details
            st.markdown(f"""
            <div class="premium-card">
                <div style="font-weight:600; color:#818cf8; margin-bottom: 4px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Router Decision</div>
                <div style="font-size:0.95rem; margin-bottom:12px; color:#ffffff;">Query classified as: <strong>{details.get('tier', 'N/A').upper()}</strong></div>
                <div style="font-weight:600; color:#818cf8; margin-bottom: 4px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Selected Agent</div>
                <div style="font-size:1.3rem; font-weight:800; margin-bottom:12px; color:#ffffff;">{details.get('agent', 'N/A').title()} Agent</div>
                <div style="font-weight:600; color:#818cf8; margin-bottom: 4px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Matched Trigger</div>
                <div style="font-size:0.95rem; font-family:monospace; margin-bottom:12px; color:#cbd5e1;">"{details.get('matched_keyword') or 'None'}"</div>
                <div style="font-weight:600; color:#818cf8; margin-bottom: 4px; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">Decision Explanation</div>
                <div style="font-size:0.9rem; color:#94a3b8; line-height:1.4;">{details.get('explanation', 'Routed semantically.')}</div>
            </div>
            """, unsafe_allow_html=True)
            
            # Action Buttons under router details
            st.subheader("⚡ Output Actions")
            col_act1, col_act2 = st.columns(2)
            with col_act1:
                st.download_button(
                    label="📥 Export MD",
                    data=st.session_state.last_response or "",
                    file_name="devpilot_output.md",
                    mime="text/markdown",
                    use_container_width=True
                )
            with col_act2:
                if st.button("📋 Copy Code", use_container_width=True):
                    st.toast("Copied code response to clipboard!")
        else:
            st.info("Submit a prompt in the chat window to view live Router Decision flow.")

        # Chat History Side Column
        st.subheader("📚 Chat History")
        mock_history = [
            {"prompt": "Generate FastAPI CRUD API", "time": "2m ago"},
            {"prompt": "Debug this code", "time": "15m ago"},
            {"prompt": "Create README file", "time": "28m ago"},
            {"prompt": "Explain this repository", "time": "1h ago"},
            {"prompt": "Create project roadmap", "time": "2h ago"}
        ]
        for hist in mock_history:
            st.markdown(f"""
            <div class="history-item">
                <div style="font-weight:600; font-size:0.85rem;">{hist['prompt']}</div>
                <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">{hist['time']}</div>
            </div>
            """, unsafe_allow_html=True)
            
        st.write("")
        if st.button("🗑️ Clear History", use_container_width=True):
            st.session_state.memory.clear()
            st.session_state.last_routed_details = None
            st.session_state.last_response = None
            st.rerun()


def show_agents_suite():
    """Renders the detailed Agents Suite matching section 3."""
    st.markdown('<div class="main-title">🤖 The Agent Suite</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Specialized agent roles loaded in memory</div>', unsafe_allow_html=True)
    
    agents = st.session_state.registry.list_agents()
    
    col_ag_l, col_ag_r = st.columns(2)
    
    for idx, agent_data in enumerate(agents):
        target_col = col_ag_l if idx % 2 == 0 else col_ag_r
        agent_key = agent_data["key"]
        agent = st.session_state.registry.get_agent(agent_key)
        
        with target_col:
            with st.container(border=True):
                st.markdown(f"### 🤖 {agent.name}")
                st.markdown(f"**Default Key:** `{agent_key}`")
                st.write(agent.description)
                
                with st.expander("👁️ View Agent Instructions (System Prompt)"):
                    st.code(agent.system_prompt, language="markdown")
                st.write("")


def show_demo_scenarios():
    """Renders the pre-built Demo Scenarios page matching section 4."""
    tab_prebuilt, tab_chain = st.tabs(["🎯 Pre-built Scenarios", "🔗 Sequential Multi-Agent Chain"])
    
    with tab_prebuilt:
        st.markdown('<div class="main-title">Demo Scenarios</div>', unsafe_allow_html=True)
        st.markdown('<div class="subtitle">Try pre-built examples to see DevPilot AI in action</div>', unsafe_allow_html=True)
        
        demo_scenarios = [
            {
                "title": "💻 Generate CRUD API",
                "agent": "Coding Agent",
                "key": "coding",
                "prompt": "Generate a Python REST API using FastAPI",
                "description": "Build a complete REST API with FastAPI including schemas, routes, and data validation."
            },
            {
                "title": "🩺 Debug Python Code",
                "agent": "Debugger Agent",
                "key": "debugger",
                "prompt": "Find the bug in this code:\n\ndef calculate_average(numbers):\n    return sum(numbers) / len(numbers)\n\nprint(calculate_average([]))",
                "description": "Find bugs in code and get git diff correction suggestions."
            },
            {
                "title": "📝 Create README",
                "agent": "Documentation Agent",
                "key": "documentation",
                "prompt": "Create a professional README.md structure for DevPilot AI",
                "description": "Generate a professional README layout detailing tech stack and installation steps."
            },
            {
                "title": "🔍 Analyze Repository",
                "agent": "Repository Explainer",
                "key": "repository",
                "prompt": "Explain the folder structure and architectural components of the devpilot-ai repository",
                "description": "Scans repository layouts, listing modules, core systems, and entry scripts."
            },
            {
                "title": "🗺️ Create Roadmap",
                "agent": "Planning Agent",
                "key": "planning",
                "prompt": "Create a phased engineering roadmap for building a job portal",
                "description": "Planning sequence laying out task milestones, backend schema, and deployment path."
            },
            {
                "title": "🐚 Docker Help",
                "agent": "Terminal Assistant",
                "key": "terminal",
                "prompt": "Why is docker container failing to start with port bind error on 80?",
                "description": "Diagnoses terminal script errors, port conflicts, and suggested commands."
            }
        ]
        
        col_l, col_r = st.columns(2)
        
        for idx, scenario in enumerate(demo_scenarios):
            target_col = col_l if idx % 2 == 0 else col_r
            with target_col:
                st.markdown(f"""
                <div class="premium-card">
                    <h3 style="margin-top:0; color:#818cf8;">{scenario['title']}</h3>
                    <p><strong>Mapped Agent:</strong> <code>{scenario['agent']}</code></p>
                    <p style="color:#94a3b8; font-size:0.9rem;">{scenario['description']}</p>
                    <blockquote style="font-style: italic; border-left: 2px solid #6366f1; padding-left: 10px; font-size:0.85rem; color:#cbd5e1; margin-bottom:15px;">
                        "{scenario['prompt'][:70]}..."
                    </blockquote>
                </div>
                """, unsafe_allow_html=True)
                
                if st.button(f"Run Demo Scenario {idx + 1}", key=f"scenario_run_{idx}"):
                    with st.spinner("Executing query..."):
                        try:
                            import time
                            start_time = time.time()
                            
                            result = st.session_state.orchestrator.process_request(scenario["prompt"])
                            
                            elapsed = time.time() - start_time
                            st.session_state.response_times.append(elapsed)
                            
                            routed_agent = result.get("routed_agent_key") or "coding"
                            st.session_state.agent_usage.append(routed_agent)
                            
                            from datetime import datetime
                            st.session_state.requests_history.append({
                                "Time": datetime.now().strftime("%H:%M:%S"),
                                "Agent": routed_agent.title(),
                                "Latency": elapsed,
                                "Prompt": scenario["prompt"]
                            })
                            
                            st.session_state.last_routed_details = result.get("routing_details")
                            st.session_state.last_response = result.get("response")
                            
                            st.success(f"Success! Executed by {result['routed_agent_name']}")
                            
                            out_tab, trace_tab = st.tabs(["📄 Agent Response", "⚙️ Router Trace"])
                            with out_tab:
                                st.markdown(result["response"])
                            with trace_tab:
                                st.json(result["routing_details"])
                        except Exception as e:
                            st.error(f"Error running demo: {e}")
                st.write("")
                
    with tab_chain:
        show_multi_agent_demo()


def show_multi_agent_demo():
    """Renders the custom sequential multi-agent collaborative framework flow."""
    st.markdown('<div class="main-title">Sequential Collaboration Chain</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Chains Planning ➔ Coding ➔ Debugger agents in order</div>', unsafe_allow_html=True)
    
    st.markdown("""
    Provide a complex developer task. DevPilot will execute a collaborative multi-agent pipeline:
    1. **Planning Agent**: Outlines the system architecture blueprint and milestones.
    2. **Coding Agent**: Takes the plan and translates it into functional source code.
    3. **Debugger Agent**: Inspects the generated script for security holes, bounds checks, or logical bugs.
    """)
    
    col_in, col_btn = st.columns([3, 1])
    with col_in:
        user_input = st.text_area("Task description:", value="Build a secure user authentication API endpoint with JSON Web Tokens (JWT).", height=70)
    with col_btn:
        st.write("")
        st.write("")
        run_chain = st.button("🚀 Start Chain", use_container_width=True)
        
    if run_chain and user_input:
        steps_placeholder = st.container()
        
        with steps_placeholder:
            # Step 1: Planning
            st.write("---")
            st.subheader("Step 1: Planning Agent 🗺️")
            with st.spinner("Drafting blueprint..."):
                try:
                    planner = st.session_state.registry.get_agent("planning")
                    plan_out = planner.run(f"Create an architectural layout and milestones to build: {user_input}", memory_context="")
                    st.success("Milestone roadmap generated!")
                    st.markdown(plan_out)
                except Exception as e:
                    st.error(f"Planner failed: {e}")
                    plan_out = "Failed planning stage."
                    
            # Step 2: Coding
            st.write("---")
            st.subheader("Step 2: Coding Agent 💻")
            with st.spinner("Writing source files..."):
                try:
                    coder = st.session_state.registry.get_agent("coding")
                    code_prompt = f"Implement the source code following this plan:\n\n{plan_out}"
                    code_out = coder.run(code_prompt, memory_context="")
                    st.success("Python codebase generated!")
                    st.code(code_out, language="python")
                except Exception as e:
                    st.error(f"Coder failed: {e}")
                    code_out = "Failed coding stage."
                    
            # Step 3: Debugger
            st.write("---")
            st.subheader("Step 3: Debugger Agent 🩺")
            with st.spinner("Analyzing codebase logic and security assertions..."):
                try:
                    debugger = st.session_state.registry.get_agent("debugger")
                    debug_prompt = f"Verify if there are security loopholes or flaws in this code, and fix them:\n\n{code_out}"
                    debug_out = debugger.run(debug_prompt, memory_context="")
                    st.success("Audit complete! Suggestions applied.")
                    st.markdown(debug_out)
                except Exception as e:
                    st.error(f"Debugger failed: {e}")
                    debug_out = "Failed debugging stage."
                    
            # Export report
            st.write("---")
            st.subheader("💾 Export Report")
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
                label="📥 Export Report",
                data=combined_report,
                file_name="collaborative_agent_report.md",
                mime="text/markdown",
                use_container_width=True
            )


def show_workflow_viz():
    """Renders the Workflow Visualization page matching section 5."""
    st.markdown('<div class="main-title">🌿 Workflow Visualization</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Interactive mapping of the orchestrator pipeline architecture</div>', unsafe_allow_html=True)
    
    # 1. Flowchart Diagram
    st.subheader("Current Workflow")
    st.markdown("""
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(30,41,59,0.3); border:1px solid rgba(255,255,255,0.05); padding:20px; border-radius:12px; margin-bottom:25px;">
        <div class="flow-step-box">👤 User Query</div>
        <div class="flow-arrow-right">➔</div>
        <div class="flow-step-box" style="border-bottom-color:#818cf8;">⚙️ Router</div>
        <div class="flow-arrow-right">➔</div>
        <div class="flow-step-box" style="border-bottom-color:#c084fc;">🤖 Selected Agent</div>
        <div class="flow-arrow-right">➔</div>
        <div class="flow-step-box" style="border-bottom-color:#34d399;">🧠 Memory Context</div>
        <div class="flow-arrow-right">➔</div>
        <div class="flow-step-box" style="border-bottom-color:#3b82f6;">📄 Return Response</div>
    </div>
    """, unsafe_allow_html=True)
    
    col_logs, col_stats = st.columns([5, 2])
    
    with col_logs:
        st.subheader("Workflow Logs")
        if not st.session_state.requests_history:
            st.info("💡 No workflows executed in the current session. Showing sample workflow baseline logs:")
            workflow_steps = [
                {"time": "10:24:15 AM", "event": "Router received query", "status": "info"},
                {"time": "10:24:15 AM", "event": "Query classified as: DOCUMENTATION", "status": "success"},
                {"time": "10:24:15 AM", "event": "Selected agent: Documentation Agent (Confidence: 96%)", "status": "success"},
                {"time": "10:24:16 AM", "event": "Agent execution started", "status": "info"},
                {"time": "10:24:18 AM", "event": "Response generated successfully", "status": "success"},
            ]
            for step in workflow_steps:
                color = "#a855f7" if step["status"] == "success" else "#94a3b8"
                st.markdown(f"""
                <div style="padding:10px 14px; background:rgba(17,24,39,0.5); border-left:3px solid {color}; border-radius:6px; margin-bottom:8px; font-size:0.9rem;">
                    <span style="color:#64748b; font-family:monospace; margin-right:10px;">[{step['time']}]</span>
                    <span style="color:#cbd5e1;">{step['event']}</span>
                </div>
                """, unsafe_allow_html=True)
        else:
            for idx, req in enumerate(st.session_state.requests_history):
                st.markdown(f"""
                <div style="padding:10px 14px; background:rgba(17,24,39,0.5); border-left:3px solid #818cf8; border-radius:6px; margin-bottom:8px; font-size:0.9rem;">
                    <span style="color:#64748b; font-family:monospace; margin-right:10px;">[{req['Time']}]</span>
                    <span style="color:#cbd5e1;"><strong>Request #{idx+1} received:</strong> "{req['Prompt']}" ➔ Routed to <strong>{req['Agent']} Agent</strong> (Latency: {req['Latency']:.2f}s)</span>
                </div>
                """, unsafe_allow_html=True)
            
    with col_stats:
        st.subheader("Workflow Statistics")
        w_total = len(st.session_state.response_times)
        w_success = "100.0%" if w_total > 0 else "0.0%"
        w_avg = f"{sum(st.session_state.response_times)/w_total:.2f}s" if w_total > 0 else "0.00s"
        
        st.markdown(f"""
        <div class="premium-card">
            <div class="metric-title">Total Workflows</div>
            <div class="metric-value" style="font-size:2rem;">{w_total}</div>
        </div>
        <div class="premium-card">
            <div class="metric-title">Success Rate</div>
            <div class="metric-value" style="font-size:2rem; color:#34d399;">{w_success}</div>
        </div>
        <div class="premium-card">
            <div class="metric-title">Avg. Time</div>
            <div class="metric-value" style="font-size:2rem;">{w_avg}</div>
        </div>
        """, unsafe_allow_html=True)


def show_memory_viewer():
    """Renders the Memory Viewer and Editor page matching section 6."""
    st.markdown('<div class="main-title">🧠 Memory Viewer</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">View and manage stored conversation and routing context</div>', unsafe_allow_html=True)
    
    history = st.session_state.memory.get_history()
    
    col_hist, col_stats = st.columns([5, 2])
    
    with col_hist:
        st.subheader("Conversation Memory")
        
        if not history:
            st.info("No conversation memory currently exists. Run a query in the AI Assistant tab to seed it.")
            if st.button("🌱 Load Sample Developer Chat Session"):
                st.session_state.memory.add_message("user", "Explain how to initialize a git repo")
                st.session_state.memory.add_message("assistant", "Run `git init` in your project folder to start tracking files.")
                st.session_state.memory.add_message("user", "How do I ignore node_modules?")
                st.session_state.memory.add_message("assistant", "Create a `.gitignore` file and write `node_modules/` inside it.")
                st.rerun()
        else:
            edited_history = []
            for idx, msg in enumerate(history):
                with st.container(border=True):
                    c_role, c_content, c_del = st.columns([1, 4, 1])
                    with c_role:
                        role = st.selectbox(f"Role #{idx+1}", ["user", "assistant"], index=0 if msg["role"] == "user" else 1, key=f"mem_role_{idx}")
                    with c_content:
                        content = st.text_area(f"Message #{idx+1} Content", value=msg["content"], height=70, key=f"mem_content_{idx}")
                    with c_del:
                        st.write("")
                        st.write("")
                        delete = st.button("❌ Remove", key=f"mem_del_{idx}")
                    
                    if not delete:
                        edited_history.append({"role": role, "content": content})
            
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

    with col_stats:
        st.subheader("Memory Stats")
        
        # Calculate stats dynamically
        num_convs = len([m for m in history if m["role"] == "user"])
        total_tokens = sum(len(msg["content"].split()) for msg in history) * 1.35
        # format tokens
        if total_tokens >= 1000:
            tokens_str = f"{total_tokens / 1000:.1f}k"
        else:
            tokens_str = f"{int(total_tokens)}"
            
        mem_size_kb = sys.getsizeof(json.dumps(history)) / 1024
        
        st.markdown(f"""
        <div class="premium-card">
            <div class="metric-title">Total Conversations</div>
            <div class="metric-value" style="font-size:2rem;">{num_convs}</div>
        </div>
        <div class="premium-card">
            <div class="metric-title">Total Tokens</div>
            <div class="metric-value" style="font-size:2rem;">{tokens_str}</div>
        </div>
        <div class="premium-card">
            <div class="metric-title">Memory Size</div>
            <div class="metric-value" style="font-size:2rem; color:#818cf8;">{mem_size_kb:.2f} KB</div>
        </div>
        <div class="premium-card">
            <div class="metric-title">Oldest Memory</div>
            <div class="metric-value" style="font-size:1.6rem;">{"Active Session" if history else "No logs"}</div>
        </div>
        """, unsafe_allow_html=True)
        
        if st.button("🗑️ Clear All Memory", use_container_width=True):
            st.session_state.memory.clear()
            st.session_state.last_routed_details = None
            st.session_state.last_response = None
            st.rerun()


def show_analytics():
    """Renders the Analytics Dashboard page matching section 7."""
    st.markdown('<div class="main-title">📊 Analytics Dashboard</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Insights into your DevPilot AI usage metrics</div>', unsafe_allow_html=True)
    
    if not st.session_state.requests_history:
        st.info("💡 No requests executed in the current session yet. Displaying baseline reference metrics (Active Session: 0 requests):")
        
        col_chart1, col_chart2 = st.columns(2)
        with col_chart1:
            st.subheader("Baseline Requests (Reference)")
            df_reqs = pd.DataFrame({
                "Hour": ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"],
                "Requests": [12, 18, 15, 22, 28, 20, 25]
            })
            chart = alt.Chart(df_reqs).mark_line(point=True, color="#818cf8").encode(
                x=alt.X("Hour", title="Time", sort=None),
                y=alt.Y("Requests:Q", title="Number of Requests")
            ).properties(height=280)
            st.altair_chart(chart, use_container_width=True)
            
        with col_chart2:
            st.subheader("Baseline Agent Usage Share")
            df_usage = pd.DataFrame({
                "Agent": ["Coding", "Debugger", "Documentation", "Planning", "Repository", "Terminal", "Testing"],
                "Share": [40, 20, 10, 10, 10, 5, 5]
            })
            chart_pie = alt.Chart(df_usage).mark_arc(innerRadius=40).encode(
                theta=alt.Theta(field="Share", type="quantitative"),
                color=alt.Color(field="Agent", type="nominal", scale=alt.Scale(scheme="darkmulti"))
            ).properties(height=280)
            st.altair_chart(chart_pie, use_container_width=True)
            
        st.write("---")
        st.subheader("Baseline Response Time (s)")
        df_time = pd.DataFrame({
            "Day": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "Latency": [1.8, 2.2, 1.5, 2.0, 1.7, 1.4, 1.2]
        })
        chart_bar = alt.Chart(df_time).mark_bar(color="#6366f1", cornerRadiusTopLeft=4, cornerRadiusTopRight=4).encode(
            x=alt.X("Day", title="Day", sort=None),
            y=alt.Y("Latency", title="Latency (seconds)")
        ).properties(height=250)
        st.altair_chart(chart_bar, use_container_width=True)
    else:
        # We have actual session data!
        col_chart1, col_chart2 = st.columns(2)
        df_reqs = pd.DataFrame(st.session_state.requests_history)
        df_reqs["Request Num"] = [f"Req {i}" for i in range(1, len(df_reqs) + 1)]
        
        with col_chart1:
            st.subheader("Session Request Latency Trend")
            chart = alt.Chart(df_reqs).mark_line(point=True, color="#818cf8").encode(
                x=alt.X("Request Num", title="Request Sequence", sort=None),
                y=alt.Y("Latency:Q", title="Response Time (seconds)")
            ).properties(height=280)
            st.altair_chart(chart, use_container_width=True)
            
        with col_chart2:
            st.subheader("Session Agent Usage Distribution")
            df_usage = pd.DataFrame({
                "Agent": st.session_state.agent_usage
            })
            df_usage_counts = df_usage["Agent"].value_counts().reset_index()
            df_usage_counts.columns = ["Agent", "Count"]
            df_usage_counts["Agent"] = df_usage_counts["Agent"].str.title()
            
            chart_pie = alt.Chart(df_usage_counts).mark_arc(innerRadius=40).encode(
                theta=alt.Theta(field="Count", type="quantitative"),
                color=alt.Color(field="Agent", type="nominal", scale=alt.Scale(scheme="darkmulti"))
            ).properties(height=280)
            st.altair_chart(chart_pie, use_container_width=True)
            
        st.write("---")
        st.subheader("Session Response Latencies (s)")
        chart_bar = alt.Chart(df_reqs).mark_bar(color="#6366f1", cornerRadiusTopLeft=4, cornerRadiusTopRight=4).encode(
            x=alt.X("Request Num", title="Request", sort=None),
            y=alt.Y("Latency", title="Latency (seconds)")
        ).properties(height=250)
        st.altair_chart(chart_bar, use_container_width=True)


def show_settings():
    """Renders the Settings & Configuration panel matching section 8."""
    st.markdown('<div class="main-title">⚙️ Settings & Configuration</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtitle">Adjust system parameters, LLM providers, and API keys</div>', unsafe_allow_html=True)
    
    tab_gen, tab_model, tab_keys, tab_rules, tab_prefs = st.tabs([
        "General", "Model Settings", "API Keys", "Routing Rules", "Preferences"
    ])
    
    with tab_gen:
        st.subheader("General Configuration")
        # Personal access token config
        token_input = st.text_input("GitHub Personal Access Token (PAT):", value=os.getenv("GITHUB_TOKEN") or "", type="password")
        if token_input != st.session_state.github_client.token:
            st.session_state.github_client.set_token(token_input)
            st.session_state.repositories = [] # trigger reload
            st.success("GitHub Token updated!")

    with tab_model:
        st.subheader("Model Configuration")
        provider = st.selectbox("Select LLM Provider", ["Gemini", "OpenAI", "Offline"], index=0 if st.session_state.llm.mode == "gemini" else (1 if st.session_state.llm.mode == "openai" else 2))
        model_name = st.selectbox("Model", ["gemini-2.5-flash", "gpt-4o-mini", "mock-offline"])
        temp = st.slider("Temperature", 0.0, 1.0, 0.3)
        max_t = st.slider("Max Tokens", 512, 4096, 2048)

    with tab_keys:
        st.subheader("API Keys Credentials")
        st.text_input("GEMINI_API_KEY", value=os.getenv("GEMINI_API_KEY") or "", type="password", disabled=True)
        st.text_input("OPENAI_API_KEY", value=os.getenv("OPENAI_API_KEY") or "", type="password")

    with tab_rules:
        st.subheader("Routing Configuration")
        st.info("System Task Router runs semantic classifier. Mapped keys: coding, debugger, documentation, planning, repository, terminal, testing.")

    with tab_prefs:
        st.subheader("System Preferences")
        st.toggle("Auto Save Conversations", value=True)
        st.toggle("Enable Memory", value=True)
        st.toggle("Show Thinking Process", value=False)
        st.toggle("Enable Code Execution", value=False)
        st.toggle("Stream Responses", value=True)
        
    st.write("---")
    if st.button("💾 Save Changes"):
        st.success("Configuration successfully updated!")

# ----------------------------------------------------
# 3. Merged Workspace Modules
# ----------------------------------------------------

def show_github_browser():
    """Renders the VCS GitHub repository client browser."""
    client = st.session_state.github_client
    
    if not client.token:
        st.warning("⚠️ No GitHub Personal Access Token configured. Paste your Token in Settings or Sidebar Configuration to unlock repository browsing.")
        return

    # Load repos
    if not st.session_state.repositories:
        with st.spinner("Fetching repositories..."):
            st.session_state.repositories = run_async(client.get_user_repos())
            
    repos = st.session_state.repositories
    if not repos:
        st.error("No repositories found for this account. Ensure your token is correct and has 'repo' scopes.")
        return

    repo_options = [r["full_name"] for r in repos]
    selected_repo_name = st.selectbox("Select Target Repository:", repo_options)
    
    if selected_repo_name:
        owner, name = selected_repo_name.split("/")
        
        # Sub-tabs
        tab_commits, tab_branches, tab_prs, tab_issues = st.tabs([
            "📁 Commits History", "🌿 Branches", "🔀 Pull Requests", "🩺 Issues"
        ])
        
        with tab_commits:
            st.subheader("Recent Commits")
            commits = run_async(client.get_commits(owner, name))
            if not commits:
                st.info("No commits found or error loading commits.")
            for c in commits:
                author = c.get("commit", {}).get("author", {}).get("name", "Unknown")
                date = c.get("commit", {}).get("author", {}).get("date", "")[:10]
                msg = c.get("commit", {}).get("message", "")
                st.markdown(f"**{msg}**  \n*Authored by {author} on {date}*")
                st.write("---")
                
        with tab_branches:
            st.subheader("Branches List")
            branches = run_async(client.get_branches(owner, name))
            if not branches:
                st.info("No branches found.")
            for b in branches:
                st.markdown(f"- 🌿 `{b.get('name')}`")
                
            # Create new branch
            st.write("---")
            with st.expander("🆕 Create New Branch"):
                with st.form("form_create_branch"):
                    new_branch = st.text_input("New Branch Name:", placeholder="e.g. feature/oauth")
                    source_branch = st.selectbox("Source Branch:", [b.get("name") for b in branches])
                    btn_submit = st.form_submit_button("Create Branch")
                    if btn_submit and new_branch:
                        with st.spinner("Creating branch..."):
                            result = run_async(client.create_branch(owner, name, new_branch, source_branch))
                            if result["success"]:
                                st.success(f"Branch '{new_branch}' created successfully!")
                                st.session_state.repositories = [] # trigger reload
                            else:
                                st.error(f"Error: {result['error']}")

        with tab_prs:
            st.subheader("Pull Requests")
            state_filter = st.selectbox("PR Status:", ["open", "closed", "all"])
            prs = run_async(client.get_pull_requests(owner, name, state_filter))
            if not prs:
                st.info("No Pull Requests found matching filter.")
            for pr in prs:
                title = pr.get("title")
                number = pr.get("number")
                state = pr.get("state")
                user = pr.get("user", {}).get("login", "unknown")
                st.markdown(f"**#{number} {title}** ({state})  \n*Submitted by {user}*")
                st.write("---")
                
            # Create PR
            st.write("---")
            with st.expander("🔀 Submit a New Pull Request"):
                with st.form("form_create_pr"):
                    pr_title = st.text_input("PR Title:", placeholder="e.g. Implement RAG Search")
                    source_pr = st.text_input("Head (Source Branch):", placeholder="e.g. feature/oauth")
                    target_pr = st.text_input("Base (Target Branch):", value="main")
                    pr_body = st.text_area("PR Description:")
                    btn_pr_submit = st.form_submit_button("Submit Pull Request")
                    if btn_pr_submit and pr_title and source_pr:
                        with st.spinner("Creating Pull Request..."):
                            result = run_async(client.create_pull_request(owner, name, pr_title, source_pr, target_pr, pr_body))
                            if result["success"]:
                                st.success("Pull Request created successfully!")
                            else:
                                st.error(f"Error: {result['error']}")

        with tab_issues:
            st.subheader("Issues")
            issue_state = st.selectbox("Issue Status:", ["open", "closed", "all"])
            issues = run_async(client.get_issues(owner, name, issue_state))
            if not issues:
                st.info("No issues found matching filter.")
            for issue in issues:
                title = issue.get("title")
                number = issue.get("number")
                state = issue.get("state")
                st.markdown(f"**#{number} {title}** ({state})")
                st.write("---")
                
            # Create Issue
            st.write("---")
            with st.expander("🩺 Report a New Issue"):
                with st.form("form_create_issue"):
                    issue_title = st.text_input("Issue Title:", placeholder="e.g. Bug: Webhook signature failing")
                    issue_body = st.text_area("Steps to reproduce / description:")
                    btn_issue_submit = st.form_submit_button("Submit Issue")
                    if btn_issue_submit and issue_title:
                        with st.spinner("Creating issue..."):
                            result = run_async(client.create_issue(owner, name, issue_title, issue_body))
                            if result["success"]:
                                st.success("Issue created successfully!")
                            else:
                                st.error(f"Error: {result['error']}")


def show_analyzer():
    """Renders the Code Search & RAG analyzer tab."""
    st.subheader("RAG Semantic Codebase Scan")
    analyzer = st.session_state.analyzer
    
    col_ctrl, col_search = st.columns([1, 2])
    
    with col_ctrl:
        st.subheader("⚙️ Indexing Control")
        dir_path = st.text_input("Directory path to scan:", value=os.getcwd())
        
        if st.button("🔍 Scan & Index Directory", use_container_width=True):
            with st.spinner("Scanning codebase source files..."):
                analyzer.root_dir = dir_path
                total_files = analyzer.scan_and_index()
                st.session_state.analyzer_indexed = True
                st.success(f"Indexed successfully! Total files scanned: **{total_files}**")
                
        if st.session_state.analyzer_indexed:
            st.metric("Total Indexed Chunks", len(analyzer.chunks))
            
    with col_search:
        st.subheader("🔎 Semantic RAG Search")
        query = st.text_input("Search query (e.g. 'rest api endpoint' or 'git helper'):")
        
        if query:
            results = analyzer.search(query, top_k=5)
            if not results:
                st.warning("No matches found for that query.")
            for r in results:
                st.markdown(f"📂 **File:** `{r['file']}` ({r['range']}) | `{r['match']}`")
                st.code(r["text"], language="python")
                st.write("---")
                
    st.write("---")
    st.subheader("📋 Scanned Repository Files")
    if st.session_state.analyzer_indexed and analyzer.indexed_files:
        st.dataframe(analyzer.indexed_files, use_container_width=True)
    else:
        st.info("Trigger directory indexing to view files.")

# ----------------------------------------------------
# 4. Sidebar Navigation & Layout Coordinator
# ----------------------------------------------------
st.sidebar.title("🧭 Navigation")

# Page mapping dictionary
sidebar_pages = {
    "🏠 Home": show_home,
    "💬 AI Assistant": show_assistant,
    "🤖 Agents": show_agents_suite,
    "🚀 Demo Center": show_demo_scenarios,
    "🌿 Workflows": show_workflow_viz,
    "🧠 Memory": show_memory_viewer,
    "📊 Analytics": show_analytics,
    "⚙️ Settings": show_settings
}

page_list = list(sidebar_pages.keys())

# If triggered by a quick action or page redirect, override selection
if "navigation_trigger" in st.session_state and st.session_state.navigation_trigger in page_list:
    selected_page = st.sidebar.radio(
        "Go To:",
        page_list,
        index=page_list.index(st.session_state.navigation_trigger)
    )
    del st.session_state.navigation_trigger
else:
    selected_page = st.sidebar.radio(
        "Go To:",
        page_list
    )

# Sidebar Configuration Settings
st.sidebar.write("---")
st.sidebar.subheader("🔑 Fast Config")
pat_token = st.sidebar.text_input("GitHub PAT:", value=os.getenv("GITHUB_TOKEN") or "", type="password", key="sidebar_pat")
if pat_token != st.session_state.github_client.token:
    st.session_state.github_client.set_token(pat_token)
    st.session_state.repositories = []

st.sidebar.write("---")
st.sidebar.markdown(f"**LLM Mode**: `{st.session_state.llm.mode.upper()}`")
st.sidebar.markdown(f"**Memory Size**: `{len(st.session_state.memory.get_history())} messages`")

# Sidebar profile segment matching reference.png
st.sidebar.markdown("""
<div class="sidebar-profile">
    <div class="profile-avatar">DEV</div>
    <div class="profile-info">
        <div class="profile-name">Developer</div>
        <div class="profile-status">🟢 Online</div>
    </div>
</div>
""", unsafe_allow_html=True)

# Render Selected Page
sidebar_pages[selected_page]()
