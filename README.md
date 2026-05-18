# Cloudflare Application Services Project

Public submission repo for the Cloudflare Application Services assignment.

## Live application

| URL | Access | What it shows |
| --- | --- | --- |
| <https://tunnel.mareoxlan.com/> | Public | Origin echo server. Returns request headers as JSON so Cloudflare headers can be inspected. |
| <https://tunnel.mareoxlan.com/secure> | Cloudflare Access | Authenticated page showing the logged-in email, timestamp, and country code. |
| <https://tunnel.mareoxlan.com/secure/us> | Cloudflare Access | US flag served from a private R2 bucket through a Worker. |

Access policy:

- `mareox@gmail.com` is allowed through Google IdP.
- `@cloudflare.com` email addresses are allowed for reviewer access.
- Unauthenticated users are redirected to Cloudflare Access.

## Project page

The GitHub Pages compatible report lives at:

- [`docs/index.html`](docs/index.html)

If GitHub Pages is enabled for this repo with source set to `docs/`, the public page should be:

- <https://mareox.github.io/Cloudflare-Project/>

## Written report

The written report is available in both formats:

- HTML report: [`docs/index.html`](docs/index.html)
- Markdown report: [`docs/REPORT.md`](docs/REPORT.md)

It addresses:

1. Working application and access instructions.
2. Implementation steps with configuration and testing evidence.
3. Product use cases.
4. Knowledge gaps filled during the process.
5. Target customer experience.

## Repository layout

```text
.
├── docs/
│   ├── index.html
│   ├── REPORT.md
│   └── screenshots/
├── origin-server/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── docker-compose.atlas.yml
│   ├── requirements.txt
│   └── server.py
└── worker/
    ├── assets/us.svg
    ├── package.json
    ├── package-lock.json
    ├── src/index.ts
    ├── tsconfig.json
    └── wrangler.jsonc
```

## Reproduce the origin

```bash
cd origin-server
docker compose up -d --build
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:8080/
```

The deployed homelab origin runs on Atlas at `192.168.30.210:18088` and is reached through Cloudflare Tunnel.

## Reproduce the Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler r2 bucket create country-flags
npx wrangler r2 object put country-flags/us.svg --file ./assets/us.svg --remote
npx wrangler deploy
```

The deployed Worker is `cf-application-secure` with routes:

- `tunnel.mareoxlan.com/secure`
- `tunnel.mareoxlan.com/secure/*`

