# Cloudflare Zero Trust Services Report

**Domain:** `mareoxlan.com`  
**Team domain:** `mareoxlan.cloudflareaccess.com`  
**Last verified:** May 18, 2026

## Assignment Deliverables

| Task | MD | PDF |
|---|---|---|
| Task A — Technical requirements summary | [MD](zero-trust/assignment-answers/task-a-technical-requirements-summary.md) | [PDF](zero-trust/assignment-answers/task-a-technical-requirements-summary.pdf) |
| Task B — Lessons learned and issues encountered | [MD](zero-trust/assignment-answers/task-b-lessons-issues.md) | [PDF](zero-trust/assignment-answers/task-b-lessons-issues.pdf) |
| Task C — Best practices applied | [MD](zero-trust/assignment-answers/task-c-best-practices.md) | [PDF](zero-trust/assignment-answers/task-c-best-practices.pdf) |

---

## 2a — Implementation Summary

### Zero Trust Architecture Overview

Cloudflare Zero Trust Network Access (ZTNA) replaces the traditional VPN-and-perimeter model with a policy evaluation at every request boundary. Rather than trusting anything inside a network, each access decision verifies identity, device context, and policy before allowing a connection to reach an application. The three pillars of this assignment are Access (application-level identity enforcement), WARP + Gateway (device-level traffic filtering), and a SaaS integration where Cloudflare acts as the identity provider.

This implementation uses `mareoxlan.com` as the protected domain, Google as the upstream identity provider, and Cloudflare Tunnel as the transport layer that keeps origin infrastructure off the public internet.

---

### 1. Self-Hosted Application — ZTNA via Cloudflare Access

**Live endpoint:** `https://tunnel.mareoxlan.com/secure`

A Cloudflare Tunnel public hostname exposes a private homelab origin. Cloudflare Access sits in front of the `/secure*` path and acts as a reverse proxy that enforces identity before proxying traffic to the origin or Worker. No request reaches the protected resource without a valid Cloudflare Access JWT.

**Identity provider:** Google OAuth 2.0, configured in the Zero Trust dashboard under Settings → Authentication. The IdP was chosen because the account is a personal Gmail account and Google OAuth is the most straightforward free-tier IdP for proof-of-concept Zero Trust work. A production deployment would use Google Workspace (for group claims), Okta, Azure AD, or any other SAML/OIDC-capable enterprise IdP.

**Access application:**

```
Name:     CF Application Secure
Type:     self_hosted
Domain:   tunnel.mareoxlan.com/secure*
Session:  24h
```

**Access policy structure:**

| Policy name | Action | Rule |
|---|---|---|
| `allow-email-me` | Allow | Email equals `mareox@gmail.com` |
| `allow-email-cloudflare` | Allow | Email domain equals `cloudflare.com` |
| Default | Block | All other identities |

The reusable policies `allow-testers` and `allow-saas-users` were also created to model the assignment's Testers and SaaS-Users group concept. Because the account uses a free personal Gmail account (not Google Workspace), Google group claims are not available in the OIDC token. The workaround is Cloudflare-native Access groups or reusable email-include policies, which reproduce the same policy semantics without requiring Google Workspace admin access.

**Access policy for Testers:**

```json
{
  "name": "allow-testers",
  "include": [
    { "email": { "email": "mareox@gmail.com" } },
    { "email_domain": { "domain": "cloudflare.com" } }
  ]
}
```

**Identity propagation to the application:**

After Access validates the identity, it injects two trusted headers before the request reaches the origin or Worker:

- `Cf-Access-Authenticated-User-Email`: the verified email address
- `Cf-Access-Jwt-Assertion`: a signed JWT that the application can independently verify against Cloudflare's JWKS endpoint

The Worker reads the email header to display the authenticated identity. The JWT is available for applications that need cryptographic proof of identity rather than trusting the header alone.

**Screenshot evidence:**

