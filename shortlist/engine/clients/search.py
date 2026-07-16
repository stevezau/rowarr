"""Web search providers for the ``llm_web`` candidate source.

Two ways the "search the web for what to watch next" source can get web results:

* **Native** — the curator's own provider runs the search server-side (Claude/GPT/Gemini web-search
  tools). Only works where the provider offers it; impossible for a local Ollama model.
* **External search provider (here)** — WE run the search from a query built off the user's
  watchlist, hand the result snippets to the curator, and let *any* model recommend from them. This
  is the universal path: it works for every curator, Ollama included, because the model reads what we
  found instead of searching itself.

Exa is the first external provider (a search API built for LLM grounding). The abstraction leaves
room for others (Tavily/Brave/SearXNG) behind the same ``WebSearchProvider`` protocol.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from loguru import logger

from shortlist.engine.clients import http_retry

EXA_SEARCH_URL = "https://api.exa.ai/search"
_DEFAULT_RESULTS = 8
_DEFAULT_MAX_CHARS = 800  # per-result text budget — enough to name titles, small enough to stay cheap


@dataclass(frozen=True)
class SearchResult:
    """One web result: a title, its URL, and an extracted text snippet for the model to read."""

    title: str
    url: str
    text: str


class WebSearchProvider(Protocol):
    """A web search backend for the ``llm_web`` source. ``name`` labels it in logs/settings."""

    name: str

    def search(self, query: str, *, num_results: int = _DEFAULT_RESULTS) -> list[SearchResult]: ...

    def ping(self) -> str: ...


class ExaClient:
    """Exa semantic search (https://exa.ai). Returns ranked web results with extracted text.

    A search is a read, but Exa exposes it as POST, so it goes through ``http_retry.request`` — which
    retries the safe cases (a connect failure that never landed, or an explicit 429 rate-limit) and
    leaves the rest to the source's own try/except in ``candidates.py``. The API key travels in the
    ``x-api-key`` header (never the URL/query), so it can't leak into a logged request line (rule 9).
    """

    name = "exa"

    def __init__(self, api_key: str, *, timeout: float = 20.0):
        self._api_key = api_key
        self._timeout = timeout

    def search(self, query: str, *, num_results: int = _DEFAULT_RESULTS) -> list[SearchResult]:
        """Run one search and return up to ``num_results`` results with extracted text.

        Args:
            query: The natural-language search query (built from the user's watchlist upstream).
            num_results: How many web results to ask Exa for.

        Returns:
            The parsed results, newest/most-relevant first. Results with no title are skipped.
        """
        response = http_retry.request(
            "POST",
            EXA_SEARCH_URL,
            headers={"x-api-key": self._api_key, "Content-Type": "application/json"},
            json={
                "query": query,
                "numResults": num_results,
                "type": "auto",
                "contents": {"text": {"maxCharacters": _DEFAULT_MAX_CHARS}},
            },
            timeout=self._timeout,
        )
        response.raise_for_status()
        results: list[SearchResult] = []
        for item in response.json().get("results", []):
            title = (item.get("title") or "").strip()
            if not title:
                continue
            results.append(SearchResult(title=title, url=item.get("url") or "", text=(item.get("text") or "").strip()))
        logger.debug("exa search · {!r} → {} results", query[:60], len(results))
        return results

    def ping(self) -> str:
        """A cheap probe for the Settings 'test connection' button. Raises on an unusable key."""
        results = self.search("popular movies and TV shows to watch this week", num_results=1)
        return f"ok — {len(results)} result"
