import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { toast } from 'sonner'
import { Gift, Star } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { SiteHeader } from '@/components/site-header'
import { SignInForm } from '@/components/sign-in'
import { InstallApp } from '@/components/install-app'
import { REWARD_POINTS, REWARD_VALUE, STATUS_LABEL, eur } from '@/lib/shop'

export const Route = createFileRoute('/compte')({
  head: () => ({ meta: [{ title: 'Mon compte – Loulou Barquette' }, { name: 'robots', content: 'noindex' }] }),
  component: AccountPage,
})

function AccountPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader compact />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <AuthLoading><p className="py-10 text-center text-muted-foreground">Chargement…</p></AuthLoading>
        <Unauthenticated>
          <div className="grid gap-6 md:grid-cols-2">
            <SignInForm title="Mon compte" intro="Créez votre compte ou connectez-vous avec votre adresse e-mail : vous recevez un code à 6 chiffres, sans mot de passe à retenir." />
            <div className="space-y-3 rounded-2xl border bg-card p-6 text-sm">
              <h2 className="flex items-center gap-2 text-xl font-extrabold"><Gift className="size-5 text-primary" /> Avec un compte</h2>
              <p>Vos coordonnées et votre quartier sont préremplis à chaque commande.</p>
              <p>Vous retrouvez toutes vos commandes et leur suivi, sur tous vos appareils.</p>
              <p>Vous cumulez <b>1 point par euro</b> dépensé, crédité à chaque commande livrée ou récupérée. À <b>{REWARD_POINTS} points</b>, vous obtenez <b>{eur(REWARD_VALUE)} de réduction</b>.</p>
              <p className="text-muted-foreground">Un compte est nécessaire pour commander en ligne.</p>
            </div>
          </div>
        </Unauthenticated>
        <Authenticated><Account /></Authenticated>
      </main>
    </div>
  )
}

function Account() {
  const me = useQuery(api.customers.me, {})
  const orders = useQuery(api.customers.myOrders, {})
  const zones = useQuery(api.menu.publicData, {})?.zones
  const update = useMutation(api.customers.updateProfile)
  const del = useMutation(api.customers.deleteMyAccount)
  const { signOut } = useAuthActions()
  const [f, setF] = useState({ name: '', phone: '', defaultZone: '', defaultAddress: '' })
  const [loaded, setLoaded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (me && !loaded) { setF({ name: me.name, phone: me.phone, defaultZone: me.defaultZone, defaultAddress: me.defaultAddress }); setLoaded(true) }
  }, [me, loaded])

  if (me === undefined) return <p className="py-10 text-center text-muted-foreground">Chargement…</p>
  if (!me) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Bienvenue{me.name ? `, ${me.name.split(' ')[0]}` : ''}</h1>
          <p className="text-sm text-muted-foreground">{me.email}</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 font-bold text-accent-foreground">
          <Star className="size-5" /> Vous avez {me.points} point{me.points > 1 ? 's' : ''}
        </div>
      </div>
      <InstallApp />
      <div className="rounded-2xl border bg-card p-4 text-sm">
        <div className="mb-2 flex justify-between font-semibold"><span>Prochaine réduction de {eur(REWARD_VALUE)}</span><span>{Math.min(me.points, REWARD_POINTS)} / {REWARD_POINTS}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (me.points / REWARD_POINTS) * 100)}%` }} /></div>
        <p className="mt-2 text-xs text-muted-foreground">{me.points >= REWARD_POINTS ? 'Votre réduction est disponible : cochez-la dans votre panier.' : `Encore ${REWARD_POINTS - me.points} points. 1 point par euro, crédité à chaque commande livrée ou récupérée.`}</p>
      </div>

      <form onSubmit={async (e) => { e.preventDefault(); const r = await update({ ...f, defaultZone: f.defaultZone || undefined }); if (r.ok) toast.success('Profil enregistré'); else toast.error(r.message) }} className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="text-xl font-extrabold">Mes coordonnées</h2>
        <p className="text-sm text-muted-foreground">Elles préremplissent votre panier. Seul le restaurant et votre livreur les voient, pour votre commande.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block font-semibold">Nom</span><input required minLength={2} maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
          <label className="text-sm"><span className="mb-1 block font-semibold">Téléphone</span><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="0639 XX XX XX" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
          <label className="text-sm"><span className="mb-1 block font-semibold">Quartier habituel</span>
            <select value={f.defaultZone} onChange={(e) => setF({ ...f, defaultZone: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2">
              <option value="">—</option>
              {zones?.map((z) => <option key={z.name} value={z.name}>{z.name} ({eur(z.fee)})</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="mb-1 block font-semibold">Adresse ou repère</span><input maxLength={200} value={f.defaultAddress} onChange={(e) => setF({ ...f, defaultAddress: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">Enregistrer</button>
          <Link to="/" hash="panier" className="rounded-lg border px-4 py-2 font-semibold">Commander</Link>
        </div>
      </form>

      <section id="commandes" className="rounded-2xl border bg-card p-5">
        <h2 className="mb-3 text-xl font-extrabold">Mes commandes</h2>
        {orders === undefined ? <p className="text-muted-foreground">Chargement…</p> : orders.length === 0 ? (
          <p className="text-muted-foreground">Aucune commande pour l'instant.</p>
        ) : (
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o.token}>
                <Link to="/suivi/$token" params={{ token: o.token }} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-primary">
                  <span><b>{o.num}</b> · {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {o.items} article{o.items > 1 ? 's' : ''}</span>
                  <span className="text-sm">{eur(o.total)} · {STATUS_LABEL[o.status]}{o.points ? ` · +${o.points} pts` : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button onClick={() => void signOut()} className="rounded-lg border px-4 py-2 font-semibold">Se déconnecter</button>
        {!me.isStaff && (confirmDelete
          ? <button onClick={async () => { const r = await del({}); if (r.ok) { toast.success('Compte supprimé'); void signOut() } else toast.error(r.message) }} className="rounded-lg bg-destructive px-4 py-2 font-bold text-destructive-foreground">Confirmer la suppression définitive</button>
          : <button onClick={() => setConfirmDelete(true)} className="text-muted-foreground underline">Supprimer mon compte</button>)}
      </div>
    </div>
  )
}
