# Shortlist

**A private, personalized "✨ Picked for You" row for every user on your Plex server.**

> ⚠️ **New app, in public beta.** It works and runs in production, but expect rough edges —
> please report bugs at https://github.com/stevezau/shortlist/issues. Thank you for testing it!

Solves "what should I watch next?" for everyone on your server. Shortlist watches what each of your
users watches, finds titles you already own that they haven't seen but probably want to, has an
LLM (or a plain heuristic — no AI required) curate and explain the picks, and puts them on each
user's Plex Home screen as their own private row — visible only to them.

- **Private by design** — per-user label restrictions (Plex Pass, PMS ≥ 1.43.2): each row is
  excluded on every other account's share, delivered hidden and promoted only once the exclusions
  are in place. Share filters are snapshotted first and restored on uninstall.
- **Can't hallucinate** — the AI only ranks titles verified to exist in your library.
- **Reversible** — every share-filter change is snapshotted; uninstall provably restores
  your server.
- **Plays nice with Kometa** — Shortlist never touches collections it didn't create.

## Quick start

```yaml
services:
  shortlist:
    image: ghcr.io/stevezau/shortlist:latest
    ports: ["5959:5959"]
    volumes: ["./config:/config"]
    environment:
      - TZ=Etc/UTC
      - PUID=1000
      - PGID=1000
    restart: unless-stopped
```

Open `http://your-host:5959` → **Login with Plex** → the wizard does the rest (~10 minutes
including your first rows).

Docs, source and issues: https://github.com/stevezau/shortlist

Tags: `latest` (releases) · `X.Y.Z` · `dev` (master) · `pr-<n>` (PR previews). amd64 + arm64.