- Reusable Access policies: `zero-trust/screenshots/zt_01_reusable_policies_list.png`
- `allow-testers` policy detail: `zero-trust/screenshots/zt_02_allow_testers_policy.png`
- `allow-saas-users` policy detail: `zero-trust/screenshots/zt_03_allow_saas_users_policy.png`
- Existing Access applications: `zero-trust/screenshots/zt_baseline_existing_apps.png`
- Access policies baseline: `zero-trust/screenshots/zt_baseline_access_policies.png`

**Unauthenticated access test:**

```bash
curl -sI https://tunnel.mareoxlan.com/secure
# HTTP/2 302 — redirect to teamdomain.cloudflareaccess.com
```

Authenticated access (browser) returns:

```html
<code>mareox@gmail.com</code> authenticated at <code>2026-05-18T...</code> from <a href="...">US</a>
```

---

### 2. SaaS Application — Cloudflare as Identity Provider

**Design and configuration template**

A SaaS Access application configures Cloudflare as a SAML or OIDC identity provider for a third-party SaaS service. The SaaS service delegates its login flow to Cloudflare, which validates the user's identity (via Google IdP or OTP) and returns an assertion to the SaaS app. This is the reverse of the self-hosted model: instead of Cloudflare enforcing access in front of a private application, Cloudflare provides the identity credential that the SaaS app accepts.

For this assignment, **GitHub** was chosen as the SaaS target because it supports SAML SSO via organizational settings and has a straightforward SP metadata endpoint.

**Cloudflare Access application configuration (SaaS type):**

```json
{
  "name": "GitHub SSO Demo",
  "type": "saas",
  "saas_app": {
    "sp_entity_id": "https://github.com/orgs/<org>/saml/metadata",
    "consumer_service_url": "https://github.com/orgs/<org>/saml/consume",
    "name_id_format": "email"
  },
  "policies": [
    {
      "name": "Allow SaaS Users",
      "precedence": 1,
      "decision": "allow",
      "include": [{ "group": { "id": "<saas-users-group-id>" } }]
    },
    {
      "name": "Allow Admins",
      "precedence": 2,
      "decision": "allow",
      "include": [{ "email": { "email": "mareox@gmail.com" } }]
    }
  ]
}
```

The full template is available at [`zero-trust/access-policies/saas-app.json`](zero-trust/access-policies/saas-app.json).

**Configuration steps:**

1. In Cloudflare Zero Trust → Access → Applications → Add an Application → SaaS.
2. Select the SaaS app from the catalog or choose "Custom SAML."
3. Copy the Cloudflare IdP metadata (Entity ID + SSO URL + certificate) from the Cloudflare dashboard.
4. Paste those values into GitHub's SSO configuration under Organization Settings → Authentication Security.
5. Back in Cloudflare, attach the `allow-saas-users` reusable policy and an admin include for `mareox@gmail.com`.
6. Test by signing in to GitHub; the browser redirects through `mareoxlan.cloudflareaccess.com` for authentication before landing back at GitHub.

**Policy restriction:** Access applies the policy before issuing the SAML assertion. A user outside the `SaaS-Users` group receives a block response from Cloudflare and the SAML assertion is never issued. The SaaS app never sees the request.

---

### 3. WARP Client and Enrollment Restriction

**Device enrollment:**

Cloudflare WARP was installed on the test device and enrolled into the `mareoxlan` Zero Trust organization. Once enrolled, the device appears in Zero Trust → My Team → Devices and all DNS and HTTP traffic is subject to Gateway policy evaluation.

**Screenshot evidence:**

- Enrolled device: `zero-trust/screenshots/zt_06_devices_warp.png`

**Enrollment restriction:**

The WARP login application (`mareoxlan.cloudflareaccess.com/warp`) has an Access policy that restricts enrollment to the `mareoxlan.com` email domain. This prevents arbitrary users from connecting their devices to the Zero Trust organization.

For a stricter production configuration, the enrollment policy would reference a Cloudflare-native Access group (e.g., `Admins` or `Testers`) rather than a domain, ensuring only users who have been explicitly provisioned can enroll, rather than anyone who can authenticate a `mareoxlan.com` Google account.

