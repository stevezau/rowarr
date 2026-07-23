import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { ToolsPage } from "@/pages/tools";

const {
  reconcileWatched,
  syncWatched,
  syncUsers,
  testConnection,
  getSettings,
} = vi.hoisted(() => ({
  reconcileWatched: vi.fn(),
  syncWatched: vi.fn(),
  syncUsers: vi.fn(),
  testConnection: vi.fn(),
  getSettings: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: {
      reconcileWatched,
      syncWatched,
      syncUsers,
      testConnection,
      getSettings,
    },
  };
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToolsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ToolsPage — reconcile watched from Plex", () => {
  beforeEach(() => {
    reconcileWatched.mockReset();
    syncWatched.mockReset();
    syncUsers.mockReset();
    testConnection.mockReset();
    getSettings.mockReset();
    getSettings.mockResolvedValue({});
  });

  it("tells the owner to set up database access when it isn't configured", async () => {
    reconcileWatched.mockResolvedValue({
      configured: false,
      users: 0,
      added: 0,
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /reconcile now/i }),
    );

    // Points at the in-card setup, not off to a Settings tab it doesn't live in anymore.
    expect(
      await screen.findByText(/no plex database found/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /database access/i }),
    ).toBeInTheDocument();
  });

  it("sets up database access in the card itself — no trip to Settings", async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /database access/i }),
    );

    // The custom-path field lives right here, with its own Test — not in Settings → Connections.
    const path = await screen.findByLabelText(/custom path/i);
    expect(path).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /settings → connections/i }),
    ).not.toBeInTheDocument();

    testConnection.mockResolvedValue({
      ok: true,
      message: "connected — watched items recorded for 12 account(s)",
    });
    await userEvent.click(screen.getByRole("button", { name: /^test$/i }));
    expect(
      await screen.findByText(/watched items recorded for 12/i),
    ).toBeInTheDocument();
    expect(testConnection).toHaveBeenCalledWith("plexdb");
  });

  it("reports how many watched titles it added", async () => {
    reconcileWatched.mockResolvedValue({
      configured: true,
      users: 5,
      added: 42,
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /reconcile now/i }),
    );

    expect(
      await screen.findByText(/added 42 watched titles across 5 users/i),
    ).toBeInTheDocument();
  });

  it("says everyone is in sync when the database held nothing new", async () => {
    reconcileWatched.mockResolvedValue({
      configured: true,
      users: 3,
      added: 0,
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /reconcile now/i }),
    );

    expect(await screen.findByText(/already in sync/i)).toBeInTheDocument();
  });

  it("surfaces a read failure with a retry rather than failing silently", async () => {
    reconcileWatched.mockRejectedValue(
      new Error("database disk image is malformed"),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /reconcile now/i }),
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("reports real added/updated counts after syncing users", async () => {
    syncUsers.mockResolvedValue({ added: 2, updated: 5, total: 7 });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /sync users/i }),
    );

    expect(
      await screen.findByText(/synced 7 users — 2 added, 5 updated/i),
    ).toBeInTheDocument();
  });

  it("says users are up to date when the sync changed nothing", async () => {
    syncUsers.mockResolvedValue({ added: 0, updated: 0, total: 7 });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /sync users/i }),
    );

    expect(
      await screen.findByText(/all 7 users are already up to date/i),
    ).toBeInTheDocument();
  });
});
