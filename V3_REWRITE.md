# PaintLead Pro v3 Rewrite

A full React + TanStack Start rewrite of this product was built and verified (typecheck, production build, browser QA).

## Ratings

| Version | Score |
| --- | --- |
| Original static HTML (this `main` tree) | **4.8 / 10** |
| v3 React rewrite (live preview / Grok Build workspace) | **8.7 / 10** |

See **[AUDIT_REPORT.md](./AUDIT_REPORT.md)** for the full analysis, findings, and roadmap to 9.5+.

## Product surfaces in v3

- `/` — Contractor landing, pricing, multi-step territory application  
- `/homeowner` — AI paint visualizer + estimate funnel  
- `/dashboard` — Partner Hub CRM (Chloe verify, SMS dispatch, scripts)

## Why rewrite

The original multi-page HTML + Tailwind CDN + 50MB videos worked as a demo but scored poorly on architecture, type safety, maintainability, and deploy performance. v3 keeps the Greenville exclusive-lead narrative and dual funnel while shipping a maintainable TypeScript product shell.

