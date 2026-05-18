# Application_Services

## Goal

Build and document a Cloudflare-backed application that combines DNS, Cloudflare Tunnel, Workers, and R2 on a live hostname.

## Repo artifacts

| Artifact | Path |
| --- | --- |
| Application report | [`../../docs/REPORT.md`](../../docs/REPORT.md) |
| GitHub Pages HTML | [`../../docs/index.html`](../../docs/index.html) |
| Origin server | [`../../origin-server/`](../../origin-server/) |
| Worker application | [`../../worker/`](../../worker/) |
| Worker asset | [`../../worker/assets/us.svg`](../../worker/assets/us.svg) |

## Live endpoints

| URL | Purpose |
| --- | --- |
| `https://tunnel.mareoxlan.com/` | Public origin echo service |
| `https://tunnel.mareoxlan.com/secure` | Authenticated Worker page |
| `https://tunnel.mareoxlan.com/secure/us` | Private R2 flag asset served through the Worker |

## Completion criteria

- Public hostname resolves through Cloudflare.
- Origin stays private behind Cloudflare Tunnel.
- Worker is deployed on `/secure` and `/secure/*`.
- R2 bucket is private and only exposed through the Worker binding.
- Application report includes setup steps, evidence, use cases, knowledge gaps, and customer experience.

## Status

Implemented. Current deliverables live under `docs/`, `origin-server/`, and `worker/`.

