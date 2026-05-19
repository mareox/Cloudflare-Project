# Network Services Assignment: Magic Transit Onboarding for Acme Corp

**Author:** Acme Corp CTO (assignment response)
**Scenario:** Onboarding `203.0.113.0/24` (Acme ASN `12345`) to Cloudflare Magic Transit with two anycast GRE tunnels and DSR egress.

---

## Section A: Magic Transit Onboarding

### A.1 What information must Acme supply to Cloudflare to advertise the /24?

Cloudflare needs proof that Acme owns the route and can let Cloudflare announce it. I would provide:

- **LOA:** signed letter saying Cloudflare can announce `203.0.113.0/24` for Acme. ([Cloudflare BYOIP LOA][ref-loa])
- **RPKI ROA:** `203.0.113.0/24`, origin `AS12345`, maxLength `24`. ([Magic Transit advertise prefixes][ref-advertise])
- **IRR route object:** `route: 203.0.113.0/24`, `origin: AS12345`. ([Magic Transit advertise prefixes][ref-advertise])
- **Proof and contacts:** ASN ownership, WHOIS/NetRange info, and abuse/NOC contact. ([Magic Transit advertise prefixes][ref-advertise]; [Data Center Protection pre-flight checks][ref-preflight])

The main thing is that LOA, IRR, and RPKI all need to match.

### A.2 External entities that need to be informed

I would update or notify:

- **IRR and RPKI:** make sure route objects and ROA match `AS12345`. ([Magic Transit advertise prefixes][ref-advertise])
- **Current transit or DDoS provider:** remove the old announcement during cutover.
- **GeoIP vendors:** keep the prefix mapped to the right location.
- **PeeringDB:** clean up old peering details if they are no longer true.
- **Partners and customers:** tell them the path may change, but source IPs should stay the same through GRE. ([Magic Transit reference architecture][ref-architecture]; [RFC 2784][ref-rfc2784])

### A.3 GRE encapsulation and packet size

GRE adds **24 bytes**: 20 bytes for the outer IPv4 header and 4 bytes for GRE. With a 1500-byte path MTU, the inner MTU is **1476 bytes**. ([Magic Transit MTU/MSS][ref-mtu-mss]; [RFC 2784][ref-rfc2784])

#### A.3.a MSS clamp value

**1,436 bytes.**

```
1500  path MTU
- 20  outer IPv4
-  4  GRE
- 20  inner IPv4
- 20  TCP
= 1436
```

Cloudflare recommends 1436 for Magic Transit GRE. ([Magic Transit MTU/MSS][ref-mtu-mss])

#### A.3.b Where to apply the clamp and why

Apply the clamp on Acme's edge router and GRE-facing interfaces.

Cloudflare can clamp the inbound SYN. In DSR, the SYN-ACK goes straight out from Acme and does not go back through Cloudflare. If Acme does not clamp that side, large TCP packets can still break. ([Magic Transit reference architecture][ref-architecture]; [Magic Transit MTU/MSS][ref-mtu-mss])

### A.4 Can prefixes smaller than /24 be routed across the GRE tunnels?

**Yes inside the tunnels. No on the public Internet.**

The public announcement needs to stay `/24`. Inside Cloudflare's overlay, smaller blocks like `203.0.113.0/29` and `203.0.113.8/29` can be mapped to different tunnels. ([Magic Transit advertise prefixes][ref-advertise]; [Magic Transit traffic steering][ref-traffic-steering])

### A.5 Asymmetric routing and on-prem firewall migration

DSR means Cloudflare sees inbound traffic only. Return traffic leaves Acme directly. So I would not copy stateful on-prem rules 1:1 into Cloudflare. ([Magic Transit reference architecture][ref-architecture]; [Network Firewall Magic Transit egress][ref-fw-egress]; [Network Firewall traffic types][ref-fw-traffic])

I would move only simple L3/L4 allows to Cloudflare, like `web-vip:443/TCP` or `mail-vip:25/TCP`. Anything that needs full stateful inspection should stay on-prem, unless Acme changes to a symmetric design.

