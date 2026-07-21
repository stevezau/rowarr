"""SHORTLIST_DRY_RUN parsing — a safety toggle, so the truthy set and typo detection are pinned."""

import pytest

from shortlist.server.safe_mode import force_dry_run, misconfigured_dry_run


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "Yes", " on ", "on"])
def test_recognized_truthy_values_enable_safe_mode(value, monkeypatch):
    monkeypatch.setenv("SHORTLIST_DRY_RUN", value)
    assert force_dry_run() is True
    assert misconfigured_dry_run() is None


def test_unset_is_off(monkeypatch):
    monkeypatch.delenv("SHORTLIST_DRY_RUN", raising=False)
    assert force_dry_run() is False
    assert misconfigured_dry_run() is None


@pytest.mark.parametrize("value", ["0", "false", "no", ""])
def test_falsey_values_are_off(value, monkeypatch):
    monkeypatch.setenv("SHORTLIST_DRY_RUN", value)
    assert force_dry_run() is False


@pytest.mark.parametrize("value", ["tru", "enabled", "yolo"])
def test_a_typo_is_off_but_reported_so_it_never_fails_open_silently(value, monkeypatch):
    # A safety toggle that silently ignored a typo would leave an operator who believed the server
    # protected taking live writes — so the value is surfaced (boot logs a warning).
    monkeypatch.setenv("SHORTLIST_DRY_RUN", value)
    assert force_dry_run() is False
    assert misconfigured_dry_run() == value
