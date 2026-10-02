import { useEffect, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { AlertTriangle, Clock, Euro, ShoppingBag, Tablet } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { DAY_NAMES } from '@/convex/shared'
import { eur } from '@/lib/shop'
import { STATUS, dateTime, run, time, useKtArgs, useSoundSetting, useTeam } from '@/lib/team'
import { InstallApp } from '@/components/install-app'
import { TeamAdmin } from './team-admin'
import { PosAdmin } from './pos-admin'
import type { Page } from './shell'

const card = 'rounded-2xl bg-background p-5'

// ---------- Vue d'ensemble (responsable)
export function OverviewPage({ go }: { go: (p: Page) => void }) {
  const stats = useQuery(api.orders.stats, {})
  const list = useQuery(api.orders.staffList, {})
  if (!stats || !stats.ok) return <p className="py-16 text-center text-muted-foreground">Chargement…</p>
  const problems = list && list.ok ? list.active.filter((o) => o.problems?.length) : []
  const waiting = list && list.ok ? list.active.filter((o) => o.status === 'recue').length : 0
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Vue d'ensemble</h1>
      <p className="mt-1 text-muted-foreground">Aujourd'hui, en temps réel. Ces chiffres ne sont visibles que par le responsable.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={ShoppingBag} label="Commandes" value={String(stats.count)} sub={`${stats.cancelled} annulée(s)`} />
        <Kpi icon={Euro} label="Chiffre du jour" value={eur(stats.revenue)} sub={`dont ${eur(stats.online)} payés en ligne`} />
        <Kpi icon={Clock} label="Préparation moyenne" value={stats.avgPrep !== null ? `${stats.avgPrep} min` : '—'} sub="de l'acceptation à « prête »" />
        <Kpi icon={AlertTriangle} label="À accepter" value={String(waiting)} sub={`${problems.length} problème(s) signalé(s)`} onClick={() => go('commandes')} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-bold">Répartition</h2>
          <p className="mt-2 text-sm">Livraison : <b>{stats.byMode.livraison}</b> · À emporter : <b>{stats.byMode.emporter}</b> · Sur place : <b>{stats.byMode.surplace}</b></p>
          <p className="mt-1 text-sm">À encaisser sur place : <b>{eur(stats.toCollect)}</b> · Titres-restaurant : <b>{eur(stats.tr)}</b> · Frais de livraison : <b>{eur(stats.delivery)}</b></p>
        </section>
        <section className={card}>
          <h2 className="font-bold">Problèmes signalés</h2>
          {problems.length ? problems.map((o) => <p key={o._id} className="mt-2 text-sm"><b>#{o.num}</b> : {o.problems!.at(-1)!.type} · {o.problems!.at(-1)!.message} <span className="text-muted-foreground">({o.problems!.at(-1)!.by})</span></p>) : <p className="mt-2 text-sm text-muted-foreground">Aucun problème en cours.</p>}
        </section>
      </div>
    </div>
  )
}
function Kpi({ icon: Icon, label, value, sub, onClick }: { icon: typeof Clock; label: string; value: string; sub: string; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div'
  return <C onClick={onClick} className={`${card} text-left`}><Icon className="size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{sub}</p></C>
}

// ---------- Horaires et service (responsable)
export function HoursPage() {
  const res = useQuery(api.shop.settings, {})
  const update = useMutation(api.shop.update)
  const [hours, setHours] = useState<({ open: string; close: string } | null)[] | null>(null)
  const [prep, setPrep] = useState(20)
  useEffect(() => { if (res && res.ok && !hours) { setHours(res.settings.hours); setPrep(res.settings.prepMinutes) } }, [res, hours])
  if (!res || !res.ok || !hours) return <p className="py-16 text-center text-muted-foreground">Chargement…</p>
  const s = res.settings
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold sm:text-4xl">Horaires et service</h1>
      <p className="mt-1 text-muted-foreground">Le site refuse automatiquement les commandes en dehors de ces horaires, même si quelqu'un contourne l'écran.</p>
      <section className={`${card} mt-5 space-y-4`}>
        <ToggleRow label="Prise de commandes en ligne" hint={s.open ? 'Ouverte selon les horaires' : 'Fermée : aucune commande acceptée'} on={s.open} onChange={() => run(update({ open: !s.open }), s.open ? 'Commandes fermées' : 'Commandes ouvertes')} />
        <ToggleRow label="Acceptation automatique" hint="Les commandes payées passent directement en préparation, avec le délai ci-dessous." on={s.autoAccept} onChange={() => run(update({ autoAccept: !s.autoAccept }), s.autoAccept ? 'Acceptation manuelle' : 'Acceptation automatique activée')} />
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run(update({ prepMinutes: prep }), 'Délai enregistré') }}>
          <label className="text-sm font-semibold">Délai de préparation par défaut<span className="mt-1 flex items-center gap-2"><input type="number" min={5} max={120} value={prep} onChange={(e) => setPrep(Number(e.target.value))} className="w-24 rounded-xl border px-3 py-2" /> minutes</span></label>
          <button className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">Enregistrer</button>
        </form>
      </section>
      <section className={`${card} mt-4`}>
        <h2 className="text-lg font-bold">Horaires habituels</h2>
        <div className="mt-3 divide-y">
          {order.map((d) => {
            const h = hours[d]
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-24 font-semibold capitalize">{DAY_NAMES[d]}</span>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!h} onChange={(e) => setHours(hours.map((x, i) => (i === d ? (e.target.checked ? { open: '09:00', close: '16:00' } : null) : x)))} className="size-4" /> Ouvert</label>
                {h && <>
                  <input type="time" value={h.open} onChange={(e) => setHours(hours.map((x, i) => (i === d ? { ...h, open: e.target.value } : x)))} className="rounded-lg border px-2 py-1" aria-label={`Ouverture ${DAY_NAMES[d]}`} />
                  <span>à</span>
                  <input type="time" value={h.close} onChange={(e) => setHours(hours.map((x, i) => (i === d ? { ...h, close: e.target.value } : x)))} className="rounded-lg border px-2 py-1" aria-label={`Fermeture ${DAY_NAMES[d]}`} />
                </>}
              </div>
            )
          })}
        </div>
        <button onClick={() => run(update({ hours }), 'Horaires enregistrés', 'Enregistrement…')} className="mt-3 rounded-full bg-foreground px-5 py-2.5 font-semibold text-background">Enregistrer les horaires</button>
        <p className="mt-2 text-xs text-muted-foreground">Fermeture exceptionnelle : utilisez « Fermer le restaurant » et ajoutez une annonce dans « Modifier le site ».</p>
      </section>
    </div>
  )
}
function ToggleRow({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1"><p className="font-semibold">{label}</p><p className="text-sm text-muted-foreground">{hint}</p></div>
      <button role="switch" aria-checked={on} aria-label={label} onClick={onChange} className={`relative h-8 w-14 shrink-0 rounded-full ${on ? 'bg-emerald-600' : 'bg-input'}`}><span className={`absolute top-1 size-6 rounded-full bg-background shadow transition-[left] ${on ? 'left-7' : 'left-1'}`} /></button>
    </div>
  )
}

