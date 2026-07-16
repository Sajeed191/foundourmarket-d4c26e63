---
name: Badge System v3 (FROZEN)
description: Single-badge card rule, per-label color identity in one capsule system, backdrop blur + soft shadow, min/max width, concise labels
---

# Badge System v3 — FROZEN

Every product card renders exactly ONE marketing badge. AI drives the existing badge system rather than adding new AI-specific pills.

## Guiding rule (permanent)

> Marketing badges identify ONE reason to notice a product — not every reason to buy it.

## Determinism (permanent rule)

- For the same product state, `pickWinningBadge(product)` MUST return the same result across every surface.
- A section may override that result via `forceBadge` (Flash Deals, Trending, Best Sellers, New Arrivals).
- No component may implement its own badge selection logic. All card-badge choices flow through `pickWinningBadge` in `src/components/site/ProductCard.tsx`.

## Priority ladder (single source)

```
Flash Deal / Hot Deal → Best Seller → Trending → New Arrival →
Recommended → Best Value → Popular
```

Labels outside this ladder (Premium, Featured, Editor's Choice, Staff Pick, Gift Idea, Fast Selling, Limited Stock) are computed for admin/analytics but never render on the card image.

## Visual system (v3)

One capsule shape, one type treatment, per-label color identity:

- Capsule: 28–30px tall, fully rounded, 12–14px horizontal padding
- Type: 11–12px, weight 600, uppercase, 0.5px tracking
- Width: `min-w-[72px] max-w-[140px]`, auto-size to text — never fixed
- Backdrop: `backdrop-filter: blur(8px) saturate(140%)` on every pill for legibility over any image
- Shadow: `0 4px 12px rgba(0,0,0,0.18)` (Flash Deal adds a small orange glow)
- Entrance: 150ms fade + slide-down + zoom-in-95, no pulse, no bounce
- No emoji. No gradients. No thick borders.

### Palette (label → color)

| Label        | Background | Text     |
|--------------|-----------:|---------:|
| FLASH DEAL   | `#FF6A00`  | `#111`   |
| HOT DEAL     | `#C2410C`  | `#FFF`   |
| BEST SELLER  | `#C9A24A`  | `#1A1A1A`|
| TRENDING     | `#1E3A8A`  | `#FFF`   |
| NEW          | `#059669`  | `#FFF`   |
| RECOMMENDED  | `#4F46E5`  | `#FFF`   |
| BEST VALUE   | `#7C3AED`  | `#FFF`   |
| POPULAR      | `#0D9488`  | `#FFF`   |

### Label copy

Use the concise forms above. Prefer `POPULAR` over `POPULAR CHOICE` on cards. `BESTSELLER`, `NEW ARRIVAL`, `FLASH SALE`, and `POPULAR CHOICE` are accepted aliases that map to the same palette.

## Placement

- Marketing badge: top-left, inside the card image area.
- Ready to Ship: check-row under price — NEVER on the image.
- `-%` discount pill: stays a no-op sitewide.
- "Why?" popover: the badge itself is the trigger on intelligence-driven surfaces (one plain sentence). Section-forced badges are presentation-only.

## Data flow (canonical path)

```
Marketplace Intelligence → Recommendation Broker → pickWinningBadge() → ProductCard / BrowseCard
```

BrowseCard is a thin wrapper that passes `presentation.badges` and `presentation.reason` into ProductCard; it never picks a badge itself.

## Future work (not scheduled)

Badge Registry — one source of truth for label/icon/color/priority/sectionOnly per badge key. Enables localization, seasonal overrides, and marketing-as-config. Only pursue if the badge catalog materially grows.
