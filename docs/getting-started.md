# Getting started

## Requirements

- **Plex Media Server ≥ 1.43.2.10687** — earlier versions ignore the label exclusion that hides
  each row, so a private row could leak onto other accounts' Home/Recommended/Related. The wizard
  shows your server's version up front so you can confirm it before you start.
- **Plex Pass** on the server owner's account (label restrictions are a Pass feature).
- A **TMDB API key** (free: themoviedb.org → Settings → API).
- Optional: **Tautulli** for deeper watch history; **an LLM API key** (Anthropic/OpenAI/Google)
  or a local **Ollama** — Shortlist is fully functional with none of these (heuristic mode).

## Install (Docker)

```bash
mkdir shortlist && cd shortlist
curl -fsSLO https://raw.githubusercontent.com/stevezau/shortlist/master/docker-compose.example.yml
mv docker-compose.example.yml docker-compose.yml
docker compose up -d
```

Open `http://your-host:5959`. A fresh install goes straight into the wizard — there is
nothing to sign in to yet. Step 1 connects your Plex account (that's the sign-in, and it's
what claims the instance for you); from then on Shortlist only opens for that account.

> Set Shortlist up on your own network first. Until you sign in with Plex and link a server,
> anyone who can open the page could claim it as theirs — so don't put it on the public internet
> until you've finished the wizard. Once you've claimed it, it's yours.

The wizard then walks:

1. **Connect Plex** — PIN login, pick your server. The capability probe checks your PMS
   version, Plex Pass, and libraries with plain-English results.
2. **Recommendations & history** — where picks come from (TMDB, Trakt, AI, web search) and
   where watch history comes from: point at Tautulli if you run it; Plex's own history works
   without it.
3. **Choose your curator** — Claude / GPT / Gemini / Ollama / **None** (the built-in picker).
   Keys are yours, stored encrypted, redacted after save.
4. **Pick your users** — everyone you share with, with history-depth and new-viewer badges.
5. **Make it yours** — row name, row size, schedule. The name can be plain text or use a
   placeholder: `{user}` (the person's name — e.g. "Sarah's picks") or `{top_seed}` (their
   current favourite — e.g. "Because you watched {top_seed}").
6. **First run** — live per-user progress; when it finishes, each user has their private row.

Every row is kept private automatically: it's a labeled collection excluded on every other
account's share, delivered hidden and only promoted once those exclusions are in place. Your share
filters are snapshotted before the first change, so **Uninstall** (Settings → Danger Zone) puts them
back exactly as they were. This hiding relies on a PMS ≥ 1.43.2.10687 — older builds ignore the
label exclusion, which is why the wizard surfaces your version before you begin.

## The one honest caveat

Plex cannot hide collections from the **server owner** — your own Home shows every user's
row. Watch on a separate (Home) account if that bothers you.
