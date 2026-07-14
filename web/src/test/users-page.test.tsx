import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { User, UserPatch } from "@/lib/types";
import { UsersPage } from "@/pages/users";

const { getUsers, patchUser } = vi.hoisted(() => ({
  getUsers: vi.fn(),
  patchUser: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: {
      getUsers: () => getUsers(),
      patchUser: (id: number, patch: UserPatch) => patchUser(id, patch),
    },
  };
});

const SARAH: User = {
  id: 4,
  username: "sarah",
  slug: "sarah",
  user_type: "shared",
  enabled: true,
  cold_start: false,
  history_depth: 120,
  last_run_at: null,
  request_tag: "",
  hit_rate: null,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UsersPage", () => {
  beforeEach(() => {
    getUsers.mockReset();
    patchUser.mockReset();
  });

  it("says why when turning a user off is rejected, rather than just snapping the switch back", async () => {
    getUsers.mockResolvedValue([SARAH]);
    patchUser.mockRejectedValue(new ApiError(500, "The database is locked."));
    renderPage();

    const toggle = await screen.findByRole("switch", {
      name: /Shortlist row for sarah/i,
    });
    await userEvent.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /database is locked/i,
    );
    expect(patchUser).toHaveBeenCalledWith(4, { enabled: false });
    // The Switch mirrors the server, which still has her enabled.
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("re-fires the same change when the owner retries", async () => {
    getUsers.mockResolvedValue([SARAH]);
    patchUser.mockRejectedValue(new ApiError(500, "The database is locked."));
    renderPage();

    await userEvent.click(
      await screen.findByRole("switch", { name: /Shortlist row for sarah/i }),
    );
    await screen.findByRole("alert");

    patchUser.mockResolvedValue({ ...SARAH, enabled: false });
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));

    await waitFor(() => expect(patchUser).toHaveBeenCalledTimes(2));
    expect(patchUser.mock.calls.at(-1)).toEqual([4, { enabled: false }]);
  });
});