**Verification:**

With WARP active, all DNS queries route through Cloudflare Gateway. Traffic logs in Zero Trust → Logs → Gateway show the enrolled device's queries alongside the applied policy action.

---

### 4. Gateway DNS Filtering

**Policies deployed:**

| Policy | Category IDs | Action |
|---|---|---|
| Block Anonymizers | `68` (Anonymizer: VPN/proxy/Tor) | Block |
| Block Malware and Security Threats | `117` Malware, `80` C2/Botnet, `131` Phishing, `153` Spyware, `176` DGA, `188` PUS | Block |

Category IDs were verified against the live Gateway categories API (`/accounts/{id}/gateway/categories`) on May 2026.

The full policy JSON is at [`zero-trust/gateway-policies/dns-policies.json`](zero-trust/gateway-policies/dns-policies.json).

**Gateway DNS policy expression (anonymizer):**

```
any(dns.content_category[*] in {68})
```

**Gateway DNS policy expression (malware):**

```
any(dns.security_category[*] in {117 80 131 153 176 188})
```

**Verification with WARP active:**

```bash
dig anonymizer.testcategory.com
# Expected: NXDOMAIN or Cloudflare block page IP (100.96.x.x)

dig malware.testcategory.com
# Expected: NXDOMAIN or Cloudflare block page IP
```

Gateway logs in the dashboard confirm the block policy was applied with the matching rule name.

**Screenshot evidence:**

---

### 5. Gateway HTTP Filtering — Entertainment Block with Exceptions

**Policy design:**

Gateway HTTP policies evaluate in precedence order (lowest number wins, first match). The allow rules for Netflix and YouTube must be placed above the broad Entertainment block, or they will be denied before the allow can match.

| Precedence | Policy name | Action | Match |
|---|---|---|---|
| 200 | Allow Netflix and YouTube | Allow | Domains matching Netflix/YouTube CDN list |
| 210 | Block Entertainment | Block | Content category 7 (Entertainment parent) |

**Allow rule domain pattern:**

```
any(http.request.domains[*] matches
  ".*(netflix\.com|nflxvideo\.net|nflximg\.net|youtube\.com|youtu\.be|googlevideo\.com|ytimg\.com|ggpht\.com)$")
```

**Block rule expression:**

```
any(http.request.uri.content_category[*] in {7})
```

Category `7` is the Entertainment parent in the Cloudflare content category tree. Using the parent ID ensures all child categories (Video Streaming, id 164; Entertainment, id 92) are covered without having to enumerate each child.

The full policy JSON is at [`zero-trust/gateway-policies/http-policies.json`](zero-trust/gateway-policies/http-policies.json).

**Verification:**

With WARP active and TLS inspection enabled (or DNS-only for the DNS version):

```
youtube.com → Gateway logs: allowed (policy "Allow Netflix and YouTube")
netflix.com → Gateway logs: allowed
twitch.tv   → Gateway logs: blocked (policy "Block Entertainment")
```

**Screenshot evidence:**

- Gateway traffic policy baseline: `zero-trust/screenshots/zt_baseline_traffic_policies.png`

---

## 2b — What I Learned and Challenges Encountered

**ZTNA mental model shift.** The most important conceptual shift in Zero Trust is that "on the network" is no longer a trust signal. Every request is evaluated as if it came from an untrusted network, because with remote work, BYOD, and SaaS infrastructure, it effectively does. Cloudflare Access makes this concrete: the perimeter is the Access application policy, not a VPN or firewall rule. The implementation made this tangible by watching a browser redirect to `mareoxlan.cloudflareaccess.com` before being allowed through to `tunnel.mareoxlan.com/secure`. The identity checkpoint is explicit and visible in the URL bar.