### A.6 Detailed packet flow diagram

Basic packet flow for a user going to `203.0.113.10` on TCP/443:

```
Forward path:
User -> Cloudflare anycast PoP -> GRE tunnel -> Acme edge -> Web server

Return path:
Web server -> Acme ISP/default route -> User
```

Forward packet between Cloudflare and Acme:

```
Outer IP: src=Cloudflare GRE endpoint, dst=100.100.100.100, proto=47
GRE:      4 bytes
Inner IP: src=USER_PUBLIC_IP, dst=203.0.113.10
TCP:      dport=443, MSS=1436
```

Main point: Cloudflare receives and cleans the packet, sends it to Acme over GRE, and Acme sends return traffic straight back to the user. The server still sees the real client IP. ([Magic Transit reference architecture][ref-architecture]; [GRE and IPsec tunnels][ref-gre-ipsec]; [Tunnel health checks][ref-tunnel-health])

---

## Section B: Firewall Debugging

> **Note:** The prompt says to assume stateful firewall behavior. Magic Transit DSR is not really stateful for egress, but I am answering this section the way the prompt asks. ([Magic Transit reference architecture][ref-architecture]; [Network Firewall Magic Transit egress][ref-fw-egress])

### B.1 Does the firewall allow all DNS queries?

**No, not all DNS.**

Rule 2 only covers UDP/53. It misses:

- **TCP/53:** large DNS replies and zone transfers. ([RFC 7766][ref-rfc7766])
- **DNS-over-TLS:** TCP/853. ([RFC 7858][ref-rfc7858])
- **DNS-over-HTTPS:** TCP/443. This works only because Rule 1 allows TCP/443, not because DNS was handled on purpose. ([RFC 8484][ref-rfc8484])

**Fix:**

```
Rule 2a: ANY -> 203.0.113.0/24, UDP, dport=53, ALLOW
Rule 2b: ANY -> 203.0.113.0/24, TCP, dport=53, ALLOW
```

Add TCP/853 too if Acme supports DoT.

### B.2 Will the firewall allow pings?

**No.**

Rule 4 allows ICMP, but only up to 56 bytes total IP length. Normal Linux/macOS ping is 84 bytes total, and Windows is 60 bytes total. Both are too big, so they get denied. ([Network Firewall fields][ref-fw-fields])

**Fix:** raise the max IP packet length to **1476**.

### B.3 Is TFTP available on `203.0.113.8`?

**No.**

TFTP uses UDP/69. Rule 5 only covers `203.0.113.0/29`, which is `.0` through `.7`. `203.0.113.8` is outside that range, so it hits Rule 6 deny.

**Fix:** if only `.8` needs TFTP:

```
203.0.113.8/32, UDP, dport=69, ALLOW
```

If the whole `.0` to `.15` range should work, change the rule to `203.0.113.0/28`.

### B.4 Application protocols supported

**a. HTTP (TCP/80): NO.** There is no TCP/80 rule.

**b. HTTPS (TCP/443): YES.** Rule 1 allows it.

**c. HTTP/3 (QUIC, UDP/443): NO.** HTTP/3 uses QUIC over UDP, and Rule 1 is TCP only. ([RFC 9114][ref-rfc9114])

**Fix:** add `ANY -> ANY, UDP, dport=443, ALLOW`.

---

## Section C: What I Learned

**BYOIP is mostly trust paperwork.** LOA, IRR, and RPKI need to match, or the route can fail in weird ways. ([Cloudflare BYOIP LOA][ref-loa]; [Magic Transit advertise prefixes][ref-advertise])

**DSR changes firewall thinking.** Cloudflare sees ingress. Acme sends return traffic direct. So Cloudflare rules need to be simple L3/L4 rules, not full stateful firewall rules. ([Magic Transit reference architecture][ref-architecture]; [Network Firewall Magic Transit egress][ref-fw-egress])

**MSS clamping matters.** The right number here is 1436. If the egress side is missed, TCP can look fine but still break on larger packets. ([Magic Transit MTU/MSS][ref-mtu-mss])