// ---------- Paiements (responsable)
export function PaymentsPage() {
  const stats = useQuery(api.orders.stats, {})
  if (!stats || !stats.ok) return <p className="py-16 text-center text-muted-foreground">Chargement…</p>
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Paiements</h1>
      <p className="mt-1 text-muted-foreground">Encaissements du jour. Les remboursements et versements se gèrent dans l'onglet Paiements de Macaly (compte de paiement du restaurant).</p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Euro} label="Total du jour" value={eur(stats.revenue)} sub={`${stats.count} commande(s)`} />
        <Kpi icon={Euro} label="Payé en ligne" value={eur(stats.online)} sub="carte et titres-restaurant" />
        <Kpi icon={Euro} label="Titres-restaurant" value={eur(stats.tr)} sub="inclus dans « payé en ligne »" />
        <Kpi icon={Euro} label="À encaisser" value={eur(stats.toCollect)} sub="sur place ou à la livraison" />
      </div>
      <ul className="mt-4 divide-y overflow-hidden rounded-2xl bg-background">
        {stats.orders.map((o) => (
          <li key={o._id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="w-20 font-bold">#{o.num}</span>
            <span className="w-14 text-muted-foreground">{time(o.at)}</span>
            <span className="flex-1">{o.payMethod === 'place' ? 'À encaisser' : o.payMethod === 'tr' ? `Titre-resto ${o.emetteurTr ?? ''} ${eur(o.paidTr)} + carte ${eur(o.paidCb)}` : `Carte ${eur(o.paidCb)}`}</span>
            <span className="text-xs">{STATUS[o.status].label}</span>
            <span className="w-20 text-right font-semibold">{eur(o.total)}</span>
          </li>
        ))}
        {!stats.orders.length && <li className="p-6 text-center text-muted-foreground">Aucun paiement aujourd'hui.</li>}
      </ul>
    </div>
  )
}

// ---------- Paramètres (responsable)
export function SettingsPage() {
  const [tab, setTab] = useState<'cuisine' | 'comptes' | 'caisse' | 'historique'>('cuisine')
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Paramètres</h1>
      <div className="mt-5 flex flex-wrap gap-2" role="tablist">
        {([['cuisine', 'Accès cuisine et employés'], ['comptes', 'Comptes personnels'], ['caisse', 'Caisse'], ['historique', 'Historique des actions']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-foreground text-background' : 'bg-background'}`}>{l}</button>
        ))}
      </div>
      <div className="mt-5">
        {tab === 'cuisine' && <KitchenSettings />}
        {tab === 'comptes' && <div className={card}><p className="mb-4 text-sm text-muted-foreground">Comptes individuels (téléphone personnel) : responsable, équipe, livreurs. Connexion par code e-mail. Retirer un compte ferme ses sessions sans déconnecter la cuisine.</p><TeamAdmin /></div>}
        {tab === 'caisse' && <PosAdmin />}
        {tab === 'historique' && <AuditPage />}
      </div>
    </div>
  )
}

