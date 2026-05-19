# Network Services Assignment — Magic Transit Onboarding for Acme Corp

**Author:** Acme Corp CTO (assignment response)
**Scenario:** Onboarding `203.0.113.0/24` (Acme ASN `12345`) to Cloudflare Magic Transit with two anycast GRE tunnels and DSR egress.

---

## Section A — Magic Transit Onboarding

### A.1 What information must Acme supply to Cloudflare to advertise the /24?

Cloudflare will originate the BGP announcement for `203.0.113.0/24` from its edge routers, so every tier-1 transit provider it peers with must be convinced Cloudflare is permitted to do so. Four artifacts are required.

**Letter of Agency (LOA).** A signed PDF on company letterhead explicitly authorizing Cloudflare to announce `203.0.113.0/24`, naming `AS12345` as the originating ASN and Cloudflare as the authorized party. Cloudflare presents LOAs to upstream transit providers on request. (Source: developers.cloudflare.com/byoip/concepts/loa/)

**RPKI Route Origin Authorization (ROA).** Published through Acme's RIR (ARIN, RIPE, APNIC, etc.), pairing `203.0.113.0/24` with `origin: AS12345`. If Cloudflare's ASN were used instead, the ROA would reference `AS13335`. Mismatched ROAs are the most common cause of partial reachability after cutover: RPKI-validating networks like AT&T and Telia mark the route `invalid` and drop it silently. (Source: developers.cloudflare.com/magic-transit/how-to/advertise-prefixes/)

**IRR route objects.** A `route:` object in RADb, ARIN-IRR, RIPE-NONAUTH, or whichever registry upstreams build prefix-lists from, pointing `203.0.113.0/24` at `origin: AS12345`. NTT, Cogent, and others rebuild filters nightly from IRR; missing or stale entries cause a 24-48 hour propagation delay.

**Supporting documentation.** Proof of ASN ownership (RIR portal record), a monitored abuse contact (`abuse@acme.example`), and WHOIS `inetnum`/`NetRange` records listing Acme as registrant. Cloudflare runs these as pre-flight checks (LOA, IRR, ROA, MSS, tunnel health) before unlocking the prefix for advertisement. (Source: developers.cloudflare.com/learning-paths/data-center-protection/run-pre-flight-checks/)

### A.2 External entities that need to be informed

**IRR registries.** Review existing `route:` objects. If Acme keeps `AS12345` as origin, existing objects remain valid, but add an `as-set` reference Cloudflare can use in peer prefix-list generation. Any transit ISP currently building filters from Acme-specific IRR objects must be told to stop accepting the prefix from Acme directly once Cloudflare starts announcing it. Overlapping announcements cause asymmetric paths that break TCP.

**RPKI.** Create or update ROA: `prefix=203.0.113.0/24, origin=AS12345, maxLength=24`.

**PeeringDB.** Review `AS12345` peering records. IXP peering relationships will likely be torn down since Cloudflare is now the path of record.

**Geo-IP databases.** Submit corrections to MaxMind GeoIP2, IP2Location, DB-IP, and Digital Element so the prefix stays geolocated to Acme's region rather than a Cloudflare PoP. Without this, latency-based routing by CDNs and ad networks breaks, and geo-fenced content licensing can serve wrong content.

**Existing DDoS scrubbing provider.** If replacing Akamai Prolexic, Radware, Neustar/Vercara, or Imperva, that provider's BGP announcement must be withdrawn cleanly before Cloudflare's goes live.

**Downstream customers and B2B partners.** Notify customers that RTT will change (anycast pulls them closer). Source IPs are preserved through Magic Transit so source-IP allowlists don't need to change, but partners doing route-policy checks should know the path and next hop will change even though the origin remains `AS12345`.

### A.3 GRE encapsulation and packet size

GRE adds **24 bytes** of overhead per packet: 20-byte outer IPv4 header plus 4-byte GRE header (RFC 2784, no key/sequence fields). With a typical Internet path MTU of 1500 bytes between Cloudflare's anycast endpoint and Acme's tunnel terminator at `100.100.100.100`, the inner MTU is `1500 - 24 = 1476` bytes. Packets larger than 1476 bytes with DF set will be dropped with no ICMP response (many networks filter "fragmentation needed"), producing the classic symptom: TCP handshake completes, small requests succeed, large responses stall.