**The prompt mixes stateful firewall logic with DSR.** I answered the firewall section using the prompt's stateful assumption, but in a real Magic Transit DSR setup I would keep stateful checks on-prem.

**Cutover order matters.** I would validate LOA, IRR, RPKI, MSS, and tunnel health before moving traffic. ([Magic Transit advertise prefixes][ref-advertise]; [Data Center Protection pre-flight checks][ref-preflight]; [Tunnel health checks][ref-tunnel-health])

---

## References

- **BYOIP - Letter of Agency**: [Cloudflare BYOIP LOA][ref-loa]
- **Magic Transit - Advertise prefixes**: [Cloudflare Magic Transit advertise prefixes][ref-advertise]
- **Magic Transit - MTU and MSS reference**: [Cloudflare Magic Transit MTU/MSS][ref-mtu-mss]
- **Magic Transit - Traffic steering and prefix mapping**: [Cloudflare Magic Transit traffic steering][ref-traffic-steering]
- **Magic Transit - Tunnel health checks**: [Cloudflare Magic Transit tunnel health checks][ref-tunnel-health]
- **Magic Transit - GRE and IPsec tunnels**: [Cloudflare Magic Transit GRE and IPsec tunnels][ref-gre-ipsec]
- **Reference Architecture - Magic Transit**: [Cloudflare Magic Transit reference architecture][ref-architecture]
- **Data Center Protection - Pre-flight checks**: [Cloudflare Data Center Protection pre-flight checks][ref-preflight]
- **Cloudflare Network Firewall - Magic Transit egress**: [Network Firewall Magic Transit egress][ref-fw-egress]
- **Cloudflare Network Firewall - Traffic types**: [Network Firewall traffic types][ref-fw-traffic]
- **Cloudflare Network Firewall - Fields**: [Network Firewall fields][ref-fw-fields]
- **IETF - RFC 2784**: [Generic Routing Encapsulation (GRE)][ref-rfc2784]
- **IETF - RFC 7766**: [DNS Transport over TCP][ref-rfc7766]
- **IETF - RFC 7858**: [DNS over TLS][ref-rfc7858]
- **IETF - RFC 8484**: [DNS Queries over HTTPS][ref-rfc8484]
- **IETF - RFC 9114**: [HTTP/3][ref-rfc9114]

[ref-loa]: https://developers.cloudflare.com/byoip/concepts/loa/
[ref-advertise]: https://developers.cloudflare.com/magic-transit/how-to/advertise-prefixes/
[ref-mtu-mss]: https://developers.cloudflare.com/magic-transit/reference/mtu-mss/
[ref-traffic-steering]: https://developers.cloudflare.com/magic-transit/reference/traffic-steering/
[ref-tunnel-health]: https://developers.cloudflare.com/magic-transit/reference/tunnel-health-checks/
[ref-gre-ipsec]: https://developers.cloudflare.com/magic-transit/reference/gre-ipsec-tunnels/
[ref-architecture]: https://developers.cloudflare.com/reference-architecture/architectures/magic-transit/
[ref-preflight]: https://developers.cloudflare.com/learning-paths/data-center-protection/run-pre-flight-checks/
[ref-fw-egress]: https://developers.cloudflare.com/cloudflare-network-firewall/best-practices/magic-transit-egress/
[ref-fw-traffic]: https://developers.cloudflare.com/cloudflare-network-firewall/about/traffic-types/
[ref-fw-fields]: https://developers.cloudflare.com/cloudflare-network-firewall/reference/network-firewall-fields/
[ref-rfc2784]: https://datatracker.ietf.org/doc/html/rfc2784
[ref-rfc7766]: https://datatracker.ietf.org/doc/html/rfc7766
[ref-rfc7858]: https://datatracker.ietf.org/doc/html/rfc7858
[ref-rfc8484]: https://datatracker.ietf.org/doc/html/rfc8484
[ref-rfc9114]: https://datatracker.ietf.org/doc/html/rfc9114
