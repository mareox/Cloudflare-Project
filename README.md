# Cloudflare Projects

Public submission repo for Cloudflare application and network services assignments.

## Project task split

The repo is divided into three Cloudflare project tracks under
[`_cloudflare-projects/`](_cloudflare-projects/):

| Project | Scope |
| --- | --- |
| [`Application_Services`](_cloudflare-projects/Application_Services/TASK.md) | Origin service, Tunnel, Worker, R2, and Application Services report. |
| [`Network_Services`](_cloudflare-projects/Network_Services/TASK.md) | Magic Transit written report, diagrams, and exported document artifacts. |
| [`Zero_Trust`](_cloudflare-projects/Zero_Trust/TASK.md) | Cloudflare Access, Google IdP, reviewer allow policy, and protected `/secure*` routes. |

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

## Report and project page

GitHub's normal file view does not render standalone HTML files. It shows
HTML source code. Use the GitHub Pages links for rendered HTML review:

- GitHub-rendered report: [`docs/REPORT.md`](docs/REPORT.md)
- GitHub-rendered docs landing page: [`docs/README.md`](docs/README.md)
- Rendered Application Services HTML report: <https://mareox.github.io/Cloudflare-Project/>
- Rendered Network Services HTML report: <https://mareox.github.io/Cloudflare-Project/network.html>
- Network Services Markdown report: [`docs/network-report.md`](docs/network-report.md)
- Network Services DOCX report: [`docs/network-report.docx`](docs/network-report.docx)

If GitHub Pages is enabled for this repo with source set to `main` and
`/docs`, the HTML version renders at:

- <https://mareox.github.io/Cloudflare-Project/>
- <https://mareox.github.io/Cloudflare-Project/network.html>

## Written report

The Application Services written report is available in Markdown for GitHub
review and HTML for GitHub Pages:

- Markdown report: [`docs/REPORT.md`](docs/REPORT.md)
- Rendered HTML report: <https://mareox.github.io/Cloudflare-Project/>

It addresses:

1. Working application and access instructions.
2. Implementation steps with configuration and testing evidence.
3. Product use cases.
4. Knowledge gaps filled during the process.
5. Target customer experience.

The Network Services assignment answers are also published in this repo:

- Rendered HTML report: <https://mareox.github.io/Cloudflare-Project/network.html>
- Markdown report: [`docs/network-report.md`](docs/network-report.md)
- DOCX source: [`docs/network-report.docx`](docs/network-report.docx)

It addresses Magic Transit BYOIP onboarding, external routing updates, GRE
overhead, MSS clamping, smaller-than-/24 overlay routing, DSR firewall
considerations, packet flow, and firewall rule debugging.

## Repository layout

```text
.
├── _cloudflare-projects/
│   ├── Application_Services/
│   ├── Network_Services/
│   └── Zero_Trust/
├── docs/
│   ├── index.html
│   ├── REPORT.md
│   ├── network.html
│   ├── network-report.md
│   ├── network-report.docx
│   ├── assets/
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

The deployed homelab origin runs on a private Docker host at `http://<private-origin-ip>:18088` and is reached through Cloudflare Tunnel.

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
