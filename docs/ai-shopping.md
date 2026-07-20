# AI Shopping Assistant

FoundOurMarket™ AI Shopping Assistant — a shopping-only concierge integrated
into the Communication Hub. Version: **v1.1 (Production Hardened)**.

## Architecture

```
LiveChat orb ──► CommunicationHub ──► AiShoppingAssistant (lazy)
                                        │
                                        ├─► ConversationStore (interface)
                                        │     └─ LocalStorageConversationStore (v1.1)
                                        │        └─ (future) DatabaseConversationStore
                                        │
                                        └─► POST /api/ai-shopping
                                              └─► Lovable AI Gateway
                                                    + tool calls (search / get / compare)
                                                    → src/lib/ai-shopping/tools.server.ts
                                                       └─ Supabase (public catalog)
```

Key files:
- `src/components/chat/AiShoppingAssistant.tsx` — chat UI (mobile-first).
- `src/components/chat/AiShoppingMount.tsx` — lazy mount gate.
- `src/components/chat/CommunicationHub.tsx` — Support vs AI chooser sheet.
- `src/lib/ai-shopping/conversation-store.ts` — storage abstraction.
- `src/lib/ai-shopping/storage.ts` — localStorage implementation details.
- `src/lib/ai-shopping/tools.server.ts` — catalog lookup tools.
- `src/routes/api/ai-shopping.ts` — server route calling the AI Gateway.

## Storage abstraction

The Assistant depends on `ConversationStore` only. Two implementations:

| Implementation                    | Status  | Scope                                    |
| --------------------------------- | ------- | ---------------------------------------- |
| `LocalStorageConversationStore`   | Active  | Browser-only, on-device history.         |
| `DatabaseConversationStore`       | Planned | Lovable Cloud, cross-device sync + RLS.  |

**Migration path:** to move to a database-backed store, implement the
`ConversationStore` interface against Lovable Cloud (thread + message tables
scoped by `auth.uid()`), then swap the `conversationStore` export in
`src/lib/ai-shopping/conversation-store.ts`. **No UI or AI logic changes
should be required.**

## Scope — Marketplace only

The Assistant is a **shopping specialist**, not a general chatbot.

### Supported
- Find products in the FoundOurMarket™ catalog
- Compare products
- Recommend gifts / bundles / budget picks
- Explain specifications and compatibility
- Shopping advice

### Not supported (politely declined)
- Medical, legal, financial advice
- Programming / homework / general knowledge
- Politics, current events, personal opinions
- Anything unrelated to shopping

### Handed off to Customer Support
- Order status, tracking, delivery ETAs
- Returns, refunds, replacements
- Account / login / payment issues

Support requests trigger an in-line **Switch to Customer Support** hand-off
in the Assistant header.

## Communication Hub

A single floating orb opens the Hub bottom sheet, which chooses between:
- ✨ **AI Shopping Assistant** (this doc)
- 💬 **Customer Support** (existing Crisp workflow)

The last choice is remembered per-session; subsequent orb taps open the
preferred surface directly. Users can switch between surfaces from either
header. Neither surface answers the other's questions.

## Product recommendations

- Recommendations are drawn **only** from the FoundOurMarket™ catalog via
  the server-side tools (`search_products`, `get_product`, `compare_products`).
- The AI is instructed never to invent products, prices, or specs.
- When nothing matches, the AI says so honestly and offers an adjacent query.

## Error handling

The Assistant handles all failure modes with friendly, non-technical messages:

| Failure          | User-facing behavior                                        |
| ---------------- | ----------------------------------------------------------- |
| AI timeout       | "I couldn't reach the AI service just now…" (retry hint)    |
| Network offline  | Same friendly retry message + toast                         |
| Empty catalog    | Assistant explains honestly, suggests adjacent queries      |
| Rate limit (429) | "AI is busy right now — please try again in a moment."      |
| Credits (402)    | Surfaced to admin; end-user sees generic busy message       |

Raw errors, stack traces, and gateway internals are never shown to the user.

## Privacy

- Conversation history is stored **on-device only** in v1.1.
- No passwords, OTPs, payment details, or sensitive PII are stored.
- No server-side logging of conversation content in the app layer.

## Performance

- Assistant code is **lazy-loaded** — the Hub triggers dynamic import only
  when the user picks AI Shopping.
- `AiShoppingMount` keeps the always-on listener footprint minimal.
- No additional startup cost vs. the pre-Hub baseline.

## Versioning

- **v1.0** — Initial ship: Hub, threaded chat, localStorage, tool loop.
- **v1.1** — Production hardening: `ConversationStore` abstraction,
  strict marketplace-only scope, explicit support hand-off, refined error
  handling, this documentation.
