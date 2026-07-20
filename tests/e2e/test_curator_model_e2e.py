"""The AI curator 'Model' field renders a real dropdown of the provider's models (not a text box)."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import ShortlistApp

pytestmark = pytest.mark.e2e

LOAD = 20_000
SAMPLE_MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"]


class _FakeCurator:
    """Stands in for a real provider client so the models endpoint returns a list without network."""

    def list_models(self) -> list[str]:
        return SAMPLE_MODELS


def test_curator_model_field_is_a_real_dropdown(page: Page, app: ShortlistApp, monkeypatch) -> None:
    # A configured curator (provider + saved key) is what unlocks the model fetch; stub the listing
    # so the dropdown is populated deterministically, no network.
    resp = app.api(
        "PUT",
        "/api/settings",
        json={"values": {"curator.provider": "anthropic", "curator.api_key": "sk-fake-key"}},
    )
    assert resp.status_code == 200, resp.text
    monkeypatch.setattr("shortlist.engine.curator.make_curator", lambda *a, **k: _FakeCurator())

    page.goto("/settings")
    card = page.get_by_test_id("connection-llm")
    expect(card).to_be_visible(timeout=LOAD)
    card.get_by_role("button", name="Edit").click()

    # The Model field is a native <select> — a real dropdown, not a plain text input.
    select = card.locator("select")
    expect(select).to_be_visible(timeout=LOAD)
    assert select.evaluate("el => el.tagName") == "SELECT"

    # The provider's models are real options in the dropdown once the fetch resolves.
    expect(select.get_by_role("option", name="claude-sonnet-5")).to_have_count(1, timeout=LOAD)
    for model in SAMPLE_MODELS:
        expect(select.get_by_role("option", name=model)).to_have_count(1)
    # Plus the "Custom…" escape hatch for typing any id, and the blank default.
    expect(select.get_by_role("option", name="Custom…")).to_have_count(1)

    # Pick one from the dropdown and prove the chosen value sticks.
    select.select_option("claude-sonnet-5")
    expect(select).to_have_value("claude-sonnet-5")
