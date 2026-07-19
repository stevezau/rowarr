import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiAccessCard } from "@/components/settings/api-access-card";
import type * as ApiModule from "@/lib/api";
import type { ApiTokenStatus } from "@/lib/types";

const { getApiToken, createApiToken, revokeApiToken } = vi.hoisted(() => ({
  getApiToken: vi.fn(),
  createApiToken: vi.fn(),
  revokeApiToken: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: { getApiToken, createApiToken, revokeApiToken },
  };
});

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ApiAccessCard />
    </QueryClientProvider>,
  );
}

const OFF: ApiTokenStatus = { enabled: false, created_at: null, hint: null };

describe("ApiAccessCard", () => {
  beforeEach(() => {
    getApiToken.mockReset();
    createApiToken.mockReset();
    revokeApiToken.mockReset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  it("generates a token and reveals it exactly once, with a copy-now warning", async () => {
    getApiToken.mockResolvedValue(OFF);
    createApiToken.mockResolvedValue({
      token: "shl_secret_value",
      created_at: "2026-07-19T00:00:00Z",
      hint: "alue",
    });
    renderCard();

    await userEvent.click(
      await screen.findByRole("button", { name: /generate token/i }),
    );

    expect(await screen.findByText("shl_secret_value")).toBeInTheDocument();
    expect(screen.getByText(/won.t be shown again/i)).toBeInTheDocument();
    expect(createApiToken).toHaveBeenCalledOnce();
  });

  it("shows an active token's hint + regenerate/revoke, never the token itself", async () => {
    getApiToken.mockResolvedValue({
      enabled: true,
      created_at: "2026-07-19T00:00:00Z",
      hint: "wxyz",
    });
    renderCard();

    expect(await screen.findByText(/a token is active/i)).toBeInTheDocument();
    expect(screen.getByText("wxyz")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /regenerate/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
  });

  it("revokes the active token", async () => {
    getApiToken.mockResolvedValue({
      enabled: true,
      created_at: "2026-07-19T00:00:00Z",
      hint: "wxyz",
    });
    revokeApiToken.mockResolvedValue(OFF);
    renderCard();

    await userEvent.click(
      await screen.findByRole("button", { name: /revoke/i }),
    );
    await waitFor(() => expect(revokeApiToken).toHaveBeenCalledOnce());
  });
});
