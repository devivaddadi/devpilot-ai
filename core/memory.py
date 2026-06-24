import logging
import threading
from typing import List, Dict

logger = logging.getLogger("devpilot.core.memory")

class ConversationMemory:
    """
    Manages in-memory storage of conversation history.
    Includes thread-safe message additions and pruning.
    """
    def __init__(self, max_messages: int = 20):
        self.max_messages = max_messages
        self._messages: List[Dict[str, str]] = []
        self._lock = threading.Lock()

    def add_message(self, role: str, content: str) -> None:
        """
        Add a message to the conversation history.
        Role should be either 'user' or 'assistant'.
        """
        with self._lock:
            self._messages.append({
                "role": role,
                "content": content
            })
            self._prune_if_needed()
            logger.debug(f"Added {role} message to memory. Current memory size: {len(self._messages)}")

    def get_history(self) -> List[Dict[str, str]]:
        """Return the conversation history."""
        with self._lock:
            return list(self._messages)

    def get_history_as_string(self) -> str:
        """Format the history as a clean text block for injection into prompt context."""
        with self._lock:
            if not self._messages:
                return "No previous conversation history."
            
            lines = []
            for msg in self._messages:
                role_label = "User" if msg["role"] == "user" else "Assistant"
                lines.append(f"{role_label}: {msg['content']}")
            return "\n\n".join(lines)

    def clear(self) -> None:
        """Clear all conversation history."""
        with self._lock:
            self._messages.clear()
            logger.info("Conversation memory cleared.")

    def _prune_if_needed(self) -> None:
        """Prunes conversation history if it exceeds max_messages, keeping the oldest few (if system setup was there) and latest messages."""
        if len(self._messages) > self.max_messages:
            # Keep the last max_messages
            removed_count = len(self._messages) - self.max_messages
            self._messages = self._messages[removed_count:]
            logger.debug(f"Pruned {removed_count} messages from memory.")
