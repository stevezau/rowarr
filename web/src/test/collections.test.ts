import { describe, expect, it } from "vitest";

import { rowOverrides } from "@/lib/collections";
import type { Collection, PlexLibrary } from "@/lib/types";

const LIBRARIES: PlexLibrary[] = [
  { key: "1", title: "Movies", type: "movie" },
  { key: "2", title: "4K Movies", type: "movie" },
  { key: "3", title: "TV Shows", type: "show" },
];

function collection(patch: Partial<Collection> = {}): Collection {
  return {
    id: 1,
    slug: "hidden-gems",
    name: "Hidden Gems",
    build: "per_person",
    audience: "everyone",
    audience_user_ids: [],
    enabled: true,
    size: 15,
    media: "both",
    sort_order: 0,
    name_template: "",
    min_watchers: 2,
    request_tag: "",
    candidate_sources: [],
    library_keys: [],
    prompt: { tone: "balanced", guidance: "", template: "" },
    ...patch,
  } as Collection;
}

describe("rowOverrides", () => {
  it("returns nothing for a row that is entirely on the global defaults", () => {
    expect(rowOverrides(collection(), LIBRARIES)).toEqual([]);
  });

  it("names the row's own sources by their short labels", () => {
    const parts = rowOverrides(
      collection({ candidate_sources: ["trakt", "llm_web"] }),
      LIBRARIES,
    );
    expect(parts).toContain("Sources: Trakt, AI web search");
  });

  it("names the libraries a row is pinned to", () => {
    const parts = rowOverrides(collection({ library_keys: ["2"] }), LIBRARIES);
    expect(parts).toContain("Libraries: 4K Movies");
  });

  it("falls back to the key for a library the server no longer reports", () => {
    const parts = rowOverrides(collection({ library_keys: ["9"] }), LIBRARIES);
    expect(parts).toContain("Libraries: Library 9");
  });

  it("reports a non-default tone, guidance notes, and a custom prompt distinctly", () => {
    expect(
      rowOverrides(
        collection({
          prompt: { tone: "cinephile", guidance: "", template: "" },
        }),
        LIBRARIES,
      ),
    ).toContain("Style: Cinephile");

    expect(
      rowOverrides(
        collection({
          prompt: { tone: "warm", guidance: "keep it short", template: "" },
        }),
        LIBRARIES,
      ),
    ).toContain("Style: Warm + notes");

    // A full custom template supersedes tone/guidance — the row's prompt is wholly its own.
    expect(
      rowOverrides(
        collection({
          prompt: { tone: "warm", guidance: "notes", template: "You are..." },
        }),
        LIBRARIES,
      ),
    ).toContain("Style: custom prompt");
  });

  it("never claims a style override on the default row — the engine curates it with the global recipe", () => {
    const parts = rowOverrides(
      collection({
        slug: "picked",
        name: "Picked for You",
        candidate_sources: ["trakt"],
        library_keys: ["2"],
        prompt: { tone: "cinephile", guidance: "notes", template: "custom" },
      }),
      LIBRARIES,
    );
    // Its sources and libraries ARE its own; only name/size/style follow the global settings.
    expect(parts).toEqual(["Sources: Trakt", "Libraries: 4K Movies"]);
  });

  it("withholds the libraries part until the library list has loaded (no raw section keys)", () => {
    expect(rowOverrides(collection({ library_keys: ["2"] }), null)).toEqual([]);
  });

  it("lists every override at once", () => {
    const parts = rowOverrides(
      collection({
        candidate_sources: ["trakt"],
        library_keys: ["2"],
        prompt: { tone: "cinephile", guidance: "", template: "" },
      }),
      LIBRARIES,
    );
    expect(parts).toEqual([
      "Sources: Trakt",
      "Libraries: 4K Movies",
      "Style: Cinephile",
    ]);
  });
});
