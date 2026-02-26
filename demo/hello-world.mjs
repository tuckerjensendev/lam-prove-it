#!/usr/bin/env node
import crypto from "crypto";

function normalizeUrl(u) {
  return String(u ?? "").trim().replace(/\/+$/, "");
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function sha256HexUtf8(text) {
  return crypto.createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpJson({ method, url, token, body, timeoutMs }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

async function waitForHealth(baseUrl, { timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { method: "GET" });
      const json = await res.json();
      if (res.ok && json && json.ok === true) return;
    } catch {
      // ignore
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for health at ${baseUrl}/health`);
}

async function waitForEnrichment({ apiUrl, token, timeoutMs, waitMs }, cellId) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const url = `${apiUrl}/enrichment/status?cell_id=${encodeURIComponent(cellId)}`;
    const res = await httpJson({ method: "GET", url, token, timeoutMs });
    if (res.ok) {
      const status = String(res.json?.status ?? "");
      if (status === "done") return;
      if (status === "failed") {
        const err = String(res.json?.last_error ?? "");
        throw new Error(`Enrichment failed for cell_id=${cellId}: ${err || "unknown"}`);
      }
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for enrichment for cell_id=${cellId} (is lam_worker running?)`);
}

async function main() {
  const apiUrl = normalizeUrl(process.env.LAM_API_URL || "http://127.0.0.1:8080/v1");
  const baseUrl = normalizeUrl(process.env.LAM_BASE_URL || apiUrl.replace(/\/v1$/, ""));

  const adminToken = String(process.env.LAM_ADMIN_TOKEN ?? "").trim();
  if (!adminToken) throw new Error("Missing LAM_ADMIN_TOKEN (needed to mint a demo API key via /v1/admin/keys)");

  const tenantId = clampInt(process.env.LAM_DEMO_TENANT_ID, 1, 1, 2_000_000_000);
  const namespace = String(process.env.LAM_DEMO_NAMESPACE ?? "default");
  const scopeUserEnv = String(process.env.LAM_DEMO_SCOPE_USER ?? "").trim();
  const scopeUser =
    scopeUserEnv && scopeUserEnv.toLowerCase() !== "auto" ? scopeUserEnv : `demo-${crypto.randomBytes(4).toString("hex")}`;

  const timeoutMs = clampInt(process.env.LAM_DEMO_HTTP_TIMEOUT_MS, 15_000, 1_000, 120_000);
  const waitMs = clampInt(process.env.LAM_DEMO_ENRICH_WAIT_MS, 30_000, 1_000, 300_000);
  const ctxLimit = clampInt(process.env.LAM_DEMO_CONTEXT_LIMIT, 8, 1, 50);
  const maxChars = clampInt(process.env.LAM_DEMO_MAX_CHARS, 1200, 200, 20_000);

  const answer = "tangerine ladder";
  const sentence = `The demo launch code is: ${answer}.`;
  const doc = `LAM Hello World (proof-carrying memory)

${sentence}
The on-call engineer is: Casey.

If asked for the demo launch code, respond with exactly: "${answer}".`;

  const query = "What is the demo launch code?";

  console.log(`[1/5] Waiting for LAM health: ${baseUrl}/health`);
  await waitForHealth(baseUrl, { timeoutMs: 60_000 });

  console.log(`[2/5] Minting a demo API key (tenant=${tenantId}, user=${scopeUser}, ns=${namespace})`);
  const keyRes = await httpJson({
    method: "POST",
    url: `${apiUrl}/admin/keys`,
    token: adminToken,
    body: {
      tenant_id: tenantId,
      scope_user: scopeUser,
      namespace,
      label: `hello-world-${new Date().toISOString().slice(0, 10)}`,
    },
    timeoutMs,
  });
  if (!keyRes.ok) throw new Error(`/v1/admin/keys failed (${keyRes.status}): ${JSON.stringify(keyRes.json ?? {})}`);

  const token = String(keyRes.json?.token ?? "").trim();
  if (!token) throw new Error("admin/keys response missing token");

  console.log(`[3/5] Ingesting a tiny doc`);
  const sentIdx = doc.indexOf(sentence);
  if (sentIdx < 0) throw new Error("Internal error: missing sentence in doc");
  const sentStart = Buffer.byteLength(doc.slice(0, sentIdx), "utf8");
  const sentEnd = sentStart + Buffer.byteLength(sentence, "utf8");

  const ingRes = await httpJson({
    method: "POST",
    url: `${apiUrl}/ingest`,
    token,
    body: {
      content_type: "text/plain; charset=utf-8",
      content: doc,
      claims: [
        {
          type: "FACT",
          canonical: `demo launch code is ${answer}`,
          evidence: {
            span_type: "text",
            transform: "identity",
            start_pos: sentStart,
            end_pos: sentEnd,
            quote_budget: 512,
          },
        },
      ],
    },
    timeoutMs,
  });
  if (!ingRes.ok) throw new Error(`/v1/ingest failed (${ingRes.status}): ${JSON.stringify(ingRes.json ?? {})}`);

  const cellId = String(ingRes.json?.cell_id ?? "").trim();
  if (!cellId) throw new Error("/v1/ingest response missing cell_id");

  console.log(`[4/5] Waiting for enrichment (cell_id=${cellId})`);
  await waitForEnrichment({ apiUrl, token, timeoutMs, waitMs }, cellId);

  console.log(`[5/5] Asking the same question two ways (RAG-ish vs LAM-ish)`);

  const ctxRag = await httpJson({
    method: "POST",
    url: `${apiUrl}/context`,
    token,
    body: { q: query, limit: ctxLimit, max_chars: maxChars, passage_kind: "sentence_window_v1" },
    timeoutMs,
  });
  if (!ctxRag.ok) throw new Error(`/v1/context (sentence_window_v1) failed (${ctxRag.status}): ${JSON.stringify(ctxRag.json ?? {})}`);

  const ctxLam = await httpJson({
    method: "POST",
    url: `${apiUrl}/context`,
    token,
    body: { q: query, limit: ctxLimit, max_chars: maxChars, passage_kind: "evidence_span_v1" },
    timeoutMs,
  });
  if (!ctxLam.ok) throw new Error(`/v1/context (evidence_span_v1) failed (${ctxLam.status}): ${JSON.stringify(ctxLam.json ?? {})}`);

  const ragText = String(ctxRag.json?.context_text ?? "");
  const lamText = String(ctxLam.json?.context_text ?? "");

  console.log("");
  console.log("=== RAG-ish (sentence_window_v1) ===");
  console.log(ragText || "(empty context_text)");

  console.log("");
  console.log("=== LAM-ish (evidence_span_v1) ===");
  console.log(lamText || "(empty context_text)");

  const lamPassages = Array.isArray(ctxLam.json?.passages) ? ctxLam.json.passages : [];
  const lamCitations = Array.isArray(ctxLam.json?.citations) ? ctxLam.json.citations : [];

  const chosenPassage =
    lamPassages.find((p) => String(p?.text ?? "").toLowerCase().includes(answer)) || lamPassages[0] || null;
  if (!chosenPassage) throw new Error("No passages returned from /v1/context (LAM-ish)");

  const chosenPid = String(chosenPassage.passage_id ?? "").trim();
  const chosenRef = String(chosenPassage.ref ?? "").trim();
  if (!chosenPid) throw new Error("Chosen passage missing passage_id");

  const chosenCitation =
    lamCitations.find((c) => String(c?.passage_id ?? "").trim() === chosenPid) ||
    lamCitations.find((c) => String(c?.ref ?? "").trim() === chosenRef) ||
    null;
  if (!chosenCitation) throw new Error("Failed to find matching citation for chosen passage");

  const expectedSha = String(chosenCitation.sha256 ?? "").trim();
  if (!expectedSha || expectedSha.length < 16) throw new Error("Chosen citation missing sha256");

  console.log("");
  console.log("Citations:");
  for (const c of lamCitations) {
    const ref = String(c?.ref ?? "").trim();
    const pid = String(c?.passage_id ?? "").trim();
    const sha = String(c?.sha256 ?? "").trim();
    if (!ref || !pid || !sha) continue;
    console.log(`- ${ref} passage_id=${pid} sha256=${sha}`);
  }

  console.log("");
  console.log(`Decoding citation ${String(chosenCitation.ref ?? "").trim() || "(no ref)"} (passage_id=${chosenPid})`);
  const decRes = await httpJson({
    method: "GET",
    url: `${apiUrl}/decode?passage_id=${encodeURIComponent(chosenPid)}`,
    token,
    timeoutMs,
  });
  if (!decRes.ok) throw new Error(`/v1/decode?passage_id failed (${decRes.status}): ${JSON.stringify(decRes.json ?? {})}`);

  const encoding = String(decRes.json?.encoding ?? "");
  const decodedText = encoding === "utf8" ? String(decRes.json?.text ?? "") : "";
  if (!decodedText) {
    throw new Error(`Expected utf8 decoded text for this demo (got encoding=${encoding || "empty"})`);
  }

  const gotSha = sha256HexUtf8(decodedText);
  if (gotSha !== expectedSha) {
    throw new Error(`SHA-256 mismatch: expected ${expectedSha} got ${gotSha}`);
  }

  console.log("");
  console.log("Decoded span (verified):");
  console.log(`- cell_id=${String(decRes.json?.cell_id ?? "")}`);
  console.log(`- span_type=${String(decRes.json?.span_type ?? "")} transform=${String(decRes.json?.transform ?? "")}`);
  console.log(`- start_pos=${String(decRes.json?.start_pos ?? "")} end_pos=${String(decRes.json?.end_pos ?? "")}`);
  console.log("");
  console.log(decodedText);

  console.log("");
  console.log("Dev token (use for manual curl calls):");
  console.log(`export TOKEN=${token}`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});

