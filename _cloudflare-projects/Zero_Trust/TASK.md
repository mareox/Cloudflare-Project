# Zero_Trust

## Goal

Separate the identity and access-control work into its own project track so the Zero Trust implementation is visible outside the Application Services report.

## Repo artifacts

| Artifact | Path |
| --- | --- |
| Zero Trust evidence in Application report | [`../../docs/REPORT.md`](../../docs/REPORT.md) |
| Access-protected Worker | [`../../worker/src/index.ts`](../../worker/src/index.ts) |
| Docs screenshots | [`../../docs/screenshots/`](../../docs/screenshots/) |

## Implemented controls

| Control | Current implementation |
| --- | --- |
| Identity provider | Google IdP configured in Cloudflare Access |
| Protected application | `tunnel.mareoxlan.com/secure*` |
| Allowed users | `mareox@gmail.com` and `@cloudflare.com` reviewer identities |
| Default behavior | Unauthenticated users are redirected to Access and denied unless allowed by policy |
| Identity propagation | Worker reads `Cf-Access-Authenticated-User-Email` after Access enforcement |

## Completion criteria

- Access policy protects `/secure*` before traffic reaches the Worker.
- Reviewer access path is documented.
- Unauthenticated requests redirect to Cloudflare Access.
- Worker displays authenticated identity context.

## Status

Implemented as part of the live Application Services deployment. This task file splits it into an explicit Zero Trust project track.

