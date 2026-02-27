# LAM™ — Prove It (5-minute demo)

Goal: feel “proof-carrying memory” in minutes.

## What you need

Everything runs in Docker. You do **not** need Node.js, Postgres, or any LAM code locally.

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes `docker compose`)
- Either:
  - [Git](https://git-scm.com/downloads) (recommended)
  - Or download this repo as a ZIP and unzip it (GitHub → “Code” → “Download ZIP”)
- Optional: `make` (recommended on macOS/Linux; not required)

Windows note: Docker Desktop will prompt you to enable/install WSL2 (and may require a reboot).

Windows 11 quick install (optional, if you have `winget`):

```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id Git.Git
```

## Quickstart (once Docker is installed)

Make sure Docker Desktop is running.

### Option A: macOS/Linux (with `make`)

```bash
git clone https://github.com/tuckerjensendev/lam-prove-it.git
cd lam-prove-it
make demo
```

### Option B: Windows 11 (PowerShell; no `make` required)

First, confirm Docker is available:

```powershell
docker --version
docker compose version
```

Then run the demo:

```powershell
git clone https://github.com/tuckerjensendev/lam-prove-it.git
cd lam-prove-it
docker compose up -d
docker compose exec -T demo node /demo/hello-world.mjs
```

No Git? Download ZIP and then:

```powershell
cd path\to\lam-prove-it
docker compose up -d
docker compose exec -T demo node /demo/hello-world.mjs
```

Troubleshooting:
- If you see **`'docker' is not recognized...`**, Docker Desktop isn’t installed (or your terminal needs a restart).
- If you see **`'compose' is not a docker command`**, update Docker Desktop, or try the legacy command: `docker-compose up -d`.

## Tear down

```bash
make down
```

No `make`? Tear down with:

```bash
docker compose down -v --remove-orphans
```

## Public vs local builds

This repo can run LAM two ways:

- **Public image (recommended for sharing):** default image is `ghcr.io/tuckerjensendev/lam-prove-it:latest` (override with `LAM_IMAGE`).
- **Local build (for maintainers):** if you have `lam-v2` checked out at `../lam/lam-v2`, `make demo` will automatically use `compose.local.yml` to build from source.
  - Override the path with `LAM_V2_DIR=/path/to/lam-v2`.

## What the demo does

The demo script (`demo/hello-world.mjs`) runs:

1. Mint an API key (via local `/v1/admin/*` endpoints)
2. Ingest a small text doc (with an evidence-grounded claim)
3. Ask a question with `POST /v1/context` (returns citations)
4. Decode a citation via `GET /v1/decode?passage_id=...`
5. Verify the citation SHA-256 matches the decoded span

## RAG vs LAM (tiny side-by-side)

The demo prints two context bundles for the same query:

- **RAG-ish**: `passage_kind=sentence_window_v1` (wider sentence windows)
- **LAM-ish**: `passage_kind=evidence_span_v1` (narrower evidence-derived spans)

Both return decodeable citations (`passage_id`) you can mechanically verify via `/v1/decode`.

## Notes

- This Compose file uses **dev-only** defaults for `LAM_MASTER_KEY_B64` and `LAM_ADMIN_TOKEN`. Don’t reuse them in production.
- LAM is published on **localhost only** by default (`127.0.0.1:${LAM_DEMO_HTTP_PORT:-8080}`) to avoid exposing dev admin endpoints to your LAN.
- If `8080` is already in use, run: `LAM_DEMO_HTTP_PORT=18080 make demo`
