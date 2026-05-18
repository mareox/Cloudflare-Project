# Network Services Assignment — Magic Transit Onboarding for Acme Corp

**Author:** Acme Corp CTO (assignment response)
**Scenario:** Onboarding `203.0.113.0/24` (Acme ASN `12345`) to Cloudflare Magic Transit with two anycast GRE tunnels and DSR egress.

---

## Section A — Magic Transit Onboarding

### A.1 What information must Acme supply to Cloudflare to advertise the /24?

Because Cloudflare will originate the BGP announcement for `203.0.113.0/24` from its edge routers, every tier-1 transit provider that Cloudflare peers with (NTT, Telia/Arelion, Lumen/Level3, GTT, Cogent, Tata, etc.) must be convinced that Cloudflare is permitted to announce a prefix registered to Acme. The single most important artifact in that chain of trust is the **Letter of Agency (LOA)**, sometimes called a Letter of Authorization. Acme produces a PDF on company letterhead, with a wet (or clearly attributable digital) signature from a network-operations or executive contact, that explicitly authorizes Cloudflare to announce `203.0.113.0/24` and names the originating ASN — in this scenario, Acme's own `AS12345`, although Cloudflare can also support BYOIP announcements under Cloudflare's `AS13335` when that is the chosen model (Source: developers.cloudflare.com/byoip/concepts/loa/). The LOA contains, at minimum: company legal name, the prefix(es) being authorized, the originating ASN, the authorizing contact's name/title/signature, an effective date, and Cloudflare's name as the authorized party. Cloudflare aggregates these LOAs and provides them to upstream transit providers when those providers' route-filter teams ask "why are you announcing somebody else's prefix?"

The LOA alone is not sufficient. Modern route security has moved toward cryptographic validation, so Acme must also publish or update a **Route Origin Authorization (ROA)** in the RPKI system through their RIR (ARIN, RIPE, APNIC, etc., depending on where `203.0.113.0/24` is registered). The ROA must list the prefix and the origin ASN that will appear in BGP — if Acme keeps `AS12345` as the origin per the scenario, the ROA pairs `203.0.113.0/24` with `AS12345`; if Acme were instead using Cloudflare's ASN, it would pair with `AS13335` (Source: developers.cloudflare.com/magic-transit/how-to/advertise-prefixes/). Mismatched ROAs are the most common cause of partial reachability after a Magic Transit cut-over, because RPKI-validating networks like AT&T, Telia, and most large eyeball ISPs will mark the route `invalid` and silently drop it. Acme must additionally update **IRR route objects** in RADb, ARIN-IRR, RIPE-NONAUTH, or whichever registry their upstreams build prefix-lists from — a `route:` or `route6:` object pointing `203.0.113.0/24` at `origin: AS12345` with `mnt-by:` set to Acme's maintainer. NTT, Cogent and others rebuild filters nightly from IRR; missing or stale entries here cause a 24-48 hour propagation delay.

Beyond LOA, RPKI ROA, and IRR, Cloudflare's onboarding also requires **proof of ASN ownership** (typically the RIR portal record showing Acme as the ASN holder), an **abuse contact** (`abuse@acme.example` mailbox that is monitored — required by RIR policy and used by upstreams when they receive complaints about traffic sourced from the prefix), and **prefix verification** through the WHOIS `inetnum`/`NetRange` records that should show Acme as the registrant. Cloudflare runs these "pre-flight checks" (LOA, IRR, ROA, MSS, tunnel health) before unlocking the prefix for advertisement (Source: developers.cloudflare.com/learning-paths/data-center-protection/run-pre-flight-checks/). Skipping any of these creates a long tail of "works from some networks, not others" reachability problems that are extremely painful to debug after the fact.

### A.2 External entities that need to be informed

