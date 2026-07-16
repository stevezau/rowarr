import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RowShelfPlacement } from "@/components/rows/row-shelf-placement";
import type { HubAnchorMap } from "@/lib/types";

const { getLibraries, getLibraryCollections } = vi.hoisted(() => ({
  getLibraries: vi.fn(),
  getLibraryCollections: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getLibraries: () => getLibraries(),
    getLibraryCollections: (key: string) => getLibraryCollections(key),
  },
}));

/** Controlled harness that records the latest hub_anchor the control emits. */
function Harness({
  start,
  onChange,
  pinnedTop,
  onConsumePin,
}: {
  start: HubAnchorMap;
  onChange: (m: HubAnchorMap) => void;
  pinnedTop?: boolean;
  onConsumePin?: () => void;
}) {
  const [value, setValue] = useState<HubAnchorMap>(start);
  return (
    <RowShelfPlacement
      value={value}
      libraryKeys={[]}
      media="both"
      pinnedTop={pinnedTop}
      onConsumePin={onConsumePin}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function renderControl(
  start: HubAnchorMap = {},
  opts: { pinnedTop?: boolean; onConsumePin?: () => void } = {},
) {
  const latest = { value: start };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Harness start={start} onChange={(m) => (latest.value = m)} {...opts} />
    </QueryClientProvider>,
  );
  return latest;
}

describe("RowShelfPlacement", () => {
  beforeEach(() => {
    getLibraries.mockResolvedValue([
      { key: "2", title: "TV Shows", type: "show" },
    ]);
    getLibraryCollections.mockResolvedValue([
      { title: "New Series" },
      { title: "Trending" },
    ]);
  });

  it("defaults each targeted library to inheriting the global setting (no entry)", async () => {
    renderControl();
    expect(await screen.findByText("TV Shows")).toBeTruthy();
    expect(screen.getByLabelText("Position")).toHaveValue("default");
  });

  it("sets a per-row anchor when a collection is chosen, and clears it back to default", async () => {
    const latest = renderControl();
    await screen.findByText("TV Shows");

    await userEvent.selectOptions(screen.getByLabelText("Position"), "before");
    await userEvent.selectOptions(
      await screen.findByLabelText("Collection"),
      "New Series",
    );
    await waitFor(() =>
      expect(latest.value).toEqual({
        "2": { anchor: "New Series", before: true },
      }),
    );

    await userEvent.selectOptions(screen.getByLabelText("Position"), "default");
    await waitFor(() => expect(latest.value).toEqual({}));
  });

  it("sets a per-row 'Top' with no collection needed", async () => {
    const latest = renderControl();
    await screen.findByText("TV Shows");

    await userEvent.selectOptions(screen.getByLabelText("Position"), "top");
    await waitFor(() => expect(latest.value).toEqual({ "2": { top: true } }));
    // Top needs no collection dropdown.
    expect(screen.queryByLabelText("Collection")).toBeNull();
  });

  it("carries a legacy row-level pin over into per-library Top, once, and consumes the pin", async () => {
    const onConsumePin = vi.fn();
    const latest = renderControl({}, { pinnedTop: true, onConsumePin });

    await screen.findByText("TV Shows");
    await waitFor(() => expect(latest.value).toEqual({ "2": { top: true } }));
    expect(onConsumePin).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Position")).toHaveValue("top");
  });

  it("does not consume the pin (so pin_top survives) when libraries can't load", async () => {
    getLibraries.mockRejectedValue(new Error("Plex is down"));
    const onConsumePin = vi.fn();
    const latest = renderControl({}, { pinnedTop: true, onConsumePin });

    await waitFor(() => expect(getLibraries).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0)); // let the effect (not) fire
    expect(onConsumePin).not.toHaveBeenCalled(); // pin_top left intact by the editor
    expect(latest.value).toEqual({});
  });

  it("does not re-pin a library the user has moved off Top", async () => {
    const latest = renderControl({}, { pinnedTop: true });
    await screen.findByText("TV Shows");
    await waitFor(() => expect(latest.value).toEqual({ "2": { top: true } }));

    await userEvent.selectOptions(screen.getByLabelText("Position"), "default");
    await new Promise((r) => setTimeout(r, 0)); // give the effect a chance to (wrongly) re-materialize
    expect(latest.value).toEqual({}); // the ref guard keeps it from coming back
  });
});
