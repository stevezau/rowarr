"""Tests for the Exa web-search client (the llm_web external-search backend)."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from shortlist.engine.clients.search import EXA_SEARCH_URL, ExaClient, SearchResult

_RESULTS = {
    "results": [
        {"title": "The 25 best sci-fi films of 2024", "url": "https://ex.com/a", "text": "Dune: Part Two ..."},
        {"title": "What to watch next", "url": "https://ex.com/b", "text": "Shogun is a must ..."},
        {"title": "", "url": "https://ex.com/c", "text": "no title — skipped"},
    ]
}


class TestExaClient:
    @respx.mock
    def test_search_sends_key_header_and_query_then_parses_results(self):
        route = respx.post(EXA_SEARCH_URL).mock(return_value=httpx.Response(200, json=_RESULTS))
        out = ExaClient("exa-key-123").search("what to watch next if you liked Arrival", num_results=5)

        # SUT-controlled contract: the key rides the header (never the URL), and our query + count go up.
        request = route.calls.last.request
        assert request.headers["x-api-key"] == "exa-key-123"
        body = json.loads(request.content)
        assert body["query"] == "what to watch next if you liked Arrival"
        assert body["numResults"] == 5
        assert body["contents"]["text"]["maxCharacters"] > 0  # we ask for extracted text to feed the LLM

        # Parsing: two titled results kept in order, the title-less one dropped.
        assert out == [
            SearchResult(title="The 25 best sci-fi films of 2024", url="https://ex.com/a", text="Dune: Part Two ..."),
            SearchResult(title="What to watch next", url="https://ex.com/b", text="Shogun is a must ..."),
        ]

    @respx.mock
    def test_ping_returns_ok_string(self):
        respx.post(EXA_SEARCH_URL).mock(return_value=httpx.Response(200, json={"results": [{"title": "x"}]}))
        assert "ok" in ExaClient("k").ping()

    @respx.mock
    def test_search_raises_on_http_error(self):
        respx.post(EXA_SEARCH_URL).mock(return_value=httpx.Response(401, json={"error": "bad key"}))
        with pytest.raises(httpx.HTTPStatusError):
            ExaClient("bad").search("q")

    @respx.mock
    def test_429_is_retried_then_succeeds(self, monkeypatch):
        import shortlist.engine.clients.http_retry as http_retry

        monkeypatch.setattr(http_retry.time, "sleep", lambda *_: None)  # don't actually wait in tests
        route = respx.post(EXA_SEARCH_URL)
        route.side_effect = [httpx.Response(429), httpx.Response(200, json={"results": [{"title": "ok"}]})]
        out = ExaClient("k").search("q")
        assert [r.title for r in out] == ["ok"]
        assert len(route.calls) == 2  # rate-limited once, retried once
