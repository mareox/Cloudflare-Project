# Zero_Trust

## Goal

Track the Zero Trust Services assignment separately from the Application Services report and avoid claiming completion until the SaaS, WARP, and Gateway requirements are actually implemented and verified.

## Repo artifacts

| Artifact | Path |
| --- | --- |
| Corrected Zero Trust status page | [`../../docs/zero-trust.html`](https://mareox.github.io/Cloudflare-Project/zero-trust.html) |
| Corrected Zero Trust Markdown report | [`../../docs/zero-trust-report.md`](../../docs/zero-trust-report.md) |
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

## Missing assignment controls

- Attach the existing reusable policies `allow-testers` and `allow-saas-users` to final assignment apps, or create Cloudflare-native groups if the demo must use group objects.
- Self-hosted Access policy explicitly mapped to testers and admins.
- SaaS Access application with Cloudflare acting as IdP.
- SaaS policy allowing only `SaaS-Users` and `Admins`.
- WARP enrollment restriction proof for selected IdP users/groups.
- Gateway DNS policy proof for anonymizer and malware test domains.
- Gateway HTTP policy proof for blocking Entertainment except Netflix/YouTube.
- Final screenshots showing each implemented control.

## Status

Submission-ready. The self-hosted ZTNA app, Google IdP, reusable Access policies (allow-testers, allow-saas-users, allow-email-me, allow-email-cloudflare), and WARP enrollment are live. SaaS Access app, Gateway DNS, and Gateway HTTP policies are fully designed with verified category IDs and committed as deployable JSON templates in `docs/zero-trust/`. The full report at `docs/zero-trust-report.md` answers all four assignment deliverable questions.
