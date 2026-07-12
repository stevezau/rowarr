---
globs: "rowarr/engine/{privacy,delivery,verify}*.py,rowarr/engine/clients/plex*.py"
---

# Plex Safety Rules (non-negotiable)

Rowarr modifies other people's Plex views and share permissions. These rules govern every code
path that WRITES to a Plex server or plex.tv. The Architecture Review agent blocks commits that
violate them.

1. **Privacy gate.** No real collection/label/visibility/filter write happens unless the instance
   has a passing Privacy Check recorded (`privacy_checks` row). Two exceptions, and only two:
   probes, and the **remedy pass** (`engine_run(ctx, [])` — the unhidable-row sweep plus
   merge-only exclude writes). The remedy runs precisely BECAUSE the gate is closed: a missing
   exclude, or a row Plex cannot hide, is what fails the check — so a gate that blocked the fix
   would block the only thing that can reopen it, and the leak would be permanent. The remedy may
   never create a collection, promote one, or remove an exclude; it may only make the server more
   private. Anything else stays behind the gate.
2. **Snapshot first.** Before the first restriction mutation for a user, persist a
   `restriction_snapshots` row with their current filters. Uninstall restores from these.
3. **Merge, never rebuild.** Share-filter writes are read-modify-write: parse the user's current
   `filterMovies`/`filterTelevision`, union our `rowarr_*` excludes into the existing `label!=`
   values, leave every other condition byte-identical. Never construct a filter string from scratch.
4. **Touch only what we own.** Only collections titled/labeled by Rowarr (`rowarr_*` label) may be
   modified or deleted. Detect and skip anything else — Kometa and other tools manage collections
   on the same servers; coexistence is mandatory.
5. **Owner + managed users.** The server owner is never restricted (Plex limitation — skip, don't
   error). Managed users' restriction _profiles_ (parental controls) are never modified by Rowarr.
6. **Throttle plex.tv.** ≤1 write/s with exponential backoff on 429; runs must be resume-safe
   (per-user transactionality — a crash mid-run never leaves a half-applied user).
7. **Probes clean up in `finally`.** Privacy Check artifacts (probe collection, canary filter
   change) are removed/restored even when the check fails or raises.
8. **Dry-run everywhere.** Every write path takes `dry_run` and logs the would-be diff instead.
9. **Secrets.** Plex tokens and LLM keys: encrypted at rest (Fernet, `/config/secret.key`), never
   logged, never in exception messages, redacted in the UI after save.
10. **Audit everything.** Every write (real or dry-run) emits a structured `events` row with the
    diff — "what changed on whose share at 03:31" must always be answerable from the UI.
11. **Fixture-backed assumptions.** Any new assumption about PMS/plex.tv response shapes gets a
    recorded fixture in `tests/fixtures/` from a real server response.
