import httpx
import base64
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("devpilot.core.github")

class GitHubClient:
    """
    Lightweight Python wrapper for the GitHub REST API using httpx.
    """
    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.base_url = "https://api.github.com"
        self.headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        if token:
            self.headers["Authorization"] = f"Bearer {token}"

    def set_token(self, token: str):
        self.token = token
        self.headers["Authorization"] = f"Bearer {token}"

    async def get_user_repos(self) -> List[Dict[str, Any]]:
        """List repositories for the authenticated user."""
        if not self.token:
            return []
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/user/repos?per_page=100&sort=updated",
                    headers=self.headers
                )
                if response.status_code == 200:
                    return response.json()
                logger.error(f"Failed to fetch user repos: {response.status_code} {response.text}")
                return []
            except Exception as e:
                logger.error(f"Exception fetching user repos: {e}")
                return []

    async def get_commits(self, owner: str, repo: str) -> List[Dict[str, Any]]:
        """Get commits for a repository."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repo}/commits?per_page=20",
                    headers=self.headers
                )
                if response.status_code == 200:
                    return response.json()
                logger.error(f"Failed to fetch commits: {response.status_code} {response.text}")
                return []
            except Exception as e:
                logger.error(f"Exception fetching commits: {e}")
                return []

    async def get_branches(self, owner: str, repo: str) -> List[Dict[str, Any]]:
        """Get branches for a repository."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repo}/branches",
                    headers=self.headers
                )
                if response.status_code == 200:
                    return response.json()
                logger.error(f"Failed to fetch branches: {response.status_code} {response.text}")
                return []
            except Exception as e:
                logger.error(f"Exception fetching branches: {e}")
                return []

    async def get_pull_requests(self, owner: str, repo: str, state: str = "open") -> List[Dict[str, Any]]:
        """Get pull requests for a repository."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repo}/pulls?state={state}&per_page=20",
                    headers=self.headers
                )
                if response.status_code == 200:
                    return response.json()
                logger.error(f"Failed to fetch PRs: {response.status_code} {response.text}")
                return []
            except Exception as e:
                logger.error(f"Exception fetching PRs: {e}")
                return []

    async def get_issues(self, owner: str, repo: str, state: str = "open") -> List[Dict[str, Any]]:
        """Get issues for a repository."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repo}/issues?state={state}&per_page=20",
                    headers=self.headers
                )
                if response.status_code == 200:
                    # Filter out Pull Requests (GitHub api returns PRs in issues list)
                    issues = response.json()
                    return [i for i in issues if "pull_request" not in i]
                logger.error(f"Failed to fetch issues: {response.status_code} {response.text}")
                return []
            except Exception as e:
                logger.error(f"Exception fetching issues: {e}")
                return []

    async def create_branch(self, owner: str, repo: str, new_branch: str, source_branch: str) -> Dict[str, Any]:
        """Create a new branch from a source branch."""
        async with httpx.AsyncClient() as client:
            try:
                # 1. Get SHA of source branch
                ref_response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repo}/git/ref/heads/{source_branch}",
                    headers=self.headers
                )
                if ref_response.status_code != 200:
                    raise Exception(f"Failed to get source branch ref: {ref_response.text}")
                sha = ref_response.json()["object"]["sha"]

                # 2. Create new reference
                create_response = await client.post(
                    f"{self.base_url}/repos/{owner}/{repo}/git/refs",
                    headers=self.headers,
                    json={
                        "ref": f"refs/heads/{new_branch}",
                        "sha": sha
                    }
                )
                if create_response.status_code == 201:
                    return {"success": True, "data": create_response.json()}
                return {"success": False, "error": create_response.json().get("message", "Failed to create ref")}
            except Exception as e:
                return {"success": False, "error": str(e)}

    async def create_commit(self, owner: str, repo: str, branch: str, path: str, content: str, message: str) -> Dict[str, Any]:
        """Create a file commit using GitHub's Put Content API."""
        async with httpx.AsyncClient() as client:
            try:
                # Get existing file if it exists to get its SHA (required for updates)
                sha = None
                get_response = await client.get(
                    f"{self.base_url}/repos/{owner}/{repo}/contents/{path}?ref={branch}",
                    headers=self.headers
                )
                if get_response.status_code == 200:
                    sha = get_response.json()["sha"]

                # Put file content
                payload = {
                    "message": message,
                    "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
                    "branch": branch
                }
                if sha:
                    payload["sha"] = sha

                put_response = await client.put(
                    f"{self.base_url}/repos/{owner}/{repo}/contents/{path}",
                    headers=self.headers,
                    json=payload
                )
                if put_response.status_code in (200, 201):
                    return {"success": True, "data": put_response.json()}
                return {"success": False, "error": put_response.json().get("message", "Failed to commit content")}
            except Exception as e:
                return {"success": False, "error": str(e)}

    async def create_pull_request(self, owner: str, repo: str, title: str, head: str, base: str, body: str) -> Dict[str, Any]:
        """Create a pull request."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/repos/{owner}/{repo}/pulls",
                    headers=self.headers,
                    json={
                        "title": title,
                        "head": head,
                        "base": base,
                        "body": body
                    }
                )
                if response.status_code == 201:
                    return {"success": True, "data": response.json()}
                return {"success": False, "error": response.json().get("message", "Failed to create PR")}
            except Exception as e:
                return {"success": False, "error": str(e)}

    async def create_issue(self, owner: str, repo: str, title: str, body: str) -> Dict[str, Any]:
        """Create a new issue."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/repos/{owner}/{repo}/issues",
                    headers=self.headers,
                    json={
                        "title": title,
                        "body": body
                    }
                )
                if response.status_code == 201:
                    return {"success": True, "data": response.json()}
                return {"success": False, "error": response.json().get("message", "Failed to create issue")}
            except Exception as e:
                return {"success": False, "error": str(e)}