#### A.3.a MSS clamp value

**1,436 bytes.** Calculation:

```
1500  (path MTU)
-  20  (outer IPv4 header)
-   4  (GRE header)
-  20  (inner IPv4 header)
-  20  (TCP header)
= 1436 bytes of TCP payload per segment
```

Cloudflare recommends 1,436 for both DSR and ingress+egress GRE deployments. (Source: developers.cloudflare.com/magic-transit/reference/mtu-mss/)

#### A.3.b Where to apply the clamp and why

The clamp must go on **Acme's edge router transit ports** facing upstream Internet uplinks, and on the GRE tunnel interfaces where Cloudflare-decapsulated traffic is forwarded inward.

In DSR, the TCP MSS exchange is split across two paths. The client's SYN traverses Cloudflare on ingress, so Cloudflare clamps it to 1436. The server's SYN-ACK leaves Acme's data center directly via the default route and never touches Cloudflare. If Acme's edge doesn't clamp the outbound SYN-ACK, the client believes the server accepts 1460-byte segments. When it sends a full-size segment back through the GRE tunnel, it exceeds the inner MTU and gets dropped.

Both sides need the clamp: Cloudflare handles the inbound SYN, Acme's edge handles the outbound SYN-ACK. Missing the egress side produces a characteristic failure: HTTPS handshake completes, small responses work, large responses or file downloads stall around the first ~1.4 KB of payload. (Source: developers.cloudflare.com/magic-transit/reference/mtu-mss/)

### A.4 Can prefixes smaller than /24 be routed across the GRE tunnels?

**Yes across the tunnels. No for public Internet advertisement.**

The /24 minimum applies to what Cloudflare can announce to the global IPv4 Internet. Virtually every tier-1 and tier-2 provider filters prefixes longer than /24 at the EBGP boundary; the Internet-facing announcement must remain `203.0.113.0/24`. (Source: developers.cloudflare.com/magic-transit/how-to/advertise-prefixes/)

Inside the Cloudflare-to-Acme overlay, Cloudflare's internal routing can map sub-prefixes to different GRE tunnels, for example `203.0.113.0/29` over GRE1 and `203.0.113.8/29` over GRE2. This is Magic Transit's prefix mapping feature, useful when Acme has multiple data centers and needs traffic for specific server pools to land at specific sites. (Source: developers.cloudflare.com/magic-transit/reference/traffic-steering/)

### A.5 Asymmetric routing and on-prem firewall migration

DSR puts Cloudflare in the ingress path only. Return traffic leaves Acme's data center through its default Internet route and never touches Cloudflare. This breaks stateful firewall assumptions: Magic Firewall has no visibility into the return path, so it cannot maintain connection state or match "established/related" rules. Every rule must be a unidirectional 5-tuple match on ingress.

**Migrating on-prem rules:**

Write Magic Firewall rules service-by-service: allow `dst=web-vip:443/TCP`, `dst=mail-vip:25/TCP`, etc. Don't constrain client source ports; ephemeral ports span the full OS range (32768-61000 Linux, 49152-65535 Windows).

For services requiring stateful inspection, keep enforcement on-prem behind the GRE tunnel. Acme's existing stateful firewall will see both directions: ingress arrives via GRE decap, egress leaves via the default route, both passing through the same on-prem choke point.

If stateful policy at the Cloudflare layer is required, evaluate Magic WAN instead. Magic WAN puts Cloudflare in both ingress and egress paths and enables stateful flow tracking, at the cost of DSR's egress-bandwidth efficiency.

### A.6 Detailed packet flow diagram

Below is the forward and return path for a TCP/443 request from an end user to a web server at `203.0.113.10` inside Acme's data center.

