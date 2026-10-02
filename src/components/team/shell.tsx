import { useEffect, useRef, useState } from 'react'
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react'
import { Bell, BellOff, CalendarClock, ChevronDown, ClipboardList, CreditCard, House, LayoutGrid, LogOut, Paintbrush, Settings, ShoppingBag, UserRound, UtensilsCrossed, WifiOff, X, Bike, CheckCheck } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { shopState, hhmmFr } from '@/convex/shared'
import { type Kind, beep, run, useKtArgs, useSoundSetting, useTeam } from '@/lib/team'
import { notify } from '@/lib/pwa'

export type Page = 'apercu' | 'commandes' | 'terminees' | 'menu' | 'livraisons' | 'horaires' | 'paiements' | 'site' | 'parametres' | 'profil'

const NAV: { page: Page; label: string; icon: typeof House; roles: Kind[]; mobile?: boolean }[] = [
  { page: 'apercu', label: "Vue d'ensemble", icon: LayoutGrid, roles: ['admin'] },
  { page: 'commandes', label: 'Commandes', icon: ShoppingBag, roles: ['admin', 'staff', 'kitchen'], mobile: true },
  { page: 'terminees', label: 'Terminées', icon: CheckCheck, roles: ['admin', 'staff', 'kitchen'], mobile: true },
  { page: 'menu', label: 'Menu et ruptures', icon: UtensilsCrossed, roles: ['admin', 'staff', 'kitchen'], mobile: true },
  { page: 'livraisons', label: 'Livraisons', icon: Bike, roles: ['admin', 'driver'], mobile: true },
  { page: 'horaires', label: 'Horaires', icon: CalendarClock, roles: ['admin'] },
  { page: 'paiements', label: 'Paiements', icon: CreditCard, roles: ['admin'] },
  { page: 'site', label: 'Modifier le site', icon: Paintbrush, roles: ['admin'] },
  { page: 'parametres', label: 'Paramètres', icon: Settings, roles: ['admin'] },
  { page: 'profil', label: 'Profil', icon: UserRound, roles: ['admin', 'staff', 'kitchen', 'driver'], mobile: true },
]
export const pagesFor = (k: Kind) => NAV.filter((n) => n.roles.includes(k)).map((n) => n.page)