function KitchenSettings() {
  const res = useQuery(api.access.kitchenConfig, {})
  const setAccess = useAction(api.access.setKitchenAccess)
  const revoke = useMutation(api.access.revokeSession)
  const saveEmp = useAction(api.access.saveEmployee)
  const setActive = useMutation(api.access.setEmployeeActive)
  const [login, setLogin] = useState('')
  const [pwd, setPwd] = useState('')
  const [emp, setEmp] = useState({ prenom: '', pin: '' })
  const [resetFor, setResetFor] = useState<{ id: Id<'employees'>; prenom: string } | null>(null)
  const [newPin, setNewPin] = useState('')
  useEffect(() => { if (res && res.ok && !login) setLogin(res.login || 'Cuisine Loulou Barquette') }, [res, login])
  if (!res || !res.ok) return <p className="text-muted-foreground">Chargement…</p>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h2 className="text-lg font-bold">Accès cuisine partagé</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pour la tablette ou l'ordinateur du restaurant. Cet accès ne donne aucun droit responsable (pas de prix, finances ni paramètres).</p>
        <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run(setAccess({ login, password: pwd }), res.configured ? 'Accès modifié : les appareils doivent se reconnecter' : 'Accès cuisine créé', 'Sécurisation du mot de passe…'); if (r?.ok) setPwd('') }}>
          <label className="block text-sm font-semibold">Identifiant équipe<input value={login} onChange={(e) => setLogin(e.target.value)} required minLength={3} maxLength={60} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
          <label className="block text-sm font-semibold">{res.configured ? 'Nouveau mot de passe équipe' : 'Mot de passe équipe'}<input value={pwd} onChange={(e) => setPwd(e.target.value)} type="password" required minLength={10} autoComplete="new-password" className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
          <p className="text-xs text-muted-foreground">10 caractères minimum. Changer le mot de passe déconnecte tous les appareils cuisine.</p>
          <button className="rounded-full bg-foreground px-5 py-2.5 font-semibold text-background">{res.configured ? 'Changer le mot de passe' : "Créer l'accès cuisine"}</button>
        </form>
        <h3 className="mt-6 font-bold">Appareils connectés ({res.sessions.length})</h3>
        <ul className="mt-2 space-y-2">
          {res.sessions.map((s) => (
            <li key={s._id} className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2 text-sm">
              <Tablet className="size-5 text-muted-foreground" />
              <span className="flex-1">{s.label}<span className="block text-xs text-muted-foreground">connecté le {dateTime(s.since)}</span></span>
              <button onClick={() => run(revoke({ sessionId: s._id }), 'Appareil déconnecté')} className="rounded-lg border bg-background px-3 py-1.5 font-semibold">Déconnecter</button>
            </li>
          ))}
          {!res.sessions.length && <li className="text-sm text-muted-foreground">Aucun appareil connecté.</li>}
        </ul>
        {res.sessions.length > 1 && <button onClick={() => run(revoke({}), 'Tous les appareils sont déconnectés')} className="mt-3 text-sm font-semibold text-destructive">Déconnecter tous les appareils</button>}
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">Employés</h2>
        <p className="mt-1 text-sm text-muted-foreground">Chaque employé prend son service avec son prénom et un code personnel (4 à 6 chiffres). Ses actions sont enregistrées à son nom. 5 erreurs bloquent le code 15 minutes.</p>
        <ul className="mt-4 space-y-2">
          {res.employees.map((e) => (
            <li key={e._id} className={`flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm ${e.active ? '' : 'opacity-60'}`}>
              <span className="grid size-8 place-items-center rounded-full bg-foreground text-xs font-bold text-background">{e.prenom[0]}</span>
              <span className="flex-1 font-semibold">{e.prenom}{e.locked ? ' · code bloqué' : ''}{!e.active ? ' · accès retiré' : ''}</span>
              <button onClick={() => { setResetFor({ id: e._id, prenom: e.prenom }); setNewPin('') }} className="rounded-lg border bg-background px-2.5 py-1.5 font-semibold">Nouveau code</button>
              <button onClick={() => run(setActive({ employeeId: e._id, active: !e.active }), e.active ? `Accès de ${e.prenom} retiré` : `${e.prenom} réactivé`)} className="rounded-lg border bg-background px-2.5 py-1.5 font-semibold">{e.active ? 'Retirer' : 'Réactiver'}</button>
            </li>
          ))}
        </ul>
        {resetFor && (
          <form className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border p-3" onSubmit={async (e) => { e.preventDefault(); const r = await run(saveEmp({ employeeId: resetFor.id, prenom: resetFor.prenom, pin: newPin }), `Nouveau code pour ${resetFor.prenom}`, 'Sécurisation du code…'); if (r?.ok) setResetFor(null) }}>
            <label className="text-sm font-semibold">Nouveau code de {resetFor.prenom}<input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" required minLength={4} className="mt-1 block w-32 rounded-xl border px-3 py-2 tracking-widest" /></label>
            <button className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">Enregistrer</button>
            <button type="button" onClick={() => setResetFor(null)} className="px-2 py-2 text-sm">Annuler</button>
          </form>
        )}
        <form className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4" onSubmit={async (e) => { e.preventDefault(); const r = await run(saveEmp({ prenom: emp.prenom, pin: emp.pin }), `${emp.prenom} ajouté`, 'Sécurisation du code…'); if (r?.ok) setEmp({ prenom: '', pin: '' }) }}>
          <label className="text-sm font-semibold">Prénom<input value={emp.prenom} onChange={(e) => setEmp({ ...emp, prenom: e.target.value })} required maxLength={30} className="mt-1 block w-40 rounded-xl border px-3 py-2" /></label>
          <label className="text-sm font-semibold">Code (4 à 6 chiffres)<input value={emp.pin} onChange={(e) => setEmp({ ...emp, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" required minLength={4} className="mt-1 block w-32 rounded-xl border px-3 py-2 tracking-widest" /></label>
          <button className="rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background">Ajouter l'employé</button>
        </form>
      </section>
    </div>
  )
}

function AuditPage() {
  const res = useQuery(api.access.auditList, { limit: 300 })
  if (!res || !res.ok) return <p className="text-muted-foreground">Chargement…</p>
  return (
    <div className="overflow-x-auto rounded-2xl bg-background">
      <p className="px-4 pt-4 text-sm text-muted-foreground">Les 300 dernières actions. L'historique n'est jamais modifié ni supprimé par l'application.</p>
      <table className="mt-2 w-full min-w-[640px] text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="px-4 py-2 font-medium">Quand</th><th className="px-4 py-2 font-medium">Qui</th><th className="px-4 py-2 font-medium">Action</th><th className="px-4 py-2 font-medium">Détail</th></tr></thead>
        <tbody>{res.rows.map((r) => (
          <tr key={r._id} className="border-t align-top">
            <td className="whitespace-nowrap px-4 py-2">{dateTime(r._creationTime)}</td>
            <td className="px-4 py-2">{r.actor}</td>
            <td className="px-4 py-2 font-semibold">{r.action}{r.orderNum ? ` #${r.orderNum}` : ''}</td>
            <td className="px-4 py-2 text-muted-foreground">{[r.detail, r.motif && `motif : ${r.motif}`].filter(Boolean).join(' · ')}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

// ---------- Profil (tous)
export function ProfilePage() {
  const team = useTeam()
  const kt = useKtArgs()
  const endShift = useMutation(api.access.endShift)
  const { signOut } = useAuthActions()
  const sound = useSoundSetting()
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  useEffect(() => { setPerm('Notification' in window ? Notification.permission : 'unsupported') }, [])
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-3xl font-bold">Profil</h1>
      <section className={card}>
        <p className="text-sm text-muted-foreground">Connecté en tant que</p>
        <p className="text-xl font-bold">{team.label}</p>
        <p className="text-sm text-muted-foreground">{team.kind === 'kitchen' ? 'Accès cuisine partagé' : team.kind === 'admin' ? 'Responsable' : team.kind === 'staff' ? 'Équipe' : 'Livreur'}</p>
      </section>
      <section className={`${card} space-y-3`}>
        <ToggleRow label="Son des nouvelles commandes" hint="Répété toutes les 20 secondes tant qu'une commande attend." on={sound.on} onChange={sound.toggle} />
        {perm !== 'unsupported' && <div className="flex items-center gap-4"><div className="flex-1"><p className="font-semibold">Notifications</p><p className="text-sm text-muted-foreground">{perm === 'granted' ? 'Activées sur cet appareil' : perm === 'denied' ? 'Bloquées dans les réglages du navigateur' : 'Recevoir une alerte même hors de l\'écran'}</p></div>{perm === 'default' && <button onClick={async () => setPerm(await Notification.requestPermission())} className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">Activer</button>}</div>}
      </section>
      <InstallApp audience="equipe" />
      <section className={`${card} space-y-2`}>
        {team.kind === 'kitchen' && kt.kt && <button onClick={async () => { await run(endShift({ kt: kt.kt! }), 'Fin de service enregistrée') }} className="w-full rounded-xl border py-3 font-semibold">Fin de service / changer d'employé</button>}
        <button onClick={() => { if (team.kind === 'kitchen') team.logout(); else void signOut() }} className="w-full rounded-xl py-3 font-semibold text-destructive">{team.kind === 'kitchen' ? 'Déconnecter cet appareil' : 'Se déconnecter'}</button>
      </section>
    </div>
  )
}
