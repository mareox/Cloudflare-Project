/**
 * CF Application Services Assignment - Worker
 *
 * Routes:
 *   GET /secure          -> HTML with authenticated user identity
 *   GET /secure/{CC}     -> country flag from private R2 bucket
 *
 * Identity arrives via Cloudflare Access. Access injects two trusted
 * headers after a successful IdP login:
 *   - Cf-Access-Authenticated-User-Email
 *   - Cf-Access-Jwt-Assertion (signed, verifiable)
 *
 * The Access policy in front of these routes guarantees the request
 * is authenticated; a missing email header therefore means the route
 * was reached without Access (configuration error) and we 401.
 */

interface Env {
  FLAGS: R2Bucket;
  TUNNEL_HOSTNAME: string;
  TEAM_DOMAIN: string;
}

const FLAG_CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

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

function handleSecureIndex(request: Request, env: Env): Response {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!email) {
    return new Response(
      "401 Unauthorized: request did not arrive via Cloudflare Access.",
      { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

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
