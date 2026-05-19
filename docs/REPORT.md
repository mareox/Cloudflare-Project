# Cloudflare Application Services Report

## 1. Working Application

The application is deployed on `mareoxlan.com` and uses Cloudflare DNS, Tunnel, Access, Workers, and R2.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| <https://tunnel.mareoxlan.com/> | Public | Origin echo server that returns request headers as JSON. |
| <https://tunnel.mareoxlan.com/secure> | Cloudflare Access | Authenticated Worker page showing email, timestamp, and country code. |
| <https://tunnel.mareoxlan.com/secure/us> | Cloudflare Access | US flag served from private R2 through the Worker. |

Reviewer access:

- Login with an allowed identity through Cloudflare Access.
- `mareox@gmail.com` is allowed.
- Email addresses ending in `@cloudflare.com` are allowed.
- Users outside the Access policy are denied before reaching the Worker.

## 2. Implementation Steps and Evidence

### 2.1 Zone and DNS

The domain `mareoxlan.com` is active in Cloudflare. A proxied CNAME was created for:

```text
tunnel.mareoxlan.com -> <cloudflare-tunnel-id>.cfargotunnel.com
```

Evidence:

![Cloudflare zone overview](screenshots/01_zone_overview.png)

![DNS records for the application hostname](screenshots/02_dns_records.png)

### 2.2 Origin Server

A small Flask origin server was deployed on the homelab Docker host Atlas. It returns the request method, path, query, remote address, timestamp, and all request headers as JSON.

The origin runs at:

```text
http://<private-origin-ip>:18088
```

Local health check:

```bash
curl http://127.0.0.1:18088/healthz
```

Result:

```text
ok
```

Public verification:

```bash
curl https://tunnel.mareoxlan.com/
```

Result: JSON response containing Cloudflare headers such as `Cf-Ray`, `Cf-Ipcountry`, `Cf-Connecting-Ip`, and `X-Forwarded-Proto`.

### 2.3 Full Strict TLS

The zone SSL mode was set to Full Strict. This validates the connection between Cloudflare and the origin when using a direct proxied origin pattern.

Evidence:

![Full Strict SSL mode](screenshots/04_ssl_mode.png)

### 2.4 Cloudflare Tunnel

An existing Cloudflare Tunnel was reused. A public hostname was added:

```yaml
hostname: tunnel.mareoxlan.com
service: http://<private-origin-ip>:18088
```

This keeps the origin off the public internet. The origin only needs outbound connectivity to Cloudflare through `cloudflared`.

Evidence:

![Cloudflare Tunnel connector status](screenshots/06_tunnel_connectors.png)

![Cloudflare Tunnel public hostname route](screenshots/06b_tunnel_routes.png)

### 2.5 Identity Provider and Access Policy

Google was used as the identity provider. A Cloudflare Access self-hosted application protects:

```text
tunnel.mareoxlan.com/secure*
```

Allow policy:

- Include `mareox@gmail.com`
- Include emails ending in `@cloudflare.com`

Default behavior: block.

Evidence:

![Google identity provider configuration](screenshots/08_idps.png)

Unauthenticated test:

```bash
curl -I https://tunnel.mareoxlan.com/secure
```

Result: HTTP 302 redirect to Cloudflare Access login.

### 2.6 Worker and R2

The Worker `cf-application-secure` was deployed with these routes:

```text
tunnel.mareoxlan.com/secure
tunnel.mareoxlan.com/secure/*
```

The Worker validates the Cloudflare Access JWT from:

```text
Cf-Access-Jwt-Assertion
```

Validation checks the RS256 signature against the team JWKS endpoint, the
issuer (`https://mareoxlan.cloudflareaccess.com`), the Access application
audience, and token timing claims. After validation, the Worker uses the
verified identity email from the JWT payload, with
`Cf-Access-Authenticated-User-Email` available only as a fallback for display.

The Worker reads the country from:

```text
request.cf.country
```

R2 bucket:

```text
country-flags
```

The bucket is private. The public read path is the Worker binding only.

Deployment commands:

```bash
cd worker
npx wrangler r2 bucket create country-flags
npx wrangler r2 object put country-flags/us.svg --file ./assets/us.svg --remote
npx wrangler deploy
```

Browser verification:

- `https://tunnel.mareoxlan.com/secure` showed the authenticated identity page.
- `https://tunnel.mareoxlan.com/secure/us` displayed the US flag.

R2 verification:

```bash
npx wrangler r2 object get country-flags/us.svg --remote --pipe
```

Result: SVG bytes returned from the private bucket.

## 3. Relevant Product Use Cases

