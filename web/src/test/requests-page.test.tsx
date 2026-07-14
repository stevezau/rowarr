import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestCandidate } from "@/lib/types";
import { RequestsPage } from "@/pages/requests";

const { listRequests, sendRequests, rejectRequests, getSettings } = vi.hoisted(
  () => ({
    listRequests: vi.fn(),
    sendRequests: vi.fn((_ids: number[], _dryRun?: boolean) =>
      Promise.resolve({ sent: 1, dry_run: false, outcomes: [] }),
    ),
    rejectRequests: vi.fn((_ids: number[]) => Promise.resolve({ rejected: 1 })),
    getSettings: vi.fn(() => Promise.resolve({ "requests.enabled": true })),
  }),
);

vi.mock("@/lib/api", () => ({
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
  api: {
    listRequests: () => listRequests(),
    sendRequests: (ids: number[], dryRun?: boolean) =>
      sendRequests(ids, dryRun),
    rejectRequests: (ids: number[]) => rejectRequests(ids),
    getSettings: () => getSettings(),
  },
}));

function candidate(
  overrides: Partial<RequestCandidate> = {},
): RequestCandidate {
  return {
    id: 1,
    tmdb_id: 100,
    media_type: "movie",
    title: "Dune: Part Two",
    year: 2024,
    rating: 8.3,
    vote_count: 5000,
    demand: 4,
    tags: [],
    status: "pending",
    detail: "",
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <RequestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RequestsPage", () => {
  beforeEach(() => {
    listRequests.mockReset();
    sendRequests.mockClear();
    rejectRequests.mockClear();
    getSettings.mockResolvedValue({ "requests.enabled": true });
  });

  it("shows an empty state when nothing has ever been queued", async () => {
    listRequests.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Nothing waiting/i)).toBeTruthy();
  });

  it("shows a distinct 'off' empty state when requests are disabled", async () => {
    listRequests.mockResolvedValue([]);
    getSettings.mockResolvedValue({ "requests.enabled": false });
    renderPage();
    // Never implies auto-send is running; points the owner at Settings to turn it on.
    expect(await screen.findByText(/Requests are off/i)).toBeTruthy();
    expect(screen.getByText(/Enable in Settings/i)).toBeTruthy();
  });

  it("lists pending titles and files handled ones under Already handled", async () => {
    listRequests.mockResolvedValue([
      candidate({ id: 1, title: "Dune: Part Two", status: "pending" }),
      candidate({
        id: 2,
        tmdb_id: 200,
        title: "Shogun",
        media_type: "show",
        status: "sent",
      }),
    ]);
    renderPage();
    expect(await screen.findByText("Dune: Part Two")).toBeTruthy();
    expect(screen.getByText("Shogun")).toBeTruthy();
    expect(screen.getByText(/Already handled/i)).toBeTruthy();
    expect(screen.getByText(/sent to Sonarr\/Radarr/i)).toBeTruthy();
  });

  it("sends the selected title by its id", async () => {
    listRequests.mockResolvedValue([candidate({ id: 7, title: "Fallout" })]);
    renderPage();
    await screen.findByText("Fallout");
    await userEvent.click(screen.getByRole("checkbox", { name: /Fallout/i }));
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    await waitFor(() => expect(sendRequests).toHaveBeenCalledWith([7], false));
  });

  it("rejects the selected title by its id", async () => {
    listRequests.mockResolvedValue([candidate({ id: 9, title: "Ripley" })]);
    renderPage();
    await screen.findByText("Ripley");
    await userEvent.click(screen.getByRole("checkbox", { name: /Ripley/i }));
    await userEvent.click(screen.getByRole("button", { name: /Reject/i }));
    await waitFor(() => expect(rejectRequests).toHaveBeenCalledWith([9]));
  });

  it("reads as off — and cannot send — when requests are disabled but candidates are on file", async () => {
    // The "off" state used to depend on the inbox being EMPTY, so stale candidates rendered the
    // full inbox with a live Send button on a feature the owner had turned off.
    getSettings.mockResolvedValue({ "requests.enabled": false });
    listRequests.mockResolvedValue([candidate({ id: 3, title: "Fallout" })]);
    renderPage();

    expect(await screen.findByText(/Requests are off/i)).toBeTruthy();
    expect(screen.getByText("Fallout")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /to Sonarr\/Radarr/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reject/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Fallout/i })).toBeDisabled();
  });

  it("keeps the inbox actionable while requests are on", async () => {
    listRequests.mockResolvedValue([candidate({ id: 3, title: "Fallout" })]);
    renderPage();

    expect(await screen.findByText("Fallout")).toBeTruthy();
    expect(screen.queryByText(/Requests are off/i)).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /Fallout/i }),
    ).not.toBeDisabled();
  });
});
