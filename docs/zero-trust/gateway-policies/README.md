# Gateway policy ordering

**Read before editing.** Cloudflare Gateway evaluates policies top-down,
**first-match-wins**. Once a request matches a rule, lower-precedence
rules don't run.

## Why this matters here

The assignment requires:
- Block all Entertainment sites
- **Except** Netflix and YouTube

If you implement this as `block Entertainment` only, Netflix and YouTube
are blocked too because they fall under the Entertainment category.

The fix is to place an **Allow** rule for Netflix/YouTube domains at a
**lower precedence number** (= higher in the UI list = evaluated first)
than the Block rule:

```
precedence 200 → Allow domain in {netflix.com, youtube.com, ...}
precedence 210 → Block content category Entertainment
```

A request to `netflix.com` matches the allow rule and exits. A request
to `disneyplus.com` falls through the allow, hits the block, exits with
deny.

## Reference

- https://developers.cloudflare.com/cloudflare-one/policies/gateway/order-of-enforcement/
- https://developers.cloudflare.com/cloudflare-one/policies/gateway/http-policies/
