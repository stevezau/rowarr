"""Any server that speaks the OpenAI API: Ollama, llama.cpp, LM Studio, vLLM, LocalAI, OpenRouter…

Issue #7 asked for llama.cpp specifically, but a llama.cpp-shaped provider would have been the wrong
shape — and so, it turned out, was a separate Ollama one. Every local runtime people ask about
implements the same OpenAI-compatible `/v1/chat/completions` and `/v1/models`, Ollama included. One
provider with a configurable base URL covers all of them, including the next one, instead of
accreting a class per runtime.

Ollama used to have its own provider here (native `/api/tags`, `/api/chat`). It was merged into this
one; `make_curator("ollama")` still resolves for instances configured before the merge.
"""

from __future__ import annotations

from urllib.parse import urlparse, urlunparse

from loguru import logger

from shortlist.engine.curator.openai import DEFAULT_MODEL, OpenAICurator


def normalize_base_url(url: str) -> str:
    """Point a bare host at its OpenAI API root, so `http://localhost:11434` just works.

    Every runtime we target serves the API under a path (`/v1`, or OpenRouter's `/api/v1`), but
    people paste the address they know their server by — the one in the Ollama docs has no path at
    all. Appending `/v1` to a bare host removes the single most likely reason "it can't reach my
    server": a URL that is right in every respect except the bit nobody told them to add.

    A URL that already carries a path is left exactly as typed, so an unusual layout stays possible.
    """
    parsed = urlparse(url.strip().rstrip("/"))
    if parsed.scheme and parsed.netloc and parsed.path in ("", "/"):
        return urlunparse(parsed._replace(path="/v1"))
    return url.strip().rstrip("/")


class OpenAICompatibleCurator(OpenAICurator):
    name = "openai_compatible"
    # Web search is an OpenAI-hosted tool, not part of the API these servers implement. They can
    # still power the llm_web source through an external search provider (Exa), exactly like Ollama.
    supports_native_web_search = False

    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        model: str = DEFAULT_MODEL,
        timeout: float = 300.0,
    ):
        """
        Args:
            base_url: The server's OpenAI-compatible root, e.g. ``http://llama:8080/v1``.
            api_key: Usually unused by local servers, but the SDK insists on a non-empty string —
                and a real one is needed for hosted gateways like OpenRouter.
            model: Whatever the server calls the loaded model. Local runtimes often ignore it.
            timeout: Generous by default: a CPU-bound local model is far slower than a hosted one.
        """
        if not base_url:
            raise ValueError("a local/OpenAI-compatible provider needs the server's base URL")
        resolved = normalize_base_url(base_url)
        if resolved != base_url.strip().rstrip("/"):
            logger.debug("curator: using {} for the OpenAI-compatible endpoint", resolved)
        super().__init__(api_key=api_key or "not-needed", model=model, timeout=timeout, base_url=resolved)

    def list_models(self) -> list[str]:
        """Every model the server offers, UNFILTERED.

        The inherited version keeps only OpenAI's own families (`gpt-`, `o1`…). Against a local
        server that is actively harmful: names are arbitrary, so the filter usually matches nothing
        and silently falls back — but Ollama ships a model literally called `gpt-oss`, and on that
        server the filter would match it alone and hide every other model you have.
        """
        return sorted(m.id for m in self._client.models.list().data)

    def ping(self) -> str:
        """Ask what the server is serving, rather than making it generate.

        The inherited ping sends a real chat completion. Against OpenAI that's a few cents and a
        second; against a CPU-bound local model it's a 30-second wait on the settings "Test" button
        for information a model list gives instantly — and it fails outright when the server is up
        but has no model loaded, which is exactly the state you'd want Test to help you diagnose.
        """
        models = self.list_models()
        if not models:
            return "connected — the server reports no models loaded"
        return f"connected — {len(models)} model(s) available"
