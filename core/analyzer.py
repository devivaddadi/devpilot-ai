import os
import re
from typing import Dict, Any, List

class CodeAnalyzer:
    """
    Lightweight local codebase scanner and RAG text search indexer.
    Scans files, chunks contents, and performs keyword/term relevance matches.
    """
    def __init__(self, root_dir: str):
        self.root_dir = root_dir
        self.indexed_files: List[Dict[str, Any]] = []
        self.chunks: List[Dict[str, Any]] = []
        self.ignored_dirs = {
            "node_modules", "venv", ".venv", ".git", "__pycache__", 
            ".pytest_cache", ".devpilot-cache", "dist", "build"
        }
        self.supported_extensions = {
            ".py", ".js", ".ts", ".html", ".css", ".json", ".md", ".txt", ".sql", ".sh", ".yml", ".yaml"
        }

    def scan_and_index(self) -> int:
        """
        Scans root_dir and indexes compatible source files.
        Returns total number of files indexed.
        """
        self.indexed_files = []
        self.chunks = []

        if not os.path.exists(self.root_dir):
            return 0

        for root, dirs, files in os.walk(self.root_dir):
            # Ignore hidden or heavy directories
            dirs[:] = [d for d in dirs if d not in self.ignored_dirs and not d.startswith(".")]
            
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext not in self.supported_extensions:
                    continue

                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, self.root_dir).replace("\\", "/")
                
                try:
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                    
                    size_kb = round(len(content) / 1024, 2)
                    
                    # Create document index
                    self.indexed_files.append({
                        "path": rel_path,
                        "size": f"{size_kb} KB",
                        "chars": len(content)
                    })

                    # Chunk content (roughly 800 chars per chunk, with 100 char overlap)
                    chunk_size = 800
                    overlap = 100
                    start = 0
                    chunk_idx = 0
                    
                    while start < len(content):
                        end = min(start + chunk_size, len(content))
                        chunk_text = content[start:end]
                        
                        self.chunks.append({
                            "file": rel_path,
                            "chunk_index": chunk_idx,
                            "text": chunk_text,
                            "range": f"chars {start}-{end}"
                        })
                        
                        chunk_idx += 1
                        start += (chunk_size - overlap)

                except Exception:
                    # Ignore unreadable files
                    pass

        return len(self.indexed_files)

    def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Searches chunks based on keyword matching frequency and term relevance.
        """
        if not query:
            return []

        query_terms = [term.lower() for term in re.findall(r"\w+", query) if len(term) > 2]
        if not query_terms:
            # Fallback if query has only short words
            query_terms = [query.lower()]

        scored_chunks = []
        for chunk in self.chunks:
            score = 0
            chunk_text_lower = chunk["text"].lower()
            
            for term in query_terms:
                # Count keyword matches
                matches = chunk_text_lower.count(term)
                score += matches * 10
                
                # Bonus if term matches in file name
                if term in chunk["file"].lower():
                    score += 25
                    
            if score > 0:
                scored_chunks.append({
                    "file": chunk["file"],
                    "range": chunk["range"],
                    "text": chunk["text"],
                    "score": score
                })

        # Sort by score descending
        scored_chunks.sort(key=lambda x: x["score"], reverse=True)
        
        # Calculate percentage match based on top scores
        results = []
        for c in scored_chunks[:top_k]:
            match_pct = min(100, int(c["score"] * 2))
            results.append({
                "file": c["file"],
                "range": c["range"],
                "text": c["text"],
                "match": f"{match_pct}% Match"
            })
            
        return results