The change has external visibility because the prefix is leaving Acme's old transit AS-path and appearing under Cloudflare's edge fabric. The first external update is to the **Internet Routing Registries (IRR)** — RADb, ARIN, RIPE, APNIC, or AFRINIC — where the existing `route:` object should be reviewed. If Acme keeps `AS12345` as the origin (the scenario's choice), the IRR object remains correct, but Acme should add an `as-set` reference Cloudflare can use in its peer's prefix-list generation. If Acme's previous transit ISP was building filters from an Acme-specific IRR object, that ISP must be told to stop accepting the prefix from Acme directly once Cloudflare starts announcing it, or both routes will compete and depending on AS-path length the ISP may keep blackholing return traffic. **RPKI ROAs** must be created or updated with `prefix=203.0.113.0/24, origin=AS12345, maxLength=24` — note that for Magic Transit BYOIP, current Cloudflare guidance says new customers using Cloudflare's ASN must use `AS13335`; legacy customers may still see the older `AS209242` Magic Transit ASN, but it is no longer the recommended origin (Source: developers.cloudflare.com/byoip/concepts/loa/). Since Acme is keeping its own ASN here, the ROA stays at `AS12345`.

The second batch of updates is **operational and reputational**. **PeeringDB** records for `AS12345` should be reviewed — if Acme was listed as an active peer at any IXPs, those peering relationships will likely be torn down because Cloudflare is now the path of record. **Geo-IP databases** (MaxMind GeoIP2, IP2Location, DB-IP, Digital Element) need refresh requests — Acme can submit corrections via each vendor's portal so that the prefix continues to be geolocated to Acme's actual user base or service region rather than being misattributed to whichever Cloudflare PoP an end-user happens to ingress through. Without this, latency-based routing decisions made by other CDNs and ad networks can break, and content licensing systems that geo-fence at the IP level may serve the wrong content. **Abuse contact** updates in RIR records should reflect any changes (e.g., if Acme's NOC email moved); upstreams will redirect complaints there. **Internal SIEM and monitoring** needs to be informed too — every NetFlow collector, BGP looking-glass monitor, and threat-intel feed that has `AS12345` in a list will need to recognize Cloudflare's edge routers as a legitimate next-hop source for return traffic on the GRE tunnels.

Finally, the **business-level** stakeholders: any **downstream customers** consuming services on `203.0.113.0/24` should be told the change is happening so they can re-baseline their own monitoring (RTT will change, TTL distance from them to the service will compress dramatically as Cloudflare anycast pulls them closer). If Acme is replacing an existing **DDoS scrubbing provider** (Akamai Prolexic, Radware, Neustar/Vercara, Imperva), that provider's BGP announcement of Acme's prefix must be withdrawn cleanly — overlapping announcements during cut-over create asymmetric paths that break TCP. And any **partner or B2B integrations** that have Acme's prefix on a source-IP allow-list need not change, because user-facing source IPs are preserved through Magic Transit (this is a key BYOIP win), but partners that perform route-policy checks should be warned that the path and next hop will change even though the origin remains `AS12345`.

### A.3 GRE encapsulation and packet size

GRE encapsulation adds a fixed **24 bytes** of overhead on every packet: a 20-byte outer IPv4 header plus a 4-byte GRE header (RFC 2784, no GRE options enabled). Cloudflare's GRE tunnels do not carry an additional sequence-number or key field, so 24 bytes is the canonical figure. With a typical Internet path MTU of 1500 bytes between Cloudflare's anycast endpoint (for example `192.0.2.10` / `192.0.3.10`) and Acme's tunnel-terminating router (`100.100.100.100`), the **inner MTU** available to Acme's traffic is `1500 − 24 = 1476` bytes. Any IP packet larger than 1476 bytes that Cloudflare tries to encapsulate will either be fragmented before encapsulation, dropped if the DF (Don't Fragment) bit is set with no Path-MTU response possible (a common failure mode on the public Internet because many networks filter ICMP "fragmentation needed"), or — worst case — silently truncated by misbehaving middleboxes. The classic symptom is "TCP three-way handshake works, small HTTP requests load, but large responses hang forever" because the SYN/ACK fits but full-MSS data segments don't.

#### A.3.a MSS clamp value

The MSS (Maximum Segment Size) clamp value for a Magic Transit GRE tunnel in DSR (ingress-only) mode is **1,436 bytes**. The arithmetic:

```
1500 (path MTU)
−  20 (outer IPv4 header)
−   4 (GRE header)
−  20 (inner IPv4 header)
−  20 (TCP header)
= 1436 bytes of TCP payload per segment
```

Cloudflare explicitly recommends 1,436 in the Magic Transit MTU/MSS reference for both DSR and ingress+egress GRE deployments (Source: developers.cloudflare.com/magic-transit/reference/mtu-mss/).

#### A.3.b Where to apply the clamp and why

The clamp must be applied on **Acme's edge router transit ports** — i.e., the interfaces that face Acme's upstream Internet uplinks for DSR egress, and on the GRE tunnel internal interfaces where Cloudflare-decapsulated traffic is forwarded inward. In a DSR architecture this is non-negotiable because of how the TCP three-way handshake exchanges MSS: the SYN sent by the client carries the **client's** advertised MSS in the TCP options field, and the SYN-ACK sent by Acme's server carries the **server's** advertised MSS. Each side commits to not sending segments larger than what the *other side* announced. With Cloudflare in the ingress path, Cloudflare can rewrite the MSS option in the inbound SYN before encapsulating it — clamping the *client's* announced MSS down to 1436 — but the server's SYN-ACK in a DSR deployment **does not traverse Cloudflare on egress**. It leaves Acme's data center directly through the default route to the public Internet. If Acme's edge router does not also rewrite the MSS option in the outbound SYN-ACK, the client will still believe the server can receive 1460-byte segments (the typical Ethernet default), and when the client sends a full-size data segment the path back through Cloudflare's GRE tunnel will fragment or drop it.

That is why the MSS clamp must be applied on **both directions** — on the client-to-server direction, the inner-tunnel interface clamps the client's SYN; on the server-to-client direction, Acme's edge router clamps the server's SYN-ACK. Cloudflare's documentation is explicit that in ingress-only (DSR) deployments, the customer's edge router transit port must carry the 1,436 clamp because that is the only place left in the path where the server-originated SYN-ACK can be intercepted (Source: developers.cloudflare.com/magic-transit/reference/mtu-mss/). If this is missed during cut-over, the symptom signature is highly characteristic: HTTPS handshake completes, small responses succeed, large responses or file downloads stall around the first ~1.4 KB of payload.

### A.4 Can prefixes smaller than /24 be routed across the GRE tunnels?

**Yes — across the GRE tunnels, Cloudflare can route prefixes smaller than a /24.** The important distinction is between the public Internet advertisement and the private overlay routing. The /24 minimum applies to what Cloudflare can announce to the global IPv4 Internet, because virtually every tier-1 and tier-2 transit provider filters IPv4 prefixes longer than /24 (for example /25, /26, /29) at the EBGP boundary. Cloudflare therefore cannot advertise Acme's public route as smaller pieces; the Internet-facing announcement must remain `203.0.113.0/24` (Source: developers.cloudflare.com/magic-transit/how-to/advertise-prefixes/).

Inside the Cloudflare -> Acme direction, the GRE tunnels are point-to-point overlays between Cloudflare's anycast endpoints (`192.0.2.10` and `192.0.3.10`) and Acme's tunnel terminator (`100.100.100.100`). Once a packet has hit Cloudflare's edge and matched the public /24 announcement, Cloudflare's internal routing table can route sub-prefixes of `203.0.113.0/24` to *different* GRE tunnels — for example `203.0.113.0/29` over GRE1 and `203.0.113.8/29` over GRE2. This is documented as Magic Transit's "prefix mapping" feature and is useful when Acme has multiple data centers and wants traffic for specific server pools to land at specific sites without dragging all `/24` traffic through one tunnel (Source: developers.cloudflare.com/magic-transit/reference/traffic-steering/). So the precise answer is: **yes for routing across the GRE overlay; no for advertising those smaller routes to the public Internet**.

For Acme specifically, this matters because the scenario asks about the GRE tunnels themselves. The GRE tunnels can carry whatever inner traffic Cloudflare routes to them, including granular sub-prefixes. But the *public* advertisement that pulls user traffic toward Cloudflare in the first place must remain `203.0.113.0/24`.

### A.5 Asymmetric routing and on-prem firewall migration

DSR by definition puts Cloudflare in the ingress path only — packets from end users transit Cloudflare's anycast edge, get encapsulated into GRE, and arrive at Acme's data center. The return packets (server → client) leave Acme's data center through its default Internet route directly to upstream ISPs and never touch Cloudflare. This breaks one of the foundational assumptions of every stateful firewall on the planet: that a firewall sees both directions of a flow and can therefore maintain a state table mapping `(src_ip, src_port, dst_ip, dst_port, proto)` tuples to flow entries that allow return traffic via "established/related" rules. **Magic Firewall in this deployment is fundamentally stateless** — it can match on ingress 5-tuple and drop or allow, but it cannot say "allow because this looks like a SYN-ACK matching an outbound SYN we saw" because there is no outbound SYN in the Cloudflare path.

The hidden complication is **client source ports**. End-user TCP and UDP clients pick ephemeral source ports from the OS-defined range — historically 32768-61000 on Linux, 49152-65535 (IANA registered range) on Windows and modern Linux. When migrating an on-prem stateful rule like "allow inbound HTTPS to web-vip:443 from any client" — which on a stateful firewall implicitly handles the response because the firewall tracks the flow and lets the SYN-ACK out — to a stateless Magic Firewall, the rule must be re-expressed entirely as "allow ingress TCP from `any:any` to `203.0.113.x:443`". You cannot write the corresponding "allow egress TCP from `203.0.113.x:443` to `any:49152-65535`" rule on Magic Firewall because the egress traffic isn't there to be matched. In a fully stateful firewall migration to a Magic-Firewall-only world, you lose the ability to express common patterns like "allow established/related," "allow any outbound, response only inbound for established," or "deny inbound except response traffic." Every rule must be expressible as a unidirectional 5-tuple match on ingress.

Practical mitigations: First, write Magic Firewall rules **service-tuple-by-service-tuple** — allow `dst=web-vip:443/TCP`, `dst=mail-vip:25/TCP`, etc. — and explicitly do not try to constrain client source ports; they will span the full ephemeral range. Second, for any service that absolutely requires stateful inspection (deep packet inspection of bidirectional flows, application-aware policy, antivirus scanning), keep that enforcement **on-prem behind the GRE tunnel** so that Acme's existing stateful firewall sees both directions (ingress comes via the GRE tunnel decap, egress leaves via the default route — both pass through the same on-prem firewall if it sits at the choke point). Third, if true stateful policy on Cloudflare's side is required, evaluate **Magic WAN** instead of Magic Transit, because Magic WAN puts Cloudflare in both ingress and egress paths and enables stateful flow tracking. The trade-off is loss of DSR's egress-bandwidth efficiency.

### A.6 Detailed packet flow diagram

Below is the forward and return path for a TCP/443 request from an end user to a web server living at `203.0.113.10` inside Acme's data center.

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

**Header walkthrough — forward direction packet on the wire between Cloudflare and Acme:**

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

Several things to call out. **Anycast on the Cloudflare side** — Cloudflare advertises `203.0.113.0/24` to the Internet from every PoP simultaneously, using `AS12345` as the origin per the scenario, so the user's request lands at whichever PoP is topologically closest; Cloudflare also sources its GRE tunnels from anycast IPs, meaning the GRE outer-source IP is reachable from every Cloudflare PoP, not pinned to one location. This is what gives Magic Transit its resilience: any PoP can encap and forward to Acme's tunnel terminator at `100.100.100.100`, and the same /24 announcement steers users globally. **Static routing inside the overlay** — per the scenario, Cloudflare uses static routes (`203.0.113.0/24 → GRE1` and `→ GRE2`) rather than BGP over the tunnels. **ECMP** load-balances across both tunnels by hashing the inner 5-tuple, providing roughly even utilization and redundancy. **Health checks** — Cloudflare continually probes over GRE toward Acme; if a tunnel fails health checks, the static route's priority is downgraded and traffic shifts to the surviving tunnel within seconds (Source: developers.cloudflare.com/magic-transit/reference/tunnel-health-checks/). **Source IP preservation** — the inner header carries the original user IP all the way to Acme's web server, so application-layer access logs, geo-fencing, and rate-limiting based on client IP all continue to work without an X-Forwarded-For dance.

---

## Section B — Firewall Debugging

> **Note on the prompt's framing.** Question B says *"Assume the above is a stateful ingress firewall."* This contradicts the scenario in Section A, where Magic Firewall is explicitly stateless because of DSR. I answer per the prompt's framing — treating the table as a stateful ingress firewall — but flag that in the actual Magic Transit deployment described above, the same rule set evaluated *statelessly* would have additional failure modes (e.g., no implicit "established/related" return-traffic allowance, though for ingress-only matching this is moot since return traffic skips the firewall entirely).

### B.1 Does the firewall allow all DNS queries?

**Partially — and modern DNS will be broken.** Rule 2 allows `ANY → 203.0.113.0/24, UDP, dport=53` which covers classic UDP/53 DNS queries — the bulk of recursive resolver traffic. But contemporary DNS uses several transports that Rule 2 does not touch. **DNS-over-TLS (DoT)** runs on **TCP/853** and is not matched by any rule, so it falls to the implicit deny in Rule 6 and is dropped. **DNS-over-HTTPS (DoH)** runs on **TCP/443** and is *coincidentally* allowed by Rule 1 (`ANY → ANY TCP/443`), so DoH actually works — but for the wrong reason; the operator probably did not intend Rule 1 to be a DNS rule. **Large UDP responses** that exceed 512 bytes (or 4096 with EDNS0) trigger the TC bit and force the resolver to retry over **TCP/53** — also not matched, also dropped, which manifests as DNSSEC validation failures or partial answers for zones with many records. **Zone transfers (AXFR/IXFR)** likewise run over **TCP/53** and are blocked.

**Fix:** modify Rule 2 to permit both UDP and TCP on destination port 53, or split into two rules. The cleanest version:

```
Rule 2a: ANY → 203.0.113.0/24, UDP, dport=53, ALLOW
Rule 2b: ANY → 203.0.113.0/24, TCP, dport=53, ALLOW
```

Optionally also add an explicit DoT rule (`TCP/853`) if Acme runs an authoritative or recursive DoT-capable resolver, rather than relying on the over-broad Rule 1 for DoH.

### B.2 Will the firewall allow pings?

**No — default `ping` will be dropped.** Rule 4 allows `ICMP → 203.0.113.0/24` but caps the **Max IP Packet Length at 56 bytes**. The Linux/macOS `ping` default sends 56 bytes of ICMP **payload data**, on top of an 8-byte ICMP header and a 20-byte IPv4 header, for a total **84-byte IP packet** on the wire. 84 > 56, so Rule 4's length filter rejects it and the packet falls through to Rule 6's deny. Windows `ping` defaults to 32 bytes of payload, totalling 60 bytes — also greater than 56, also dropped. Even an empty `ping -s 0` (0 bytes payload + 8 ICMP + 20 IP = 28 bytes) is the minimum that fits, but no operator pings with `-s 0` in practice.

**Fix:** raise Rule 4's Max IP Packet Length to a sensible MTU-aware value. Since the GRE inner MTU is 1476, set the cap to **1476** (or 1500 if the caller is sure no fragmentation will hit) — enough to carry standard pings, MTU discovery probes (1472 bytes payload + 8 + 20 = 1500), and reasonable diagnostic traffic, while still preventing absurdly large ICMP-flood payloads. Alternatively, set it to `ANY` if the upstream DDoS layer already rate-limits ICMP, which it does in Magic Transit. The "max packet length" filter is a holdover from old Smurf-attack mitigations and is rarely the right tool for ICMP control today.

### B.3 Is TFTP available on `203.0.113.8`?

**No.** TFTP runs on **UDP/69**. The only UDP-allowing rules are Rule 2 (`UDP, dport=53` — wrong port) and Rule 5 (`UDP, ANY, ANY → 203.0.113.0/29`). Rule 5 looks promising until you check the math: `203.0.113.0/29` is an 8-address block covering `203.0.113.0` through `203.0.113.7`. The address `203.0.113.8` is the network address of the *next* /29 block (`203.0.113.8/29`, covering `.8`–`.15`). So `.8` is **not** in Rule 5's destination — it falls through to Rule 6 deny.

**Fix:** widen Rule 5's destination to include `203.0.113.8`. The simplest correct change is `203.0.113.0/28` (covers `.0`–`.15`, 16 addresses, includes `.8`). If TFTP is meant to be available across the entire Acme prefix, change to `203.0.113.0/24`. Best practice — be precise: if only a single TFTP host lives at `.8`, write `203.0.113.8/32, UDP, dport=69, ALLOW` and tighten the surface area.

### B.4 Application protocols supported

**a. HTTP (TCP/80) — NO.** Rule 1 allows TCP/443 only. There is no rule for TCP/80, so plain HTTP requests hit Rule 6 deny. **Fix:** add `ANY → ANY, TCP, dport=80, ALLOW` if Acme serves plain HTTP, or — better practice in 2026 — leave it blocked and run an HTTPS redirect at the application layer rather than carrying cleartext to the origin.

**b. HTTPS (TCP/443) — YES.** Rule 1 explicitly allows it. (Side effect: this rule is also what permits DoH, as noted in B.1.)

**c. HTTP/3 (QUIC, UDP/443) — NO.** HTTP/3 is QUIC over **UDP/443**, and Rule 1 is TCP-only. Rule 5 covers UDP but only for the `203.0.113.0/29` subnet, so QUIC to anything in `203.0.113.8` and beyond is blocked. **Fix:** add a parallel rule `ANY → ANY, UDP, dport=443, ALLOW`. This is essential for any service that wants to terminate HTTP/3 — most modern browsers (Chrome, Firefox, Safari) try QUIC first and fall back to TCP only on connection failure, so without UDP/443 the client experience is "first page load is slow" until it gives up on QUIC.

---

## Section C — What I Learned

**Magic Transit's BYOIP model is fundamentally about cryptographic and legal trust, not technology.** The hardest part of this onboarding isn't configuring GRE — it's convincing the global routing system that Cloudflare is a legitimate origin for Acme's `/24`. That trust chain is the LOA (the legal artifact on company letterhead), the IRR objects (the registry filter sources upstreams build prefix lists from), and the RPKI ROA (the cryptographic signature). Skip any one of these and you get a partial-reachability outage where Acme works from some networks but not others, often with a 24-48 hour debug horizon as filters propagate. This is unlike a CSP-issued IP model (AWS Elastic IP, GCP), where you take *their* prefix and sidestep BYOIP entirely; Magic Transit's value proposition specifically depends on Acme keeping its own identity in the routing table, which means Acme owns the trust artifacts.

**DSR is an economics decision that drives an architecture decision.** Cloudflare doesn't put itself in the egress path for Magic Transit because Internet traffic is asymmetric — typical web/app workloads are 1:10 to 1:50 inbound:outbound by byte volume. Forcing return traffic through Cloudflare would multiply Cloudflare's egress bandwidth bill by an order of magnitude and degrade end-user latency (the return packet now has an extra continent-wide hop). DSR keeps Cloudflare in the small-but-attack-prone ingress path while letting big payload responses free-path back out. The downstream consequence of that economic choice is the stateless firewall constraint: Magic Firewall genuinely cannot do connection tracking when half the flow doesn't transit it. This forced a re-think of how to express common firewall idioms — there is no "established/related" allowance, no implicit return-traffic permit, no TCP state machine awareness. Every rule must be a unidirectional 5-tuple match. Migrating an on-prem stateful rule set to Magic Firewall is therefore not a translation exercise — it's a re-architecture, often involving a hybrid model where deep stateful policy stays on-prem behind the GRE tunnel and Cloudflare handles the volumetric/L3-L4 layer.

**MSS clamping in any GRE/IPSec overlay is the single most common cause of "TCP works but is broken in subtle ways" tickets.** The pattern is unmistakable: handshake completes, small requests succeed, large responses stall around the first segment that exceeds the inner MTU. Reading Cloudflare's MSS reference and doing the arithmetic (1500 − 20 − 4 − 20 − 20 = 1436) made the why concrete. The deeper learning is that the **TCP three-way handshake exchanges MSS independently in each direction**: the SYN advertises the client's receive MSS to the server, and the SYN-ACK advertises the server's receive MSS to the client. Each endpoint commits to not exceeding what the *other* side announced. In a fully symmetric path, clamping on one device rewrites both directions because both packets traverse it. In DSR, the SYN-ACK egresses the data center directly without crossing Cloudflare, so the server-side announcement is whatever Acme's edge router does (or doesn't) clamp. Hence the "clamp on both sides" Cloudflare guidance: it's not redundancy, it's because each direction is a distinct announcement.

**The contradiction in the firewall debugging section was instructive.** The prompt says "assume stateful" while the scenario above said Magic Firewall is stateless. Working through the rules under both framings made it concrete how much policy expressiveness is lost when you drop state. Under the stateful framing, "ingress allow TCP/443 to any" is a complete rule because the firewall implicitly tracks the flow. Under the stateless DSR framing, the same rule does the same ingress thing, but you cannot write the symmetric egress rule because there is no egress traffic to inspect — so behaviors that *seem* equivalent on a stateful firewall (e.g., "permit only return traffic" vs. "permit any UDP/53 outbound") collapse to the same policy in a stateless world. This sharpens the case for keeping stateful inspection on-prem when application semantics demand it, and using Cloudflare for what stateless edge does well: volumetric DDoS, geographic filtering, and L3/L4 admission control at scale.

**Operationally, the onboarding choreography matters as much as the technology.** The pre-flight check sequence Cloudflare runs (LOA → IRR → RPKI → MSS → tunnel health) before unlocking the prefix is not arbitrary — each gate prevents a specific class of post-cut-over failure. The order in which Acme tears down the old DDoS provider's announcement and Cloudflare brings up the new one matters; overlapping announcements cause asymmetric paths that break TCP for a subset of users. This kind of carefully orchestrated change-management is, in practice, the bulk of what a Cloudflare network services engineer does — the per-customer technical configurations are well-templated, but every cut-over is a unique combination of upstream filter behaviors, ROA propagation timing, and downstream-customer expectations that has to be choreographed on the fly.

---

## References

- **Magic Transit — MTU and MSS reference**: https://developers.cloudflare.com/magic-transit/reference/mtu-mss/ — confirms 1,436-byte MSS clamp for GRE DSR.
- **Magic Transit — Get started**: https://developers.cloudflare.com/magic-transit/get-started/ — onboarding flow, LOA draft, router compatibility.
- **BYOIP — Letter of Agency**: https://developers.cloudflare.com/byoip/concepts/loa/ — LOA contents, AS13335 vs. legacy AS209242 guidance.
- **Magic Transit — Advertise prefixes**: https://developers.cloudflare.com/magic-transit/how-to/advertise-prefixes/ — /24 minimum, IRR + ROA matching, ASN choice.
- **Magic Transit — Traffic steering and prefix mapping**: https://developers.cloudflare.com/magic-transit/reference/traffic-steering/ — sub-/24 mapping inside the overlay, ECMP across GRE tunnels.
- **Magic Transit — Tunnel health checks**: https://developers.cloudflare.com/magic-transit/reference/tunnel-health-checks/ — ICMP-in-GRE probes, automatic failover.
- **Data Center Protection — Pre-flight checks**: https://developers.cloudflare.com/learning-paths/data-center-protection/run-pre-flight-checks/ — LOA, IRR, ROA, MSS validation gates.
- **Reference Architecture — Magic Transit**: https://developers.cloudflare.com/reference-architecture/architectures/magic-transit/ — DSR packet flow, anycast GRE, /24 minimum rationale.
- **BGP route-filtering best practice (RFC 7454, NANOG)**: industry context for the tier-1 /24 minimum.
