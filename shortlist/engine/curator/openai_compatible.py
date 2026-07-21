"""Any server that speaks the OpenAI API: llama.cpp, LM Studio, vLLM, LocalAI, OpenRouter…

Issue #7 asked for llama.cpp specifically. A llama.cpp-shaped provider would have been the wrong
shape: llama.cpp's server does NOT implement Ollama's native API (`/api/tags`, `/api/chat`) — what
it implements is the OpenAI-compatible `/v1/chat/completions` and `/v1/models`, and so does every
other local runtime people ask about. One provider with a configurable base URL covers all of them,
including the next one, instead of accreting a class per runtime.
"""

from __future__ import annotations

from shortlist.engine.curator.openai import DEFAULT_MODEL, OpenAICurator


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
            raise ValueError("an OpenAI-compatible provider needs the server's base URL")
        super().__init__(api_key=api_key or "not-needed", model=model, timeout=timeout, base_url=base_url)
