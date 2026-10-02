import { useCallback, useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { z } from 'zod'
import { Lock } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { SiteHeader } from '@/components/site-header'
import { eur } from '@/lib/shop'
import siteMetadata from '../metadata.json'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!)

export const Route = createFileRoute('/checkout')({
  validateSearch: z.object({ t: z.string().min(20).max(64) }),
  head: () => ({ meta: [{ title: siteMetadata['/checkout'].title }, { name: 'robots', content: 'noindex' }] }),
  component: CheckoutPage,
})

function CheckoutPage() {
  const { t } = Route.useSearch()
  const order = useQuery(api.orders.track, { token: t })
  const createSession = useAction(api.stripe.createCheckoutSession)
  const confirm = useAction(api.stripe.confirmLatest)
  const navigate = useNavigate()
  const [round, setRound] = useState(0)
  const [part, setPart] = useState<{ part: 'tr' | 'cb'; amount: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchClientSecret = useCallback(async () => {
    const r = await createSession({ token: t })
    if (!r.ok) { setError(r.message); throw new Error(r.message) }
    setPart({ part: r.part, amount: r.amount })
    return r.clientSecret
  }, [createSession, t])

  const onComplete = useCallback(async () => {
    const r = await confirm({ token: t }).catch(() => ({ paid: true, remaining: false }))
    if (r.remaining) { setPart(null); setRound((x) => x + 1); return }
    navigate({ to: '/suivi/$token', params: { token: t } })
  }, [confirm, navigate, t])

  // Dès que le paiement est confirmé (webhook ou retour Stripe), on ouvre le suivi
  useEffect(() => {
    if (order && order.status !== 'attente_paiement') navigate({ to: '/suivi/$token', params: { token: t }, replace: true })
  }, [order, navigate, t])

  if (order === null) return <Shell><p>Commande introuvable.</p></Shell>
  if (order && order.status !== 'attente_paiement') {
    return <Shell><p className="mb-4">Cette commande est déjà réglée.</p><Link to="/suivi/$token" params={{ token: t }} className="font-bold text-primary underline">Voir le suivi</Link></Shell>
  }

  const isTr = (order?.montantTr ?? 0) > 0
  return (
    <Shell>
      <div className="mb-4 rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Commande {order?.num}</p>
        <p className="text-2xl font-extrabold">{order ? eur(order.total) : '…'}</p>
        {isTr && order && (
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Step n={1} done={order.paidTr >= order.montantTr} active={part?.part === 'tr'} label={`Part titre-restaurant : ${eur(order.montantTr)}`} hint="Utilisez votre carte titre-restaurant" />
            <Step n={2} done={false} active={part?.part === 'cb'} label={`Complément carte bancaire : ${eur(order.montantCb)}`} hint={order.montantCb > 0 ? 'Avec votre carte bancaire habituelle' : 'Rien à payer'} />
          </ol>
        )}
        {part && <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-sm font-semibold">À payer maintenant : {eur(part.amount)} {part.part === 'tr' ? '(carte titre-restaurant)' : '(carte bancaire)'}</p>}
      </div>
      {error && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <EmbeddedCheckoutProvider key={round} stripe={stripePromise} options={{ fetchClientSecret, onComplete }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" /> Paiement chiffré par Stripe. Vos données de carte ne passent jamais par notre site.</p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen"><SiteHeader compact /><main className="mx-auto max-w-2xl px-4 py-6"><h1 className="mb-4 text-3xl font-extrabold">Paiement sécurisé</h1>{children}</main></div>
}
function Step({ n, done, active, label, hint }: { n: number; done: boolean; active: boolean; label: string; hint: string }) {
  return (
    <li className={`rounded-xl border p-3 ${active ? 'border-primary bg-primary/5' : ''} ${done ? 'bg-success-soft' : ''}`}>
      <p className="font-bold">{done ? '✓' : n}. {label}</p><p className="text-xs text-muted-foreground">{hint}</p>
    </li>
  )
}
