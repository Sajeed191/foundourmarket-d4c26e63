import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { CheckCircle2, XCircle, Clock, MailCheck } from 'lucide-react'

export const Route = createFileRoute('/newsletter/verified')({
  component: NewsletterVerified,
  head: () => ({
    meta: [
      { title: 'Newsletter — FoundOurMarket' },
      { name: 'description', content: 'Confirmation status for your newsletter subscription.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
})

type State = 'ok' | 'expired' | 'invalid' | 'already'

function NewsletterVerified() {
  const state = (useMemo(() => {
    if (typeof window === 'undefined') return 'ok'
    const s = new URLSearchParams(window.location.search).get('state') as State | null
    return (['ok', 'expired', 'invalid', 'already'] as const).includes(s as State)
      ? (s as State)
      : 'invalid'
  }, [])) as State

  const view = {
    ok: {
      icon: <CheckCircle2 className="size-10 text-emerald-400" />,
      title: "You're in.",
      body: 'Your subscription is confirmed. Expect drops, deals, and market picks in your inbox.',
    },
    already: {
      icon: <MailCheck className="size-10 text-emerald-400" />,
      title: 'Already confirmed',
      body: "You've already confirmed this subscription. Nothing more to do.",
    },
    expired: {
      icon: <Clock className="size-10 text-amber-400" />,
      title: 'Link expired',
      body: 'This confirmation link has expired. Subscribe again from the site and we\'ll send a fresh one.',
    },
    invalid: {
      icon: <XCircle className="size-10 text-rose-400" />,
      title: 'Invalid link',
      body: "This confirmation link isn't valid. It may have been used already or copied incompletely.",
    },
  }[state]

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center rounded-2xl border border-white/10 bg-white/[0.02] p-8">
        <div className="mx-auto mb-4 flex items-center justify-center">{view.icon}</div>
        <h1 className="text-xl font-semibold mb-2">{view.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{view.body}</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-xs font-bold uppercase tracking-widest text-accent-foreground"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}
