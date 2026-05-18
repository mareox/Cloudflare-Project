# Cloudflare Project Submissions

This folder contains the written deliverables for the Cloudflare Application Services and Network Services assignments.

Project task tracking is split under [`../_cloudflare-projects/`](../_cloudflare-projects/):

| Project | Task file |
| --- | --- |
| Application Services | [`../_cloudflare-projects/Application_Services/TASK.md`](../_cloudflare-projects/Application_Services/TASK.md) |
| Network Services | [`../_cloudflare-projects/Network_Services/TASK.md`](../_cloudflare-projects/Network_Services/TASK.md) |
| Zero Trust | [`../_cloudflare-projects/Zero_Trust/TASK.md`](../_cloudflare-projects/Zero_Trust/TASK.md) |

## Best links for review

| Page | Use this when |
| --- | --- |
| [`REPORT.md`](REPORT.md) | You want the GitHub-native rendered report with screenshots inline. |
| [Application Services HTML](https://mareox.github.io/Cloudflare-Project/) | You want the rendered HTML web page. |
| [`network-report.md`](network-report.md) | You want the GitHub-native Network Services report. |
| [Network Services HTML](https://mareox.github.io/Cloudflare-Project/network.html) | You want the rendered HTML Network Services report. |
| [`network-report.docx`](network-report.docx) | You want the DOCX source for the Network Services report. |

GitHub does not render `index.html` in the normal repository file viewer. It shows the source code. To render the HTML page, enable GitHub Pages for this repository with:

```text
Source: Deploy from a branch
Branch: main
Folder: /docs
```

After GitHub Pages publishes, the HTML page should be available at:

<https://mareox.github.io/Cloudflare-Project/>

The Network Services page should be available at:

<https://mareox.github.io/Cloudflare-Project/network.html>

## Deliverables covered

Application Services:

1. Working application with access instructions.
2. Implementation steps with configuration and testing evidence.
3. Relevant product use cases.
4. Knowledge gaps filled during implementation.
5. Target customer experience.

Network Services:

1. Magic Transit onboarding requirements.
2. External entities and route-security updates.
3. GRE packet-size impact and MSS clamp placement.
4. Sub-/24 routing across the GRE overlay.
5. Asymmetric routing and firewall migration considerations.
6. Packet-flow diagram and firewall debugging answers.

## Screenshots

The Application Services Markdown report embeds screenshots from [`screenshots/`](screenshots/), using paths relative to this folder so they render correctly in GitHub.

The Network Services HTML report embeds SVG diagrams from [`assets/`](assets/), and a rendered preview screenshot is available at [`screenshots/network_report_preview.png`](screenshots/network_report_preview.png).
