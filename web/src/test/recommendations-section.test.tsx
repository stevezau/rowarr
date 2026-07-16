import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecommendationsSection } from "@/components/settings/recommendations-section";
import type { Settings } from "@/lib/types";

const { putSettings } = vi.hoisted(() => ({
  putSettings: vi.fn((values: Settings) => Promise.resolve(values)),
}));

vi.mock("@/lib/api", () => ({
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
  api: { putSettings },
}));

function renderSection(settings: Settings) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecommendationsSection settings={settings} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RecommendationsSection", () => {
  beforeEach(() => {
    putSettings.mockClear();
  });

  it("blocks the AI-from-library source until a curator is configured", () => {
    renderSection({});
    expect(screen.getByLabelText(/suggests from your library/i)).toBeDisabled();
    expect(
      screen.getByText(/Needs an AI curator — set one up/i),
    ).toBeInTheDocument();
  });

  it("allows the AI-from-library source once a curator is set", () => {
    renderSection({ "curator.provider": "anthropic" });
    expect(
      screen.getByLabelText(/suggests from your library/i),
    ).not.toBeDisabled();
    expect(screen.queryByText(/Needs an AI curator/i)).toBeNull();
  });

  it("blocks AI web search when neither a web-capable curator nor an Exa key exists", () => {
    // Ollama has no native web search and there's no Exa key → the toggle must NOT read as usable.
    renderSection({ "curator.provider": "ollama" });
    expect(screen.getByLabelText(/web search/i)).toBeDisabled();
    expect(
      screen.getByText(/Needs Claude, GPT, or Gemini.*Exa API key/i),
    ).toBeInTheDocument();
  });

  it("allows AI web search on a native-capable curator (no Exa key needed)", () => {
    renderSection({ "curator.provider": "anthropic" });
    expect(screen.getByLabelText(/web search/i)).not.toBeDisabled();
  });

  it("allows AI web search for Ollama once an Exa key is on file", () => {
    // The universal path: a local model can't search itself, but Exa can search for it.
    renderSection({ "curator.provider": "ollama", "exa.apikey": "•••••" });
    expect(screen.getByLabelText(/web search/i)).not.toBeDisabled();
  });

  it("blocks AI web search with an Exa key but NO curator (heuristic mode)", () => {
    // Regression: an Exa key alone must not un-block it — every backend still needs an AI curator to
    // pick titles from the results, and the engine skips the source entirely in heuristic mode.
    renderSection({ "curator.provider": "none", "exa.apikey": "•••••" });
    expect(screen.getByLabelText(/web search/i)).toBeDisabled();
    expect(
      screen.getByText(/Needs an AI curator to choose titles/i),
    ).toBeInTheDocument();
  });

  it("shows the search-backend selector only when AI web search is enabled, and saves the choice", async () => {
    renderSection({
      "curator.provider": "anthropic",
      "candidates.sources": ["tmdb_similar", "llm_web"],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Exa$/i }));
    await waitFor(() => expect(putSettings).toHaveBeenCalled());
    const body = putSettings.mock.calls.at(-1)?.[0];
    expect(body?.["llm_web.search_provider"]).toBe("exa");
  });

  it("defaults the watched cap to 0% (all fresh) when the setting is unset", () => {
    renderSection({});
    expect(
      screen.getByRole("slider", { name: /already-watched/i }),
    ).toHaveValue("0");
  });

  it("preselects the saved watched cap and auto-saves a change to recommendations.watched_pct", async () => {
    renderSection({ "recommendations.watched_pct": 0.5 });
    const slider = screen.getByRole("slider", { name: /already-watched/i });
    // The stored fraction (0.5) is shown as 50%.
    expect(slider).toHaveValue("50");

    fireEvent.change(slider, { target: { value: "55" } });

    await waitFor(() => expect(putSettings).toHaveBeenCalled());
    const body = putSettings.mock.calls.at(-1)?.[0];
    expect(body?.["recommendations.watched_pct"]).toBe(0.55);
    // The section owns both keys, so its save carries the sources set too.
    expect(body).toHaveProperty("candidates.sources");
  });
});