```
                 ┌────────────────────────────────────────────────────┐
                 │  FORWARD PATH (User → Server, via Cloudflare)      │
                 └────────────────────────────────────────────────────┘

   ┌─────────┐              ┌──────────────────────────┐             ┌────────────────┐
   │  User   │              │  Cloudflare Anycast PoP  │             │   Acme Edge    │
   │  (any   │              │  (closest by BGP/anycast)│             │   Router       │
   │  ISP)   │              │  Origin AS12345 per      │             │ 100.100.100.100│
   │         │              │  203.0.113.0/24          │             │  (GRE term)    │
   └────┬────┘              └────────────┬─────────────┘             └────────┬───────┘
        │                                │                                    │
        │ (1) Plain IP packet            │                                    │
        │   src=USER_PUB_IP              │                                    │
        │   dst=203.0.113.10             │                                    │
        │   proto=TCP, dport=443         │                                    │
        ├────────────────────────────────►                                    │
        │                                │                                    │
        │      (2) DDoS scrubbing + Magic Firewall (stateless ingress)        │
        │           + MSS clamp rewrite (1460 → 1436 in TCP options)          │
        │                                │                                    │
        │                                │ (3) Encapsulate into GRE,          │
        │                                │     chosen tunnel = GRE1 or GRE2   │
        │                                │     (ECMP / static route / health) │
        │                                │                                    │
        │                                │   Outer IP: src=192.0.2.10 (GRE1)  │
        │                                │             dst=100.100.100.100    │
        │                                │             proto=47 (GRE)         │
        │                                │   GRE header (4 B)                 │
        │                                │   Inner IP: src=USER_PUB_IP        │
        │                                │             dst=203.0.113.10       │
        │                                │             TCP dport=443          │
        │                                ├────────────────────────────────────►
        │                                │                                    │
        │                                │            (4) Acme edge router    │
        │                                │                decapsulates GRE,   │
        │                                │                forwards inner      │
        │                                │                packet inward       │
        │                                │                                    ▼
        │                                │                          ┌─────────────────┐
        │                                │                          │  Web server     │
        │                                │                          │  203.0.113.10   │
        │                                │                          │  (sees real     │
        │                                │                          │   USER_PUB_IP)  │
        │                                │                          └─────────────────┘

                 ┌────────────────────────────────────────────────────┐
                 │  RETURN PATH (Server → User, DIRECT — no Cloudflare)│
                 └────────────────────────────────────────────────────┘

   ┌─────────┐         ┌────────────────────────┐              ┌─────────────────┐
   │  User   │         │  Acme Upstream ISP     │              │  Web server     │
   │         │         │  (default-route egress)│              │  203.0.113.10   │
   └────▲────┘         └──────────▲─────────────┘              └────────┬────────┘
        │                         │                                     │
        │                         │                                     │ (5) Plain IP packet
        │                         │                                     │   src=203.0.113.10
        │                         │                                     │   dst=USER_PUB_IP
        │                         │                                     │   TCP sport=443
        │                         │ (6) Acme edge router applies MSS    │   (MSS=1436 in
        │                         │     clamp 1436 on egress (CRITICAL  │    SYN-ACK)
        │                         │     for the TCP three-way handshake)│
        │                         │                                     │
        │ (7) Direct Internet path│                                     │
        │     (no GRE, no CF)     ◄──────────────────────────────────────
        ◄─────────────────────────┘
```

**Header walkthrough, forward direction packet on the wire between Cloudflare and Acme:**

```
  ┌─ Outer IPv4 ─────────────────────────────────────────┐
  │ src = 192.0.2.10  (Cloudflare anycast GRE endpoint)  │
  │ dst = 100.100.100.100 (Acme GRE terminator)          │
  │ proto = 47 (GRE)                                     │
  ├─ GRE (4 B, no key/seq) ──────────────────────────────┤
  │ Protocol Type = 0x0800 (IPv4)                        │
  ├─ Inner IPv4 ─────────────────────────────────────────┤
  │ src = USER_PUBLIC_IP (preserved end-to-end)          │  ← this is the win
  │ dst = 203.0.113.10                                   │
  │ proto = 6 (TCP)                                      │
  ├─ TCP ────────────────────────────────────────────────┤
  │ sport = ephemeral, dport = 443                       │
  │ MSS option = 1436 (clamped by CF on inbound SYN)     │
  └──────────────────────────────────────────────────────┘
```