export function Shell({ page, setPage, children }: { page: Page; setPage: (p: Page) => void; children: React.ReactNode }) {
  const team = useTeam()
  const nav = NAV.filter((n) => n.roles.includes(team.kind))
  const mobileNav = nav.filter((n) => n.mobile)
  return (
    <div className="min-h-screen bg-[#f4f4f2] text-foreground">
      <ConnectionBanner />
      {team.kind !== 'driver' && <OrderAlerts />}
      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo192.png" alt="" className="size-11" />
          <span className="font-bold leading-tight">Loulou<br />Barquette</span>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Espace restaurant">
          {nav.filter((n) => n.page !== 'profil' && n.page !== 'terminees').map((n) => (
            <button key={n.page} onClick={() => setPage(n.page)} aria-current={page === n.page ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${page === n.page || (page === 'terminees' && n.page === 'commandes') ? 'bg-emerald-50 text-emerald-900' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
              <n.icon className="size-5" /> {n.label}
            </button>
          ))}
        </nav>
        <div className="space-y-1 border-t p-3">
          <button onClick={() => setPage('profil')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-secondary">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">{team.label[0]?.toUpperCase()}</span>
            <span className="min-w-0 truncate">{team.label}</span>
          </button>
          <a href="tel:+262639670113" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"><ClipboardList className="size-5" /> Aide : 06 39 67 01 13</a>
        </div>
      </aside>

      <div className="lg:pl-60">
        <TopBar onProfile={() => setPage('profil')} />
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* Onglets du bas (téléphone, tablette) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navigation">
        {mobileNav.map((n) => (
          <button key={n.page} onClick={() => setPage(n.page)} aria-current={page === n.page ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${page === n.page ? 'text-emerald-800' : 'text-muted-foreground'}`}>
            <n.icon className="size-6" /> {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function TopBar({ onProfile }: { onProfile: () => void }) {
  const team = useTeam()
  const sound = useSoundSetting()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <img src="/logo192.png" alt="" className="size-9 lg:hidden" />
      <span className="hidden font-bold sm:inline">Loulou Barquette</span>
      {team.kind !== 'driver' && <ServiceStatus />}
      <div className="ml-auto flex items-center gap-1">
        <button onClick={sound.toggle} aria-label={sound.on ? 'Couper le son des alertes' : 'Activer le son des alertes'} title={sound.on ? 'Son des alertes activé' : 'Son des alertes coupé'} className="rounded-full p-2 hover:bg-secondary">
          {sound.on ? <Bell className="size-5" /> : <BellOff className="size-5 text-destructive" />}
        </button>
        <button onClick={onProfile} className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium hover:bg-secondary sm:flex">
          <span className="grid size-8 place-items-center rounded-full bg-foreground text-xs font-bold text-background">{team.label[0]?.toUpperCase()}</span>
          <span className="max-w-40 truncate">{team.label}</span>
        </button>
      </div>
    </header>
  )
}

/** Pastille « Restaurant ouvert » : pause 15/30 min avec motif (équipe), ouverture et fermeture (responsable). */
function ServiceStatus() {
  const team = useTeam()
  const kt = useKtArgs()
  const res = useQuery(api.shop.settings, kt)
  const pause = useMutation(api.shop.pause)
  const resume = useMutation(api.shop.resume)
  const update = useMutation(api.shop.update)
  const [open, setOpen] = useState(false)
  const [pauseFor, setPauseFor] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 20_000); return () => clearInterval(i) }, [])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  if (!res || !res.ok) return null
  const s = res.settings
  const st = shopState({ ...s, pausedUntil: s.pausedUntil ?? undefined }, now)
  const label = st.accepting ? 'Restaurant ouvert' : st.kind === 'paused' ? `En pause jusqu'à ${hhmmFr(s.pausedUntil!)}` : st.kind === 'closed' ? 'Restaurant fermé' : 'Hors horaires'
  const tone = st.accepting ? 'bg-emerald-50 text-emerald-900' : st.kind === 'paused' ? 'bg-amber-100 text-amber-900' : 'bg-secondary text-muted-foreground'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${tone}`}>
        <span className={`size-2 rounded-full ${st.accepting ? 'bg-emerald-600' : st.kind === 'paused' ? 'bg-amber-500' : 'bg-muted-foreground'}`} />
        <span className="max-w-[46vw] truncate">{label}</span><ChevronDown className="size-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-2xl border bg-background p-2 text-sm shadow-xl">
          {!st.accepting && <p className="px-3 py-2 text-xs text-muted-foreground">{st.reason}</p>}
          {st.kind === 'paused'
            ? <button onClick={async () => { setOpen(false); await run(resume(kt), 'Commandes reprises', 'Reprise en cours…') }} className="w-full rounded-xl px-3 py-2.5 text-left font-semibold hover:bg-secondary">Reprendre les commandes</button>
            : s.open && <>
              <button onClick={() => { setOpen(false); setPauseFor(15) }} className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-secondary">Pause de 15 minutes</button>
              <button onClick={() => { setOpen(false); setPauseFor(30) }} className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-secondary">Pause de 30 minutes</button>
            </>}
          <p className="px-3 pb-1 pt-2 text-xs text-muted-foreground">Une pause n'annule jamais les commandes déjà acceptées.</p>
          {team.kind === 'admin' && (
            <div className="mt-1 border-t pt-1">
              <button onClick={async () => { setOpen(false); await run(update({ open: !s.open }), s.open ? 'Restaurant fermé aux commandes' : 'Restaurant ouvert aux commandes') }} className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-secondary">{s.open ? 'Fermer le restaurant (commandes en ligne)' : 'Ouvrir le restaurant'}</button>
              <button onClick={async () => { setOpen(false); await run(update({ autoAccept: !s.autoAccept }), s.autoAccept ? 'Acceptation automatique désactivée' : 'Acceptation automatique activée') }} className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-secondary">Acceptation automatique : <b>{s.autoAccept ? 'activée' : 'désactivée'}</b></button>
            </div>
          )}
        </div>
      )}
      {pauseFor && <PauseDialog minutes={pauseFor} onClose={() => setPauseFor(null)} onConfirm={async (motif) => { const r = await run(pause({ ...kt, minutes: pauseFor, motif }), `Commandes en pause ${pauseFor} min`, 'Mise en pause…'); if (r?.ok) setPauseFor(null) }} />}
    </div>
  )
}

const PAUSE_MOTIFS = ['Trop de commandes en cours', 'Rupture importante', 'Problème en cuisine', 'Problème technique']

function PauseDialog({ minutes, onClose, onConfirm }: { minutes: number; onClose: () => void; onConfirm: (motif: string) => void }) {
  const [motif, setMotif] = useState(PAUSE_MOTIFS[0])
  const [other, setOther] = useState('')
  return (
    <Modal title={`Pause de ${minutes} minutes`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Les clients ne pourront plus commander pendant {minutes} minutes. Les commandes en cours restent à traiter.</p>
      <fieldset className="mt-4 space-y-2">
        <legend className="mb-1 text-sm font-semibold">Motif</legend>
        {[...PAUSE_MOTIFS, 'Autre'].map((m) => (
          <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${motif === m ? 'border-foreground' : ''}`}><input type="radio" name="motif" checked={motif === m} onChange={() => setMotif(m)} className="accent-foreground" /> {m}</label>
        ))}
      </fieldset>
      {motif === 'Autre' && <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={120} placeholder="Précisez" className="mt-2 w-full rounded-xl border px-3 py-2.5" autoFocus />}
      <div className="mt-5 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border py-3 font-semibold">Annuler</button>
        <button onClick={() => onConfirm(motif === 'Autre' ? other : motif)} className="flex-1 rounded-xl bg-foreground py-3 font-semibold text-background">Mettre en pause</button>
      </div>
    </Modal>
  )
}

/** Fenêtre modale simple et accessible (Échap pour fermer). */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-background p-5 shadow-2xl sm:rounded-3xl sm:p-6 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="rounded-full p-1.5 hover:bg-secondary"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Bandeau de perte de connexion : on ne fait jamais croire que les commandes arrivent. */
function ConnectionBanner() {
  const st = useConvexConnectionState()
  const [offline, setOffline] = useState(false)
  const [late, setLate] = useState(false)
  useEffect(() => {
    const up = () => setOffline(!navigator.onLine)
    up(); window.addEventListener('online', up); window.addEventListener('offline', up)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', up) }
  }, [])
  // On attend 3 s avant d'afficher le bandeau (évite les clignotements lors d'une simple reconnexion)
  const lost = offline || (st.hasEverConnected && !st.isWebSocketConnected)
  useEffect(() => { if (!lost) { setLate(false); return } const t = setTimeout(() => setLate(true), 3000); return () => clearTimeout(t) }, [lost])
  if (!lost || !late) return null
  return (
    <div role="alert" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2.5 text-center text-sm font-semibold text-destructive-foreground">
      <WifiOff className="size-4 shrink-0" /> Connexion perdue, reconnexion en cours… Les nouvelles commandes n'apparaîtront qu'au retour de la connexion.
    </div>
  )
}

/** Alerte des nouvelles commandes, sur toutes les pages : son répété toutes les 20 s tant qu'une commande attend. */
function OrderAlerts() {
  const kt = useKtArgs()
  const res = useQuery(api.orders.staffList, kt)
  const sound = useSoundSetting()
  const known = useRef<Set<string> | null>(null)
  const waiting = res && res.ok ? res.active.filter((o) => o.status === 'recue') : []
  useEffect(() => {
    if (!res || !res.ok) return
    const ids = new Set(res.active.filter((o) => o.status === 'recue').map((o) => o._id as string))
    if (known.current) {
      const fresh = [...ids].filter((id) => !known.current!.has(id))
      if (fresh.length) {
        const o = res.active.find((x) => x._id === fresh[0])!
        if (sound.on) beep()
        void notify('Nouvelle commande', `${o.num} · ${o.mode === 'livraison' ? 'Livraison' : o.mode === 'emporter' ? 'À emporter' : 'Sur place'}`, '/equipe#commandes')
      }
    }
    known.current = ids
    document.title = ids.size ? `(${ids.size}) Nouvelle commande – Loulou Barquette` : 'Espace restaurant – Loulou Barquette'
  }, [res, sound.on])
  useEffect(() => {
    if (!waiting.length || !sound.on) return
    const i = setInterval(beep, 20_000)
    return () => clearInterval(i)
  }, [waiting.length, sound.on])
  return null
}
