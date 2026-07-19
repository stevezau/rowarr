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

const OFF: ApiTokenStatus = { enabled: false, created_at: null, token: null };
const ACTIVE: ApiTokenStatus = {
  enabled: true,
  created_at: "2026-07-19T00:00:00Z",
  token: "shl_secret_value",
};

describe("ApiAccessCard", () => {
  beforeEach(() => {
    getApiToken.mockReset();
    createApiToken.mockReset();
    revokeApiToken.mockReset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  it("generates a token when none exists", async () => {
    getApiToken.mockResolvedValue(OFF);
    createApiToken.mockResolvedValue({
      token: "shl_new",
      created_at: "2026-07-19T00:00:00Z",
    });
    renderCard();

    await userEvent.click(
      await screen.findByRole("button", { name: /generate token/i }),
    );
    expect(createApiToken).toHaveBeenCalledOnce();
  });

  it("keeps the active token masked until Show is clicked", async () => {
    getApiToken.mockResolvedValue(ACTIVE);
    renderCard();

    // Masked by default: the real value is not on screen.
    expect(
      await screen.findByRole("button", { name: /show/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("shl_secret_value")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /show/i }));
    expect(screen.getByText("shl_secret_value")).toBeInTheDocument();
    // …and can be hidden again.
    await userEvent.click(screen.getByRole("button", { name: /hide/i }));
    expect(screen.queryByText("shl_secret_value")).not.toBeInTheDocument();
  });

  it("offers regenerate and revoke for an active token", async () => {
    getApiToken.mockResolvedValue(ACTIVE);
    revokeApiToken.mockResolvedValue(OFF);
    renderCard();

    expect(
      await screen.findByRole("button", { name: /regenerate/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(revokeApiToken).toHaveBeenCalledOnce());
  });
});