A few things to note. Cloudflare advertises `203.0.113.0/24` from every PoP simultaneously using `AS12345` as origin, so the user lands at the topologically closest PoP. The GRE outer-source IP is an anycast address reachable from every PoP, so any PoP can encapsulate and forward to `100.100.100.100`. Per the scenario, Cloudflare uses static routes (`203.0.113.0/24 → GRE1` and `→ GRE2`). ECMP load-balances across both tunnels by hashing the inner 5-tuple. If a tunnel fails health checks, traffic shifts to the surviving tunnel within seconds. (Source: developers.cloudflare.com/magic-transit/reference/tunnel-health-checks/) Source IP preservation means the inner header carries the original user IP all the way to the web server, so access logs, geo-fencing, and rate-limiting based on client IP all work without X-Forwarded-For.

---

## Section B — Firewall Debugging

> **Note on framing:** Question B says "assume the above is a stateful ingress firewall," which contradicts the DSR scenario in Section A where Magic Firewall is stateless. Answers below follow the prompt's stateful framing.

### B.1 Does the firewall allow all DNS queries?

**Partially. Modern DNS will break.**

Rule 2 allows `ANY → 203.0.113.0/24, UDP, dport=53`, covering standard recursive UDP/53 queries. It misses:

- **TCP/53**: Large UDP responses (>512 bytes, or >4096 with EDNS0) trigger the TC bit and force a TCP/53 retry. AXFR/IXFR zone transfers also use TCP/53. Both hit Rule 6 deny.
- **DNS-over-TLS (DoT)**: TCP/853, no matching rule, dropped.
- **DNS-over-HTTPS (DoH)**: TCP/443, allowed by Rule 1, but only incidentally; the operator probably didn't intend Rule 1 as a DNS rule.

**Fix:** split Rule 2 into UDP and TCP variants:

```
Rule 2a: ANY → 203.0.113.0/24, UDP, dport=53, ALLOW
Rule 2b: ANY → 203.0.113.0/24, TCP, dport=53, ALLOW
```

Add an explicit TCP/853 rule if Acme runs a DoT-capable resolver.

### B.2 Will the firewall allow pings?

**No.**

Rule 4 allows ICMP but caps Max IP Packet Length at 56 bytes. The Linux/macOS `ping` default sends 56 bytes of ICMP payload plus 8-byte ICMP header plus 20-byte IPv4 header = **84 bytes total**. 84 > 56, so Rule 4 rejects it and the packet falls to Rule 6 deny. Windows `ping` defaults to 32 bytes payload = 60 bytes total, also blocked.

**Fix:** raise Rule 4's Max IP Packet Length to **1476** (the GRE inner MTU), covering standard pings, MTU discovery probes (1472 + 8 + 20 = 1500), and diagnostic traffic. Magic Transit's upstream DDoS layer already rate-limits ICMP volumetrically, so this cap isn't the right control for ICMP floods.

### B.3 Is TFTP available on `203.0.113.8`?

**No.**

TFTP runs on UDP/69. Rule 5 covers UDP but only for `203.0.113.0/29`, which spans `.0` through `.7`. The address `203.0.113.8` is the first address of the *next* /29 block (`203.0.113.8/29`, covering `.8`-`.15`), so it falls through to Rule 6 deny.

**Fix:** if TFTP should be available on `.8` only, add a specific rule:

```
203.0.113.8/32, UDP, dport=69, ALLOW
```

If TFTP should cover the full /28 (`.0`-`.15`), change Rule 5's destination to `203.0.113.0/28`.

### B.4 Application protocols supported

**a. HTTP (TCP/80): NO.** Rule 1 allows TCP/443 only. No rule covers TCP/80; plain HTTP hits Rule 6 deny. Better to leave it blocked and redirect to HTTPS at the application layer rather than carrying cleartext to the origin.

**b. HTTPS (TCP/443): YES.** Rule 1 explicitly allows it.

**c. HTTP/3 (QUIC, UDP/443): NO.** HTTP/3 runs QUIC over UDP/443. Rule 1 is TCP-only. Rule 5 covers UDP but only for `203.0.113.0/29`. QUIC to any address outside that range is blocked.

**Fix:** add a parallel UDP rule: `ANY → ANY, UDP, dport=443, ALLOW`. Most modern browsers try QUIC first and fall back to TCP only on failure, so without UDP/443 the first-page-load experience is consistently slow.

