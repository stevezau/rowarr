import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { PickList } from "@/components/pick-list";
import type * as ApiModule from "@/lib/api";
import type { Pick } from "@/lib/types";

const { setBlocked } = vi.hoisted(() => ({
  setBlocked: vi.fn((_userId: number, _body: unknown) => Promise.resolve({})),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    api: {
      setBlocked: (userId: number, body: unknown) => setBlocked(userId, body),
      getBlocked: () => Promise.resolve([]),
    },
  };
});

const PICK: Pick = {
  rank: 1,
  title: "The Searchers",
  reason: "Because you watched Rio Bravo",
  tmdb_id: 42,
  media_type: "movie",
  seed_tmdb_id: 99,
  seed_title: "Rio Bravo",
};

function renderPicks(picks: Pick[], userId?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PickList picks={picks} userId={userId} />
    </QueryClientProvider>,
  );
}

describe("PickList — ignoring a suggestion (issue #5)", () => {
  beforeEach(() => setBlocked.mockClear());

  it("blocks the TITLE without touching what may inspire it", async () => {
    renderPicks([PICK], 7);

    await userEvent.click(screen.getByRole("button", { name: /Never suggest The Searchers/i }));

    await waitFor(() => expect(setBlocked).toHaveBeenCalledTimes(1));
    // The kwargs are the whole contract: the wrong id, or block_seed set here, silences the wrong thing.
    expect(setBlocked).toHaveBeenCalledWith(7, {
      tmdb_id: 42,
      media_type: "movie",
      title: "The Searchers",
      block_pick: true,
    });
  });

  it("blocks the SEED — the 'inspired by' title, not the pick", async () => {
    renderPicks([PICK], 7);

    await userEvent.click(
      screen.getByRole("button", { name: /Stop Rio Bravo inspiring recommendations/i }),
    );

    expect(setBlocked).toHaveBeenCalledWith(7, {
      tmdb_id: 99, // the SEED's id, not the pick's
      media_type: "movie",
      title: "Rio Bravo",
      block_pick: false,
      block_seed: true,
    });
  });

  it("offers no seed control when a pick has no recorded seed", () => {
    renderPicks([{ ...PICK, seed_tmdb_id: null, seed_title: undefined }], 7);

    expect(screen.getByRole("button", { name: /Never suggest/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /inspiring/i })).toBeNull();
  });

  it("shows no ignore controls at all where there's no user to block for", () => {
    renderPicks([PICK]);

    expect(screen.queryByRole("button", { name: /Never suggest/i })).toBeNull();
  });
});
