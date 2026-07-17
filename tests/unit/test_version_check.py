"""The update check must be right about "newer", and silent about everything else."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from shortlist.server import version_check


@pytest.fixture(autouse=True)
def _reset_cache():
    version_check._cache.update(at=None, value=None)
    yield
    version_check._cache.update(at=None, value=None)


def _stub_latest(monkeypatch, value):
    monkeypatch.setattr(version_check, "_fetch_latest", lambda: value)


def test_reports_a_strictly_newer_release(monkeypatch):
    _stub_latest(monkeypatch, {"tag": "v0.2.0", "url": "https://example/rel"})
    result = version_check.check_for_update("0.1.0.dev0")
    assert result == {"latest": "0.2.0", "url": "https://example/rel"}


def test_silent_when_current_is_up_to_date(monkeypatch):
    _stub_latest(monkeypatch, {"tag": "v0.2.0", "url": "u"})
    assert version_check.check_for_update("0.2.0") is None  # equal
    version_check._cache.update(at=None, value=None)
    _stub_latest(monkeypatch, {"tag": "v0.1.0", "url": "u"})
    assert version_check.check_for_update("0.2.0") is None  # older release than running


def test_swallows_a_failed_fetch(monkeypatch):
    def boom():
        raise RuntimeError("github down")

    # _fetch_latest itself catches; simulate the caught result (None) and assert no raise, no update.
    monkeypatch.setattr(version_check, "_fetch_latest", lambda: None)
    assert version_check.check_for_update("0.1.0") is None
    # And the real _fetch_latest never propagates a network error.
    monkeypatch.setattr(version_check.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(boom()))
    assert version_check._fetch_latest() is None


def test_caches_between_calls(monkeypatch):
    calls = {"n": 0}

    def counting():
        calls["n"] += 1
        return {"tag": "v9.9.9", "url": "u"}

    monkeypatch.setattr(version_check, "_fetch_latest", counting)
    version_check.check_for_update("0.1.0")
    version_check.check_for_update("0.1.0")
    assert calls["n"] == 1  # second call served from cache, not a second fetch


def test_a_bad_tag_is_ignored(monkeypatch):
    _stub_latest(monkeypatch, {"tag": "not-a-version", "url": "u"})
    version_check._cache.update(at=datetime.now(UTC), value={"tag": "not-a-version", "url": "u"})
    assert version_check.check_for_update("0.1.0") is None
