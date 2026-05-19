/**
 * CF Application Services Assignment - Worker
 *
 * Routes:
 *   GET /secure          -> HTML with authenticated user identity
 *   GET /secure/{CC}     -> country flag from private R2 bucket
 *
 * Identity arrives via Cloudflare Access. The Worker validates the signed
 * Cf-Access-Jwt-Assertion before using the authenticated email.
 */

interface Env {
  FLAGS: R2Bucket;
  TUNNEL_HOSTNAME: string;
  TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}

const FLAG_CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

interface AccessJwtPayload {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  identity?: {
    email?: string;
  };
}

type AccessJwk = JsonWebKey & { kid?: string };

let cachedAccessKeys: { expiresAt: number; keys: AccessJwk[] } | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/secure" || path === "/secure/") {
      return handleSecureIndex(request, env);
    }

    const flagMatch = path.match(/^\/secure\/([A-Za-z]{2})\/?$/);
    if (flagMatch) {
      return handleFlag(flagMatch[1], env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function handleSecureIndex(request: Request, env: Env): Promise<Response> {
  const identity = await verifyAccessJwt(request, env).catch((error) => ({
    valid: false as const,
    reason: error instanceof Error ? error.message : "Cloudflare Access JWT validation failed",
  }));
  if (!identity.valid) {
    return new Response(
      `401 Unauthorized: ${identity.reason}`,
      { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const email =
    identity.payload.email ??
    identity.payload.identity?.email ??
    request.headers.get("Cf-Access-Authenticated-User-Email") ??
    "unknown";
  const country = (request.cf?.country as string | undefined) ?? "XX";
  const timestamp = new Date().toISOString();
  const flagHref = `https://${env.TUNNEL_HOSTNAME}/secure/${country}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Secure</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; }
    .card { padding: 1.5rem 2rem; border: 1px solid #e2e2e2; border-radius: 8px; background: #fafafa; }
    a { color: #f6821f; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    code { background: #eee; padding: 0.1rem 0.4rem; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="card">
    <p><code>${escapeHtml(email)}</code> authenticated at <code>${escapeHtml(timestamp)}</code> from <a href="${escapeHtml(flagHref)}">${escapeHtml(country)}</a></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function verifyAccessJwt(
  request: Request,
  env: Env
): Promise<{ valid: true; payload: AccessJwtPayload } | { valid: false; reason: string }> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    return { valid: false, reason: "missing Cloudflare Access JWT" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, reason: "malformed Cloudflare Access JWT" };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(base64UrlToString(encodedHeader)) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlToString(encodedPayload)) as AccessJwtPayload;

  if (header.alg !== "RS256" || !header.kid) {
    return { valid: false, reason: "unsupported Cloudflare Access JWT header" };
  }

  const key = (await getAccessKeys(env)).find((candidate) => candidate.kid === header.kid);
  if (!key) {
    return { valid: false, reason: "Cloudflare Access JWT signing key not found" };
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signedData = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlToBytes(encodedSignature);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature,
    signedData
  );
  if (!verified) {
    return { valid: false, reason: "Cloudflare Access JWT signature verification failed" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && payload.exp <= now) {
    return { valid: false, reason: "Cloudflare Access JWT expired" };
  }
  if (payload.nbf !== undefined && payload.nbf > now) {
    return { valid: false, reason: "Cloudflare Access JWT is not active yet" };
  }

  const expectedIssuer = `https://${env.TEAM_DOMAIN}.cloudflareaccess.com`;
  if (payload.iss !== expectedIssuer) {
    return { valid: false, reason: "Cloudflare Access JWT issuer mismatch" };
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(env.ACCESS_AUD)) {
    return { valid: false, reason: "Cloudflare Access JWT audience mismatch" };
  }

  return { valid: true, payload };
}

async function getAccessKeys(env: Env): Promise<AccessJwk[]> {
  if (cachedAccessKeys && cachedAccessKeys.expiresAt > Date.now()) {
    return cachedAccessKeys.keys;
  }

  const response = await fetch(`https://${env.TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error(`Unable to fetch Cloudflare Access certificates: ${response.status}`);
  }
  const body = (await response.json()) as { keys: AccessJwk[] };
  cachedAccessKeys = {
    expiresAt: Date.now() + 60 * 60 * 1000,
    keys: body.keys,
  };
  return body.keys;
}

async function handleFlag(countryCode: string, env: Env): Promise<Response> {
  const cc = countryCode.toLowerCase();

  for (const ext of ["svg", "png"]) {
    const key = `${cc}.${ext}`;
    const obj = await env.FLAGS.get(key);
    if (obj) {
      return new Response(obj.body, {
        headers: {
          "content-type": FLAG_CONTENT_TYPES[ext] ?? "application/octet-stream",
          "cache-control": "public, max-age=3600",
          "x-flag-source": "r2",
          "x-flag-key": key,
        },
      });
    }
  }

  return new Response(`No flag stored for country code "${countryCode}".`, {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function base64UrlToString(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
