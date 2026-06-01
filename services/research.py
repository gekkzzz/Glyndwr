"""
Deep Research service: multi-step web research pipeline.
1. Generate sub-queries from research question
2. Search each sub-query
3. Fetch top result pages
4. Synthesize into a structured report
"""
import asyncio
import json
from typing import AsyncGenerator, List, Dict, Any

import httpx

from services.tools import web_search, fetch_url


async def _llm_call(messages: List[Dict], model: str, api_key: str, base_url: str) -> str:
    """Single non-streaming LLM call for research steps."""
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": 1024, "stream": False},
        )
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]


async def deep_research(
    question: str,
    model: str,
    api_key: str,
    base_url: str,
    searxng_url: str,
    num_queries: int = 3,
    results_per_query: int = 3,
) -> AsyncGenerator[str, None]:
    """
    Yields SSE-like JSON strings with research progress and final report.
    """

    def _event(type_: str, data: Any) -> str:
        return json.dumps({"type": type_, "data": data})

    yield _event("status", "Generating research sub-queries…")

    # Step 1: Generate sub-queries
    try:
        sub_query_prompt = (
            f"You are a research assistant. Break this research question into {num_queries} "
            f"specific web search queries that together will help answer it comprehensively. "
            f"Respond with a JSON array of strings only.\n\nQuestion: {question}"
        )
        raw = await _llm_call(
            [{"role": "user", "content": sub_query_prompt}],
            model, api_key, base_url,
        )
        # Parse JSON from response
        import re
        match = re.search(r'\[.*?\]', raw, re.DOTALL)
        queries = json.loads(match.group(0)) if match else [question]
        queries = queries[:num_queries]
    except Exception:
        queries = [question]

    yield _event("queries", queries)

    # Step 2: Search each query and collect sources
    all_sources: List[Dict] = []
    for q in queries:
        yield _event("status", f"Searching: {q}")
        results = await web_search(q, searxng_url, num_results=results_per_query)
        for r in results:
            if r.get("url") and not r.get("error"):
                all_sources.append({"query": q, **r})

    yield _event("sources", all_sources)

    # Step 3: Fetch top source content
    yield _event("status", "Reading top sources…")
    source_texts: List[str] = []
    for src in all_sources[:6]:  # limit fetching to 6 URLs
        try:
            page = await fetch_url(src["url"], max_chars=3000)
            if page.get("content"):
                source_texts.append(
                    f"Source: {src['url']}\nTitle: {src.get('title','')}\n\n{page['content']}"
                )
        except Exception:
            source_texts.append(
                f"Source: {src['url']}\nTitle: {src.get('title','')}\n\n{src.get('content','')}"
            )

    # Step 4: Synthesize report
    yield _event("status", "Synthesizing report…")
    context = "\n\n---\n\n".join(source_texts[:4])
    synthesis_prompt = (
        f"You are a research analyst. Using the sources below, write a comprehensive, well-structured "
        f"research report answering this question: {question}\n\n"
        f"Format the report with:\n"
        f"- An executive summary\n"
        f"- Key findings (use headers)\n"
        f"- Conclusion\n"
        f"- Sources cited (URLs)\n\n"
        f"Sources:\n{context}"
    )

    report_text = ""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": synthesis_prompt}],
                    "max_tokens": 2048,
                    "stream": True,
                },
                timeout=120,
            )
            async for line in r.aiter_lines():
                if line.startswith("data: "):
                    chunk = line[6:]
                    if chunk == "[DONE]":
                        break
                    try:
                        data = json.loads(chunk)
                        delta = data["choices"][0]["delta"].get("content", "")
                        if delta:
                            report_text += delta
                            yield _event("chunk", delta)
                    except Exception:
                        pass
    except Exception as e:
        yield _event("error", str(e))

    yield _event("done", {"report": report_text, "sources": all_sources})
