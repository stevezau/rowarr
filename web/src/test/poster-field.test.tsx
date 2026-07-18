import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PosterField } from "@/components/rows/poster-field";
import type { PosterInput } from "@/lib/types";

const getImageProvider = vi.fn(() =>
  Promise.resolve({
    capable: false,
    provider: "anthropic",
    reason: "no images here",
  }),
);

vi.mock("@/lib/api", () => ({
  api: {
    getImageProvider: () => getImageProvider(),
    posterImageUrl: (id: number) => `/img/${id}`,
  },
  apiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

function renderField(
  poster: Partial<PosterInput>,
  collectionId: number | null = 1,
) {
  const value: PosterInput = {
    mode: "",
    title: "",
    subtitle: "",
    style: "",
    ...poster,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PosterField
        value={value}
        onChange={() => {}}
        collectionId={collectionId}
        hasImage={false}
      />
    </QueryClientProvider>,
  );
}

describe("PosterField", () => {
  it("offers the three poster sources", () => {
    renderField({});
    expect(screen.getByText("Plex default")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Generate")).toBeInTheDocument();
  });

  it("shows the generate text fields when generating", () => {
    renderField({ mode: "generate" });
    expect(screen.getByLabelText("Title text")).toBeInTheDocument();
    expect(screen.getByLabelText("Art style")).toBeInTheDocument();
  });

  it("tells a brand-new row to save first before uploading", () => {
    renderField({ mode: "upload" }, null);
    expect(screen.getByText(/save the row first/i)).toBeInTheDocument();
  });

  it("surfaces the provider gate when the AI can't make images", async () => {
    renderField({ mode: "generate" });
    expect(await screen.findByText("no images here")).toBeInTheDocument();
  });
});
