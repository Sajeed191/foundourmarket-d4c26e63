# Project Memory

## Core
FoundOurMarket™ — premium international dropshipping ecommerce. Tagline: "Everything You Need — All in One Place 🌍".
Style: luxury, futuristic, cinematic, minimal. Dark navy/black layered bg, warm orange/amber glow accents, premium glassmorphism, floating depth. Mobile-first, compact elegant spacing.
Inspirations: Apple, Tesla, Nothing OS, Arc, Stripe. App Store featured-quality polish.
NEVER add: loyalty points, rewards, coins, gamification, cheap cyberpunk/neon overload, oversized product cards, cluttered layouts, excessive spacing, generic Shopify look.
Use semantic tokens in src/styles.css (oklch); never hardcode colors in components.
AI UX rule: every AI feature shows ONE prioritized recommendation, plain language, traffic-light status (🟢🔵🟡🔴), one-click action, progressive disclosure. No raw scores/JSON/jargon by default. AI recommends, humans decide.
Platform v1.0 FROZEN: Image v3, Catalog v2, Marketplace v3, Health v1, Operations v1. Only bug fixes / perf / UX polish / new bulk-op adapters over existing analyzers / new queue filters. No changes to public contracts. New work goes in Track A (Vendor), B (Customer), C (Growth), D (Platform).
Composition-first: every new feature must first try to compose existing frozen contracts before any new contract is introduced.

## Memories
- [AI UX principles](mem://design/ai-ux-principles) — Permanent rules for every AI surface: one message, simple language, traffic lights, explain decisions, one-click fix, unified Marketplace AI Assistant
- [Brand & design direction](mem://design/brand-direction) — Full visual style, UX goals, motion system
- [Homepage & components spec](mem://features/homepage-spec) — Section structure, product cards, nav, footer rules
- [Email sender governance](mem://features/email-sender-policy) — Approved senders (support@ primary, gmail backup), validation, audit, read-only composer
- [Email-to-Ticket channel](mem://features/email-to-ticket) — Inbound email webhook, customer matching, channel metadata, guest tickets, spam protection
- [Support Presence System](mem://features/support-presence) — Activity-derived agent presence, customer availability, avg first reply KPI
- [Image engine versioning](mem://features/image-engine-versioning) — Reproducibility rule + version manifest stamped on jobs and product_images; engine frozen
- [Catalog Intelligence 2.0 (FROZEN)](mem://features/catalog-intelligence) — Layer 2, complete. IntelligenceModule contract + 5 modules + Recommendation Broker + Marketplace Readiness
- [Marketplace Intelligence 3.0](mem://features/marketplace-intelligence) — Layer 3, marketplace-wide. Vendor, Optimization, Trust, Health. Modules consume only public contracts
- [Intelligence Platform embedding](mem://features/intelligence-platform) — Product Editor AI · Admin Home · Recommendation Analytics
- [Marketplace Operations 1.0 (FROZEN)](mem://features/marketplace-operations) — Smart Work Queue · Daily Digest · Bulk Operations. Pure aggregation over Intelligence contracts
- [Intelligence vs Operations separation](mem://constraints/intelligence-vs-operations) — Permanent rule: Intelligence produces decisions, Operations execute decisions
- [Platform v1.0 manifest](mem://constraints/platform-v1-manifest) — Frozen layers, allowed changes, future track boundaries, stabilization cycle
- [Experience layers — presentation only](mem://constraints/experience-layers) — Admin / Vendor / Customer / Mobile share the same frozen contracts; never fork scoring or intelligence
- [Composition-first contracts](mem://constraints/composition-first) — Compose existing contracts before introducing new ones; prevents contract sprawl
- [Publish is presentation over Marketplace Readiness](mem://constraints/publish-presentation-only) — Publish surfaces present readiness; they never add validation, scoring, or duplicate checks
