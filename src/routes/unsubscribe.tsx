import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/unsubscribe')({
  component: UnsubscribePage,
  head: () => ({
    meta: [
      { title: 'Unsubscribe — FoundOurMarket™' },
      {
        name: 'description',
        content: 'Manage your FoundOurMarket™ email preferences and unsubscribe.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
})

type State =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'already' }
  | { kind: 'invalid' }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'error' }

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('token')
}

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const token = typeof window !== 'undefined' ? getToken() : null

  useEffect(() => {
    let active = true
    if (!token) {
      setState({ kind: 'invalid' })
      return
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return
        if (data?.valid) setState({ kind: 'ready' })
        else if (data?.reason === 'already_unsubscribed') setState({ kind: 'already' })
        else setState({ kind: 'invalid' })
      })
      .catch(() => active && setState({ kind: 'error' }))
    return () => {
      active = false
    }
  }, [token])

  async function confirm() {
    if (!token) return
    setState({ kind: 'submitting' })
    try {
      const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data?.success) setState({ kind: 'done' })
      else if (data?.reason === 'already_unsubscribed') setState({ kind: 'already' })
      else setState({ kind: 'error' })
    } catch {
      setState({ kind: 'error' })
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary">
          FoundOurMarket™
        </p>
        <h1 className="mt-4 text-2xl font-bold text-foreground">Email preferences</h1>

        {state.kind === 'loading' && (
          <p className="mt-4 text-sm text-muted-foreground">Checking your link…</p>
        )}

        {state.kind === 'ready' && (
          <>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Click below to unsubscribe this address from FoundOurMarket™ emails. You'll
              stop receiving marketing and update emails.
            </p>
            <button
              onClick={confirm}
              className="mt-6 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Unsubscribe me
            </button>
          </>
        )}

        {state.kind === 'submitting' && (
          <p className="mt-4 text-sm text-muted-foreground">Processing…</p>
        )}

        {state.kind === 'done' && (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            You've been unsubscribed. We're sorry to see you go — you can always sign back
            up from your account settings.
          </p>
        )}

        {state.kind === 'already' && (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            This address is already unsubscribed. No further action is needed.
          </p>
        )}

        {state.kind === 'invalid' && (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            This unsubscribe link is invalid or has expired. Please use the link from a
            recent email.
          </p>
        )}

        {state.kind === 'error' && (
          <p className="mt-4 text-sm leading-relaxed text-destructive">
            Something went wrong. Please try again in a moment.
          </p>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          Need help? Email{' '}
          <a href="mailto:foundourmarket@gmail.com" className="text-primary underline">
            foundourmarket@gmail.com
          </a>
        </p>
      </div>
    </main>
  )
}
