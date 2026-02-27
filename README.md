# LAM™ — Prove It (5-minute demo)

Goal: feel “proof-carrying memory” in minutes.

## Quickstart

Prereqs: Docker (Compose v2).

From this folder:

```bash
make demo
```

Then tear down:

```bash
make down
```

## Public vs local builds

This repo can run LAM two ways:

- **Public image (recommended for sharing):** default image is `ghcr.io/tuckerjensendev/lam-prove-it:latest` (override with `LAM_IMAGE`).
- **Local build (for maintainers):** if you have `lam-v2` checked out at `../lam/lam-v2`, `make demo` will automatically use `compose.local.yml` to build from source.
  - Override the path with `LAM_V2_DIR=/path/to/lam-v2`.

## What the demo does

`make demo` runs:

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