---

## Section C — What I Learned

**BYOIP is about trust, not config.** The hard part of Magic Transit onboarding isn't the GRE setup; it's convincing the global routing system that Cloudflare is a legitimate origin for Acme's `/24`. That requires LOA (legal authorization), IRR objects (filter sources upstreams build prefix-lists from), and an RPKI ROA (cryptographic proof). Skip any one of these and you get a partial-reachability outage where the prefix works from some networks but not others, often with a 24-48 hour debug horizon as filters propagate. Unlike AWS Elastic IP or GCP, where you take the provider's prefix, Magic Transit's value depends specifically on Acme keeping its own identity in the routing table, which means Acme owns the trust chain.

**DSR is an economics decision with architectural consequences.** Cloudflare doesn't put itself in the egress path because web/app traffic is asymmetric: inbound:outbound ratios are typically 1:10 to 1:50 by byte volume. Forcing return traffic through Cloudflare would multiply egress costs and add latency. DSR keeps Cloudflare on the small-but-attack-prone ingress side and lets large payload responses go direct. The trade-off is that Magic Firewall genuinely can't do connection tracking when half the flow doesn't traverse it. Migrating an on-prem stateful rule set to Magic Firewall isn't a translation exercise; it's a re-architecture where deep stateful policy stays on-prem and Cloudflare handles volumetric and L3/L4 admission control.

**MSS clamping is the most common "TCP works but is broken" failure in GRE/IPsec overlays.** The pattern is unmistakable: handshake completes, small requests succeed, large responses stall at the first segment exceeding the inner MTU. Doing the arithmetic (1500 - 20 - 4 - 20 - 20 = 1436) makes the why concrete. The key insight is that the TCP three-way handshake exchanges MSS independently in each direction: the SYN advertises the client's receive MSS to the server; the SYN-ACK advertises the server's receive MSS to the client. In a symmetric path, clamping on one device covers both. In DSR, the SYN-ACK bypasses Cloudflare entirely, so the server-side announcement is whatever Acme's edge does or doesn't clamp. The "clamp both sides" guidance isn't redundancy; each direction is a distinct announcement.

**The firewall framing contradiction was the most useful exercise.** The prompt says "assume stateful" while the DSR scenario above makes Magic Firewall stateless. Working through the rules under both framings made concrete how much policy expressiveness is lost without state. Under stateful framing, "allow TCP/443 inbound" is complete because the firewall tracks the flow. Under stateless DSR framing, the same rule does the same thing, but there's no egress to match a symmetric rule against. This sharpens the case for keeping stateful inspection on-prem and using Cloudflare for what stateless edge does well: volumetric DDoS mitigation and L3/L4 admission control at scale.

**The onboarding sequence matters as much as the config.** Cloudflare's pre-flight check order (LOA, IRR, RPKI, MSS, tunnel health) isn't arbitrary; each gate prevents a specific post-cutover failure. The order of withdrawing the old provider's announcement and bringing up Cloudflare's matters too. Overlapping announcements cause asymmetric paths that break TCP for a subset of users. In practice, the per-customer config is well-templated; the real work is choreographing the cutover given each customer's upstream filter propagation timing and downstream expectations.

---

## References

- **Magic Transit — MTU and MSS reference**: https://developers.cloudflare.com/magic-transit/reference/mtu-mss/
- **Magic Transit — Get started**: https://developers.cloudflare.com/magic-transit/get-started/
- **BYOIP — Letter of Agency**: https://developers.cloudflare.com/byoip/concepts/loa/
- **Magic Transit — Advertise prefixes**: https://developers.cloudflare.com/magic-transit/how-to/advertise-prefixes/
- **Magic Transit — Traffic steering and prefix mapping**: https://developers.cloudflare.com/magic-transit/reference/traffic-steering/
- **Magic Transit — Tunnel health checks**: https://developers.cloudflare.com/magic-transit/reference/tunnel-health-checks/
- **Data Center Protection — Pre-flight checks**: https://developers.cloudflare.com/learning-paths/data-center-protection/run-pre-flight-checks/
- **Reference Architecture — Magic Transit**: https://developers.cloudflare.com/reference-architecture/architectures/magic-transit/