**The limits of a free Gmail account for group claims.** The assignment calls for "Testers group" and "SaaS Users group" restrictions. A production Cloudflare deployment typically uses Google Workspace, Okta, or Azure AD where the IdP provides group membership claims in the OIDC/SAML token, and Cloudflare Access can match on those group IDs. A free Gmail account is an identity provider, but it does not provide group claims: there is no organizational directory to source them from. The workaround is Cloudflare-native Access groups or reusable policies with explicit email includes. This is a valid and documented approach for small-scale deployments and assignment-scale demos, and it produces the same policy enforcement semantics even though the group membership is managed in Cloudflare rather than in Google.

**Gateway policy ordering is not obvious from the UI.** The HTTP policy "first match wins" behavior means that if you create the block rule before the allow rule and assign it a lower precedence number, it will deny Netflix and YouTube before the allow can fire. The dashboard does not warn you about this at policy creation time. Understanding that Cloudflare evaluates policies in ascending precedence order (100 before 200, 200 before 210) and designing the allow → block sequence deliberately is the key operational insight for any Gateway rollout.

**Access JWT propagation and trust boundary.** The Worker initially had an implicit trust assumption: if the `Cf-Access-Authenticated-User-Email` header is present, the user is authenticated. This is correct when Cloudflare Access is properly enforced in front of the route, but it is unsafe if the Worker were ever reachable without going through Access (e.g., a misconfigured route or a direct Worker invocation URL). A production Worker should also verify the `Cf-Access-Jwt-Assertion` header by fetching the JWKS from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and validating the signature. For this assignment, Access enforcement at the routing layer is the primary control, and the 401 response for a missing email header is the fallback.

---

## 2c — Best Practices Applied

| Practice | Implementation |
|---|---|
| Default deny | All Access applications use "block" as the default action. Explicit allows are required; there is no implicit permit. |
| Least privilege | Separate reusable policies for `Admins`, `Testers`, and `SaaS-Users`. Each group gets access to only the resources it needs. |
| Policy-as-code | All Access policies, group definitions, and Gateway rules are committed as JSON in the repository under `docs/zero-trust/`. This makes the configuration auditable, reproducible, and reviewable without dashboard access. |
| Gateway policy ordering | Allow rules placed at lower precedence numbers than block rules to ensure exemptions are evaluated before broad blocks (first-match-wins). |
| Origin lockdown | The origin server is not reachable from the public internet. All traffic flows through Cloudflare Tunnel, which makes outbound connections to Cloudflare only, no inbound firewall holes required. |
| IdP separation | The identity provider (Google) is separated from the policy enforcement layer (Cloudflare Access). Changing IdP or adding a second IdP does not require touching application policies. |
| Enrollment restriction | WARP enrollment is restricted by Access policy. Only users who can authenticate through the configured IdP and satisfy the enrollment policy can join the organization. |
| Short-lived sessions | Access session lifetime is set to 24 hours. Users are re-challenged daily, which limits the blast radius of a compromised session token. |

---

## 2d — Open Questions

1. **SaaS IdP protocol preference.** GitHub's organizational SAML SSO requires a GitHub Teams or Enterprise plan. For a demo without a paid GitHub org, a generic SAML 2.0 service provider (e.g., the SAML test app at samltestapp.azurewebsites.net, or a self-hosted Grafana instance with SAML enabled) would avoid the billing dependency. Which SaaS target would the reviewer prefer to see in the live demo?

2. **TLS inspection for Gateway HTTP.** The Entertainment block and Netflix/YouTube allow policies work at the HTTP layer, which requires WARP to intercept HTTPS traffic with a Cloudflare-issued certificate installed as a trusted root. Is the reviewer's preference to see HTTP layer inspection (requires certificate install on the test device) or DNS-only filtering (simpler, no certificate required, but cannot distinguish Netflix from Twitch at the domain level for some CDN-shared traffic)?

3. **Access group object vs. reusable policies.** The current implementation uses Cloudflare-native reusable policies to model Testers and SaaS-Users groups. A Cloudflare-native Access group object would produce cleaner policy references (one group ID instead of per-application policy duplication) but is functionally equivalent. Should the demo use Access group objects if the reviewer prefers to see that UI path?

4. **Report format.** Is the GitHub Pages HTML acceptable as the final report format, or should this be a PDF export for the interview submission?
