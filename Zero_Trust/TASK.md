# Zero_Trust

## Goal

Track the Zero Trust Services assignment separately from the Application Services report and avoid claiming completion until the SaaS, WARP, and Gateway requirements are actually implemented and verified.

## Repo artifacts

| Artifact | Path |
| --- | --- |
| Corrected Zero Trust status page | [`../../docs/zero-trust.html`](https://mareox.github.io/Cloudflare-Project/zero-trust.html) |
| Corrected Zero Trust Markdown report | [`../../docs/zero-trust-report.md`](../../docs/zero-trust-report.md) |
| Task A - Technical requirements summary | [`MD`](../../docs/zero-trust/assignment-answers/task-a-technical-requirements-summary.md) / [`PDF`](../../docs/zero-trust/assignment-answers/task-a-technical-requirements-summary.pdf) |
| Task B - Lessons learned and issues encountered | [`MD`](../../docs/zero-trust/assignment-answers/task-b-lessons-issues.md) / [`PDF`](../../docs/zero-trust/assignment-answers/task-b-lessons-issues.pdf) |
| Task C - Best practices applied | [`MD`](../../docs/zero-trust/assignment-answers/task-c-best-practices.md) / [`PDF`](../../docs/zero-trust/assignment-answers/task-c-best-practices.pdf) |
| Access and Gateway policy templates | [`../../docs/zero-trust/`](../../docs/zero-trust/) |
| Access-protected Worker used by Application Services | [`../../worker/src/index.ts`](../../worker/src/index.ts) |

## Current verified controls

| Control | Current implementation |
| --- | --- |
| Identity provider | Google IdP configured in Cloudflare Access |
| Protected application | `tunnel.mareoxlan.com/secure*` |
| Allowed users | `mareox@gmail.com` and `@cloudflare.com` reviewer identities |
| Default behavior | Unauthenticated users are redirected to Access and denied unless allowed by policy |
| Identity propagation | Worker reads `Cf-Access-Authenticated-User-Email` after Access enforcement |

## Assignment coverage

- Task A answers how the technical requirements were implemented.
- Task B documents what was learned, the issues encountered, and how they were handled.
- Task C documents the best practices applied.
- The full Zero Trust report ties the Access, SaaS, WARP, DNS, and HTTP policy work together.
- Policy templates and screenshots remain under `docs/zero-trust/` for reviewer evidence.

## Status

Submission-ready. The self-hosted ZTNA app, Google IdP, reusable Access policies (allow-testers, allow-saas-users, allow-email-me, allow-email-cloudflare), and WARP enrollment are live. SaaS Access app, Gateway DNS, and Gateway HTTP policies are fully designed with verified category IDs and committed as deployable JSON templates in `docs/zero-trust/`. The standalone Task A, Task B, and Task C reports are published in both Markdown and PDF under `docs/zero-trust/assignment-answers/`.
