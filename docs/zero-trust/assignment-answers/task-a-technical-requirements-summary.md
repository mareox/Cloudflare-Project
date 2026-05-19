# Task A - Technical Requirements Summary

## Summary

I implemented the Zero Trust assignment by using Cloudflare Access for application-level access control, Cloudflare Gateway for DNS and HTTP filtering, and WARP enrollment controls for device onboarding. The implementation uses the `mareoxlan.com` zone and the existing `mareoxlan.cloudflareaccess.com` Zero Trust team.

The deliverable is documented as both dashboard evidence and reusable policy definitions in the public `Cloudflare-Project` repository:

- Access policy definitions: https://github.com/mareox/Cloudflare-Project/tree/main/docs/zero-trust/access-policies
- Gateway policy definitions: https://github.com/mareox/Cloudflare-Project/tree/main/docs/zero-trust/gateway-policies
- Screenshots: https://github.com/mareox/Cloudflare-Project/tree/main/docs/zero-trust/screenshots
- Full Zero Trust report: https://github.com/mareox/Cloudflare-Project/blob/main/docs/zero-trust-report.md
- Rendered Zero Trust page: https://mareox.github.io/Cloudflare-Project/zero-trust.html

## Self-Hosted Application Access

For the self-hosted application requirement, I used the existing Access-protected application at `https://tunnel.mareoxlan.com/secure`. The application is served through Cloudflare Tunnel and Cloudflare Access, so the origin remains private and requests must pass identity policy enforcement before reaching the protected route.

Cloudflare Access was placed in front of the application with explicit allow policies:

- `allow-email-me` allows `mareox@gmail.com`.
- `allow-email-cloudflare` allows reviewer identities from the `cloudflare.com` email domain.
- `allow-testers` models the assignment's Testers access policy.
- Everyone else is denied by default.

The reusable policy model is captured in:

- https://github.com/mareox/Cloudflare-Project/blob/main/docs/zero-trust/access-policies/groups.json
- https://github.com/mareox/Cloudflare-Project/blob/main/docs/zero-trust/access-policies/self-hosted-app.json

The group implementation uses Cloudflare-native Access groups and reusable policy templates because the available Google identity provider is a personal Gmail account. Personal Gmail does not expose Workspace group claims to Cloudflare Access.

## SaaS Application Access

For the SaaS application requirement, I modeled Cloudflare Access as the identity provider in front of a SaaS application using SAML. The SaaS app trusts Cloudflare, while Cloudflare applies the Zero Trust policy decision before issuing the SAML assertion.

The SaaS access model uses:

- `SaaS-Users` for normal SaaS users.
- `Admins` for owner or administrative access.
- Default deny for users outside those groups.

The reusable SaaS policy definition is captured at:

- https://github.com/mareox/Cloudflare-Project/blob/main/docs/zero-trust/access-policies/saas-app.json

This design keeps the same access-control pattern across both self-hosted and SaaS applications.

## WARP Enrollment Control

For device enrollment, I configured the design around an explicit WARP enrollment allow policy. Only approved identity-provider users are allowed to enroll devices into the Cloudflare Zero Trust team. Anyone outside the approved identity set is denied by default.

The WARP screenshot evidence is available at:

- https://github.com/mareox/Cloudflare-Project/blob/main/docs/zero-trust/screenshots/zt_06_devices_warp.png

## Gateway DNS Filtering

For DNS security filtering, I created Gateway DNS policy definitions that block:

- Anonymizer and proxy categories.
- Malware and related security categories, including command-and-control, phishing, spyware, DGA domains, and potentially unwanted software.

The DNS policies are captured at:

- https://github.com/mareox/Cloudflare-Project/blob/main/docs/zero-trust/gateway-policies/dns-policies.json

## Gateway HTTP Filtering

For HTTP filtering, I implemented the entertainment-block requirement as two ordered Gateway HTTP policies:

1. Allow Netflix and YouTube domains.
2. Block the broader Entertainment content category.

This order is required because Cloudflare Gateway evaluates matching policies by precedence. The specific allow rule must run before the broader block rule, otherwise Netflix and YouTube are blocked with the rest of the Entertainment category.

The HTTP policies and ordering note are captured at:

- https://github.com/mareox/Cloudflare-Project/blob/main/docs/zero-trust/gateway-policies/http-policies.json
- https://github.com/mareox/Cloudflare-Project/blob/main/docs/zero-trust/gateway-policies/README.md

## Result

The implementation satisfies the assignment by demonstrating identity-aware application access, SaaS access brokering, device enrollment control, DNS threat filtering, and ordered HTTP category filtering. The repo includes both human-readable documentation and reusable policy-as-code artifacts so the work can be reviewed, repeated, or adapted later.
