"""
Agent tools: web search via SearXNG, code execution, URL fetch.
"""
import asyncio
import subprocess
import sys
import tempfile
import os
from typing import List, Dict, Any, Optional

import httpx


# ─── Web Search ───────────────────────────────────────────────────────────────

async def web_search(query: str, searxng_url: str, num_results: int = 6) -> List[Dict[str, Any]]:
    """Search via a SearXNG instance. Returns title, url, content snippets."""
    if not searxng_url:
        return [{"error": "SearXNG URL not configured. Set it in Settings → Tools."}]
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(
                f"{searxng_url.rstrip('/')}/search",
                params={"q": query, "format": "json", "categories": "general"},
            )
            r.raise_for_status()
            data = r.json()
            results = data.get("results", [])[:num_results]
            return [
                {
                    "title": res.get("title", ""),
                    "url": res.get("url", ""),
                    "content": res.get("content", ""),
                    "engine": res.get("engine", ""),
                }
                for res in results
            ]
    except Exception as e:
        return [{"error": f"Search failed: {e}"}]


# ─── URL Fetch ────────────────────────────────────────────────────────────────

async def fetch_url(url: str, max_chars: int = 8000) -> Dict[str, Any]:
    """Fetch a URL and return plain text content."""
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "GlyndwrBot/1.0"})
            r.raise_for_status()
            ct = r.headers.get("content-type", "")
            if "html" in ct:
                # Basic HTML stripping
                import re
                text = r.text
                text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
                text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
                text = re.sub(r'<[^>]+>', ' ', text)
                text = re.sub(r'\s+', ' ', text).strip()
                return {"url": url, "content": text[:max_chars], "type": "html"}
            else:
                return {"url": url, "content": r.text[:max_chars], "type": ct}
    except Exception as e:
        return {"url": url, "error": str(e)}


# ─── Code Execution ───────────────────────────────────────────────────────────

def _run_python(code: str, timeout: int = 15) -> Dict[str, Any]:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        tmp_path = f.name
    try:
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=tempfile.gettempdir(),
        )
        return {
            "stdout": result.stdout[:8192],
            "stderr": result.stderr[:2048],
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": f"Timed out after {timeout}s", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


async def run_code(code: str, language: str = "python", timeout: int = 15) -> Dict[str, Any]:
    if language == "python":
        return await asyncio.to_thread(_run_python, code, timeout)
    return {"stdout": "", "stderr": f"Language '{language}' not supported. Only python is available.", "returncode": -1}
