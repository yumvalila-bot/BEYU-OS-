#!/usr/bin/env node
/**
 * BEYU OS Console — static HTTP server (spec §21).
 *
 * A dependency-free alternative front end to `apps/beyu-web`, for operators
 * who need a control plane UI without a Node build step: one HTML file and
 * this server, nothing to compile and nothing to install.
 *
 * It does two things.
 *
 *   1. Serves index.html.
 *   2. Reverse-proxies /api/v1/* to the BEYU API.
 *
 * The proxy is not a convenience. The browser must never be told to talk to a
 * different origin than the one it loaded, because (a) in a sandboxed or
 * port-forwarded deployment the API's address is not reachable from the user's
 * machine even when it is reachable from the server's, and (b) it keeps the
 * access token on a single origin instead of scattering CORS exceptions.
 *
 * WHAT THIS SERVER DOES NOT DO — deliberately:
 *   - No authorization. It forwards the Authorization header and lets the API
 *     decide. A front end that makes access decisions is a front end whose
 *     access decisions can be skipped with curl (spec §7, §54).
 *   - No database access of any kind (spec §7).
 *   - No business logic, no caching of authorization results.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const API_ORIGIN = (process.env.BEYU_API_ORIGIN ?? 'http://127.0.0.1:4000').replace(/\/$/, '');

/**
 * Framing is a deployment decision, so it is read at request time. Baking it
 * in at start-up would mean an operator could not change it without a rebuild.
 */
const ALLOW_EMBEDDING = () => process.env.BEYU_ALLOW_EMBEDDING === 'true';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Content-Security-Policy.
 *
 * `unsafe-inline` for style and script is present because this is a single
 * self-contained file with no build step — that is the trade being made, and
 * it is why `apps/beyu-web` exists for deployments that want a stricter
 * policy. Everything else is locked down: no external origins at all, so a
 * successful injection still cannot exfiltrate a token.
 */
function securityHeaders() {
  const frameAncestors = ALLOW_EMBEDDING() ? "frame-ancestors *" : "frame-ancestors 'none'";
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      frameAncestors,
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    // Tokens live in this document. Never let it sit in a shared cache.
    'Cache-Control': 'no-store',
  };
}

/** Forwards a request to the API, streaming the response back unchanged. */
async function proxy(req, res) {
  const target = `${API_ORIGIN}${req.url}`;

  // Only the headers the API needs. Hop-by-hop headers and the browser's
  // Host are dropped rather than forwarded.
  const headers = {};
  for (const name of ['authorization', 'content-type', 'accept', 'cookie']) {
    const value = req.headers[name];
    if (value) headers[name] = value;
  }
  headers['x-forwarded-host'] = req.headers.host ?? '';
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] ?? 'http';

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    // Report the failure as a gateway error in the API's own envelope shape,
    // so the client has one error format to handle rather than two.
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          status: 502,
          code: 'UPSTREAM_UNAVAILABLE',
          message: `The BEYU API at ${API_ORIGIN} did not respond: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      }),
    );
    return;
  }

  const out = { 'cache-control': 'no-store' };
  for (const [name, value] of upstream.headers) {
    if (['content-encoding', 'transfer-encoding', 'connection', 'content-length'].includes(name)) {
      continue;
    }
    out[name] = value;
  }

  res.writeHead(upstream.status, out);
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

/**
 * Static assets are served from an explicit allowlist rather than from
 * whatever happens to be on disk beside this script.
 *
 * A path-traversal check ("resolve, then confirm the result is still under
 * HERE") is necessary but not sufficient: it still happily serves every file
 * that IS under HERE, which here includes server.mjs itself and the README.
 * Publishing your own source is not a credential leak, but it is free
 * reconnaissance, and the list of things sitting next to the entry point grows
 * over time without anyone re-reading this function. An allowlist cannot drift.
 */
const SERVABLE = new Set(['/index.html']);

async function sendFile(res, path, status = 200) {
  const info = await stat(path);
  res.writeHead(status, {
    ...securityHeaders(),
    'content-type': MIME[extname(path)] ?? 'application/octet-stream',
    'content-length': info.size,
  });
  createReadStream(path).pipe(res);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // Decode before normalising, so %2e%2e%2f is judged as the traversal it is
  // rather than as a literal filename.
  let requested;
  try {
    requested = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad request');
    return;
  }
  // Judge the escape attempt BEFORE normalising, because normalise is what
  // destroys the evidence: '/../../etc/passwd' collapses to '/etc/passwd',
  // which is then indistinguishable from a legitimate client-side route and
  // would be answered with the shell and a 200. No file leaks either way --
  // nothing outside the allowlist is ever opened -- but a probe deserves a
  // refusal, not a page.
  if (requested.split('/').includes('..')) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }

  requested = normalize(requested);
  if (requested === '/' || requested === '.') requested = '/index.html';

  if (SERVABLE.has(requested)) {
    await sendFile(res, join(HERE, requested.slice(1)));
    return;
  }

  // Anything with a file extension that is not on the list is absent, full
  // stop. Only extensionless paths fall through to the single-page shell, and
  // a traversal attempt is never one of those.
  if (extname(requested)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }

  await sendFile(res, join(HERE, 'index.html'));
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    proxy(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Proxy error');
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }

  serveStatic(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Server error');
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `BEYU OS Console\n` +
      `  serving  http://${HOST}:${PORT}\n` +
      `  api      ${API_ORIGIN} (proxied at /api/v1)\n` +
      `  framing  ${ALLOW_EMBEDDING() ? 'allowed (BEYU_ALLOW_EMBEDDING=true)' : 'denied'}\n`,
  );
});
