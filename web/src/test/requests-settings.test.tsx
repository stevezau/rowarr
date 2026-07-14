import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestsSettings } from "@/components/requests-settings";
import type { Settings } from "@/lib/types";

const { putSettings } = vi.hoisted(() => ({
  putSettings: vi.fn((values: Settings) => Promise.resolve(values)),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    api: {
      putSettings: (values: Settings) => putSettings(values),
      testConnection: () => Promise.resolve({ ok: true, message: "Connected" }),
      getArrOptions: () =>
        Promise.resolve({ quality_profiles: [], root_folders: [] }),
    },
  };
});

function renderPanel(settings: Settings = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RequestsSettings settings={settings} />
    </QueryClientProvider>,
  );
}

describe("RequestsSettings", () => {
  beforeEach(() => putSettings.mockClear());

  it("keeps the config hidden until requests are turned on", async () => {
    renderPanel();
    // The explainer is always shown; the app config only appears once enabled.
    expect(screen.getByText(/Fill in the gaps automatically/i)).toBeTruthy();
    expect(screen.queryByText("Radarr")).toBeNull();

    await userEvent.click(
      screen.getByLabelText(/Turn automatic requests on or off/i),
    );

    expect(screen.getByText("Radarr")).toBeTruthy();
    expect(screen.getByText("Sonarr")).toBeTruthy();
    expect(screen.getByText(/Guardrails/i)).toBeTruthy();
  });

  it("points to Connections when neither app is connected", async () => {
    renderPanel();
    await userEvent.click(
      screen.getByLabelText(/Turn automatic requests on or off/i),
    );
    // The connection (address + key) lives in Connections now; blank settings show the prompt
    // and a way to get there rather than profile/folder dropdowns.
    expect(
      screen.getByText(/Connect Radarr or Sonarr to start requesting/i),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /Go to Connections/i }).length,
    ).toBeGreaterThan(0);
  });

  it("saves the enabled flag and thresholds", async () => {
    renderPanel({
      "requests.min_rating": 7,
      "requests.min_votes": 100,
      "requests.max_per_run": 5,
    });
    await userEvent.click(
      screen.getByLabelText(/Turn automatic requests on or off/i),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Save requests/i }),
    );

    expect(putSettings).toHaveBeenCalledTimes(1);
    const payload = putSettings.mock.calls[0]?.[0] ?? {};
    expect(payload["requests.enabled"]).toBe(true);
    expect(payload["requests.min_rating"]).toBe(7);
    expect(payload["requests.max_per_run"]).toBe(5);
    // The connection is owned by Connections now — saving Requests must NEVER emit the URL/key,
    // or a stale/empty form value would silently wipe the API key saved there.
    expect(payload).not.toHaveProperty("requests.radarr.apikey");
    expect(payload).not.toHaveProperty("requests.radarr.url");
    expect(payload).not.toHaveProperty("requests.sonarr.apikey");
    expect(payload).not.toHaveProperty("requests.sonarr.url");
  });

  it("hides the connect prompt and shows the filing pickers once an app is connected", async () => {
    renderPanel({
      "requests.radarr.url": "http://radarr",
      "requests.radarr.apikey": "•••••", // a saved key comes back redacted -> "connected"
    });
    await userEvent.click(
      screen.getByLabelText(/Turn automatic requests on or off/i),
    );
    // Radarr is connected, so the top "connect first" callout is gone and its filing pickers render.
    expect(
      screen.queryByText(/Connect Radarr or Sonarr to start requesting/i),
    ).toBeNull();
    expect(await screen.findByText("Quality")).toBeTruthy();
    expect(screen.getByText("Save to")).toBeTruthy();
  });
});