| Product | Use case |
| --- | --- |
| Cloudflare DNS | Owns public routing for `mareoxlan.com` and points the app hostname to the Tunnel. |
| Cloudflare Tunnel | Publishes a private homelab service without inbound firewall rules or public origin exposure. |
| Cloudflare Access | Adds identity-aware protection in front of `/secure*` before traffic reaches the Worker or origin. |
| Workers | Runs application logic at the edge on the same hostname as the origin. |
| R2 | Stores static assets privately and exposes them only through a Worker binding. |
| Full Strict TLS | Validates the origin certificate chain when using Cloudflare as a reverse proxy. |

## 4. Knowledge Gaps Filled During the Process

The main gaps were around how the Cloudflare products interact when combined on the same hostname.

| Gap | How it was resolved |
| --- | --- |
| Whether the Worker must manually verify the Access JWT | Cloudflare Access documentation recommends validating `Cf-Access-Jwt-Assertion` inside the Worker. The Worker now validates the JWT signature, issuer, audience, and timing claims before displaying the identity. |
| How a private R2 bucket is read by a Worker | Wrangler configuration and testing confirmed that the R2 binding is the authorization path. No public bucket URL, access key, or signed URL is required in Worker code. |
| How to route only `/secure` to the Worker while leaving `/` on the origin | Worker route patterns were configured for `tunnel.mareoxlan.com/secure` and `tunnel.mareoxlan.com/secure/*`, while all other paths continue through the Tunnel origin. |
| How to avoid origin bypass | The Tunnel design removes inbound public access to the origin. The only external path is Cloudflare edge to Tunnel to origin. |

## 5. Target Customer Experience

A target customer would find the security outcome immediately compelling: an internal service becomes reachable from the internet without exposing the origin IP, without opening inbound firewall rules, and without a VPN. The combination of Cloudflare Tunnel and Access delivers this in a way that would previously have required a dedicated reverse proxy, a VPN gateway, and a separate identity provider, each with its own maintenance burden.

The setup friction is real but bounded. DNS proxy configuration, Tunnel ingress routing, Access application path matching, Worker route patterns, and R2 bucket bindings all have to align precisely. A misconfigured route pattern (e.g., `tunnel.mareoxlan.com/secure` without a trailing `/*`) causes the Worker to handle `/secure` but pass `/secure/us` to the origin, which produces confusing behavior. These are one-time configuration steps, and the error messages in Wrangler and the Cloudflare dashboard are descriptive enough to resolve them quickly. A customer coming in with no prior Cloudflare experience would benefit from a clear onboarding sequence that establishes DNS → Tunnel → Access → Workers → R2 in that order, since each layer depends on the previous one.

The long-term value is high for internal tooling, partner portals, admin applications, lightweight SaaS products, and customer support tools. The stack handles identity, edge compute, private origin exposure, and static asset serving in a single coherent platform. Adding a second protected application or a new Worker route is incrementally simpler than the initial setup, so the marginal cost of each new service drops quickly after the first deployment.

One experience gap worth noting for enterprise customers: the mental model of "which product owns this part of the request" is not immediately obvious. Access, Tunnel, Workers, and DNS are distinct products that happen to compose on the same hostname. A customer who thinks of Cloudflare primarily as a CDN or DDoS mitigation layer may not immediately understand that Access enforces identity at the Cloudflare edge before the Worker receives the request, or that the Worker can override the origin response without the origin being aware. Clearer product-layer documentation in the onboarding flow would reduce support tickets for this specific confusion.

## 6. Best Practices Applied

| Practice | Implementation detail |
| --- | --- |
| Full Strict TLS | Zone SSL mode set to Full Strict. Cloudflare validates the origin certificate chain rather than trusting any certificate or skipping validation. Prevents man-in-the-middle between Cloudflare and origin. |
| No inbound firewall holes | Origin runs behind Cloudflare Tunnel. The `cloudflared` daemon makes outbound-only connections to Cloudflare edge. There is no public IP or open inbound port on the origin host. |
| Default deny on Access | The Access application uses block as the default action. Only explicitly listed identities (email or domain) receive a JWT and reach the Worker. |
| Private R2 bucket | The `country-flags` bucket has no public access enabled. The Worker R2 binding is the only read path. No signed URLs, no access keys in Worker code, no public bucket endpoint. |
| Security response headers | The Worker sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a restrictive `Content-Security-Policy` on all HTML responses. |
| HTML output escaping | All user-controlled values (email, country code, timestamp) are escaped through `escapeHtml()` before insertion into the HTML response body, preventing reflected XSS. |
| Cache control | The `/secure` HTML response sets `Cache-Control: no-store`. The flag asset sets `Cache-Control: public, max-age=3600, immutable`, appropriate for a static asset that changes only when re-uploaded. |
| Separate Worker routes | The Worker handles only `/secure` and `/secure/*`. All other paths on `tunnel.mareoxlan.com` pass through to the origin server via the Tunnel, keeping the Worker scope minimal. |
