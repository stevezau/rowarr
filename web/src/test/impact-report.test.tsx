import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImpactReport } from "@/components/dashboard/impact-report";
import type * as ApiModule from "@/lib/api";
import type { EffectivenessReport } from "@/lib/types";

const { getReport } = vi.hoisted(() => ({ getReport: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: { getReport: () => getReport() } };
});

function renderReport() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ImpactReport />
    </QueryClientProvider>,
  );
}

const REPORT: EffectivenessReport = {
  overall: { delivered: 10, watched: 4, hit_rate: 0.4 },
  trend: [{ week: "2026-28", watched: 4 }],
  per_user: [
    {
      username: "sarah",
      slug: "sarah",
      delivered: 6,
      watched: 3,
      hit_rate: 0.5,
    },
  ],
  per_row: [
    {
      slug: "picked",
      name: "✨ Picked for You",
      delivered: 10,
      watched: 4,
      hit_rate: 0.4,
    },
  ],
  recent: [
    {
      username: "sarah",
      title: "Dune: Part Two",
      media_type: "movie",
      row: "✨ Picked for You",
      seed_title: "Arrival",
      watched_at: new Date().toISOString(),
    },
  ],
};

describe("ImpactReport", () => {
  beforeEach(() => getReport.mockReset());

  it("shows the overall hit rate, per-person/row, and the recent-watches feed", async () => {
    getReport.mockResolvedValue(REPORT);
    renderReport();

    expect(
      await screen.findByText(/4 of 10 titles/i), // the overall headline
    ).toBeTruthy();
    expect(screen.getAllByText("40%").length).toBeGreaterThan(0); // overall + row hit rate
    expect(screen.getAllByText("sarah").length).toBeGreaterThan(0); // per-person + recent feed
    expect(screen.getByText("Dune: Part Two")).toBeTruthy(); // recent feed
  });

  it("explains the empty state before anything is delivered", async () => {
    getReport.mockResolvedValue({
      overall: { delivered: 0, watched: 0, hit_rate: null },
      trend: [],
      per_user: [],
      per_row: [],
      recent: [],
    });
    renderReport();

    expect(await screen.findByText(/No picks delivered yet/i)).toBeTruthy();
  });
});
