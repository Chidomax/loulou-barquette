import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useConvexConnectionState, useQuery } from 'convex/react'
import { Bell, Bike, Check, ChefHat, ChevronDown, FileText, HelpCircle, Home, MapPin, Phone, ShoppingBag, WifiOff } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { LiveMap } from '@/components/live-map'
import { WaitingArt, type Scene } from '@/components/waiting-art'
import { eur, etaMinutes } from '@/lib/shop'
import siteMetadata from '../metadata.json'
import { notify } from '@/lib/pwa'

export const Route = createFileRoute('/suivi/$token')({
  head: () => ({ meta: [{ title: siteMetadata['/suivi'].title }, { name: 'robots', content: 'noindex' }] }),
  component: TrackPage,
})

type Track = NonNullable<ReturnType<typeof useTrack>>
function useTrack(token: string) { return useQuery(api.orders.track, { token }) }

const NOTIF: Record<string, string> = {
  preparation: 'Ça se prépare en cuisine…',
  prete: "C'est prêt !",
  en_livraison: 'Ta commande a été confiée au livreur.',
  livree: 'Ta commande est arrivée. Bon appétit !',
  recuperee: 'Merci et bon appétit !',
  annulee: "Ta commande a été annulée. Contacte le restaurant si besoin.",
}
const hm = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' }).replace(':', 'h')

/** Textes et scène selon le vrai statut (jamais d'avance automatique). */
function screen(o: Track): { scene: Scene; title: string; text: string } {
  switch (o.status) {
    case 'attente_paiement': return { scene: 'attente', title: 'Paiement en attente', text: 'Ta commande partira en cuisine dès le paiement confirmé.' }
    case 'recue': return { scene: 'recue', title: 'Bien reçu !', text: "On s'occupe de ta commande." }
    case 'preparation': return { scene: 'preparation', title: 'Ça se prépare !', text: "La cuisine s'occupe de ton repas." }
    case 'prete': return o.mode === 'livraison'
      ? { scene: 'prete', title: "C'est prêt !", text: 'Les dernières vérifications avant de partir avec ton livreur.' }
      : { scene: 'prete', title: "C'est prêt !", text: 'Tu peux récupérer ta commande.' }
    case 'en_livraison': return { scene: 'livreur', title: 'En route !', text: 'Ta commande a été confiée au livreur.' }
    case 'livree': return { scene: 'fini', title: 'Bon appétit !', text: 'Ta commande a été livrée. Merci pour ta confiance.' }
    case 'recuperee': return { scene: 'fini', title: 'Bon appétit !', text: 'Merci et à bientôt chez Loulou Barquette.' }
    default: return { scene: 'annulee', title: 'Commande annulée', text: o.refusReason ? `Motif : ${o.refusReason}.` : 'Contacte le restaurant pour en savoir plus.' }
  }
}

function TrackPage() {
  const { token } = Route.useParams()
  const o = useTrack(token)
  const conn = useConvexConnectionState()
  const prev = useRef<string | null>(null)
  const near = useRef(false)
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [details, setDetails] = useState(false)
  const [help, setHelp] = useState(false)
  useEffect(() => { setMounted(true); const i = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(i) }, [])

  useEffect(() => {
    if (!o) return
    if (prev.current && prev.current !== o.status && NOTIF[o.status]) {
      void notify('Loulou Barquette · ' + o.num, NOTIF[o.status], `/suivi/${token}`)
      if ('vibrate' in navigator) navigator.vibrate?.(200)
    }
    prev.current = o.status
    if (o.status === 'en_livraison' && o.driver && o.dest && !near.current && etaMinutes(o.driver, o.dest).km < 0.5) {
      near.current = true
      void notify('Loulou Barquette · ' + o.num, 'Ton livreur arrive, il est à moins de 500 m.', `/suivi/${token}`)
      if ('vibrate' in navigator) navigator.vibrate?.([200, 100, 200])
    }
  }, [o, token])

  if (o === undefined) return <Frame><p className="py-16 text-center text-muted-foreground">Chargement…</p></Frame>
  if (o === null) return <Frame><p className="py-16 text-center">Commande introuvable. Vérifie le lien reçu.</p></Frame>

  const sc = screen(o)
  const reconnecting = conn.hasEverConnected && !conn.isWebSocketConnected
  const allSteps: { key: string; label: string; Icon: typeof Check }[] = [
    { key: 'recue', label: 'Reçue', Icon: Check }, { key: 'preparation', label: 'En préparation', Icon: ChefHat }, { key: 'prete', label: 'Prête', Icon: ShoppingBag }, { key: 'en_livraison', label: 'En route', Icon: Bike },
  ]
  const steps = o.mode === 'livraison' ? allSteps : allSteps.slice(0, 3)
  const order = ['attente_paiement', 'recue', 'preparation', 'prete', 'en_livraison', 'livree', 'recuperee']
  const pos = order.indexOf(o.status)
  const eta = o.driver && o.dest ? etaMinutes(o.driver, o.dest) : null
  const lastSeen = o.driver ? Math.max(0, Math.round((now - o.driver.updatedAt) / 1000)) : null

  // Fourchette horaire : jamais de faux compte à rebours, mise à jour si l'équipe annonce un retard
  const base = o.promisedAt ?? o.createdAt + o.prepMinutes * 60_000
  const range = [base, base + 10 * 60_000]
  const showRange = ['recue', 'preparation'].includes(o.status)

  return (
    <Frame>
      {reconnecting && <p role="status" className="mb-4 flex items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold"><WifiOff className="size-4" /> Reconnexion en cours… dernier statut connu affiché.</p>}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Commande #{o.num}</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{sc.title}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{sc.text}</p>
      </div>

      {o.mode === 'livraison' && o.status === 'en_livraison' && mounted ? (
        <div className="relative mt-6 overflow-hidden rounded-[1.75rem]">
          <LiveMap restaurant={o.restaurant} dest={o.dest} driver={o.driver} className="h-80 w-full sm:h-96" />
          <div className="absolute inset-x-3 bottom-3 z-[500] flex items-center gap-3 rounded-2xl bg-background/95 p-3 shadow-lg backdrop-blur">
            <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground"><Bike className="size-5" /></span>
            <div className="flex-1">
              <p className="font-bold">{eta && eta.km < 0.5 ? `${o.driverFirstName ?? 'Ton livreur'} est presque là` : `${o.driverFirstName ?? 'Ton livreur'} arrive${eta ? ` dans ~${eta.min} min` : ''}`}</p>
              <p className="text-xs text-muted-foreground">{o.driver ? `${eta ? `${eta.km.toFixed(1).replace('.', ',')} km · ` : ''}position mise à jour ${lastSeen! < 10 ? "à l'instant" : lastSeen! < 60 ? `il y a ${lastSeen} s` : `il y a ${Math.round(lastSeen! / 60)} min`}` : 'Position du livreur bientôt disponible.'}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4"><WaitingArt scene={sc.scene} /></div>
      )}

      {['recue', 'preparation'].includes(o.status) && (
        <p className="mx-auto mt-2 flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 font-semibold text-emerald-900"><span className="lb-spin inline-block size-4 rounded-full border-[3px] border-emerald-700 border-r-transparent" aria-hidden /> En cours</p>
      )}

      {o.status === 'attente_paiement' && (
        <div className="mt-5 rounded-2xl bg-secondary p-4 text-center">
          <Link to="/checkout" search={{ t: token }} className="inline-block rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">Payer maintenant</Link>
        </div>
      )}

      {showRange && (
        <div className="mt-5 rounded-[1.5rem] bg-emerald-50 p-5 text-center text-emerald-950">
          <p className="font-semibold">{o.mode === 'livraison' ? 'Prête pour le livreur entre' : o.mode === 'surplace' ? 'Servie entre' : 'Prête à emporter entre'}</p>
          <p className="text-4xl font-extrabold tracking-tight">{hm(range[0])} et {hm(range[1])}</p>
          <p className="text-sm">{o.acceptedAt ? 'Heure estimée par la cuisine' : 'Estimation, confirmée dès que la cuisine accepte'}</p>
        </div>
      )}

      {o.status !== 'annulee' && (
        <ol className="mt-6 flex items-start justify-between" aria-label="Étapes de la commande">
          {steps.map(({ key, label, Icon }, i) => {
            const k = order.indexOf(key)
            const done = pos > k || ['livree', 'recuperee'].includes(o.status)
            const cur = pos === k
            return (
              <li key={key} className="relative flex flex-1 flex-col items-center text-center">
                {i > 0 && <span className={`absolute right-1/2 top-6 -z-0 h-1 w-full ${done || cur ? 'bg-emerald-700' : 'bg-secondary'}`} aria-hidden />}
                <span className={`relative z-10 grid size-12 place-items-center rounded-full ${done ? 'bg-emerald-700 text-white' : cur ? 'bg-emerald-700 text-white ring-4 ring-emerald-100' : 'border-2 border-input bg-background text-muted-foreground'}`}><Icon className="size-5" /></span>
                <span className={`mt-2 text-sm ${cur ? 'font-bold' : 'text-muted-foreground'}`}>{label}</span>
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border">
        <button onClick={() => setDetails(!details)} aria-expanded={details} className="flex w-full items-center gap-3 px-4 py-4 text-left font-semibold">
          <FileText className="size-5" /> <span className="flex-1">Voir ma commande</span> <ChevronDown className={`size-5 transition ${details ? 'rotate-180' : ''}`} />
        </button>
        {details && (
          <div className="border-t px-4 py-3 text-sm">
            {o.lignes.map((l, i) => (
              <div key={i} className="py-1">
                <div className="flex justify-between gap-3"><span className="font-medium">{l.qte} × {l.article}</span><span>{eur(l.pu * l.qte)}</span></div>
                {(l.details ?? []).map((d, j) => <p key={j} className="text-xs text-muted-foreground">{d}</p>)}
              </div>
            ))}
            <div className="flex justify-between py-0.5 text-muted-foreground"><span>Livraison</span><span>{o.mode !== 'livraison' ? '—' : o.frais ? eur(o.frais) : 'Offerte'}</span></div>
            {o.remise > 0 && <div className="flex justify-between py-0.5 text-emerald-800"><span>Réduction fidélité</span><span>− {eur(o.remise)}</span></div>}
            {o.montantTr > 0 && <div className="flex justify-between py-0.5 text-muted-foreground"><span>Dont titre-restaurant</span><span>{eur(o.montantTr)} {o.paidTr >= o.montantTr ? '✓' : ''}</span></div>}
            <div className="mt-1 flex justify-between border-t border-dashed pt-2 text-base font-bold"><span>Total</span><span>{eur(o.total)}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">{o.payMethod === 'place' ? 'À régler à la livraison ou au retrait.' : o.status === 'attente_paiement' ? 'Paiement en ligne en attente.' : 'Payé en ligne.'}</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col items-center gap-3">
        <button onClick={() => setHelp(!help)} aria-expanded={help} className="flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-semibold"><HelpCircle className="size-5" /> Besoin d'aide ?</button>
        {help && (
          <div className="w-full rounded-2xl bg-secondary p-4 text-center text-sm">
            <p>Une question, un oubli, une allergie ? Appelle le restaurant en donnant le numéro <b>#{o.num}</b>.</p>
            <a href="tel:+262639670113" className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 font-semibold text-background"><Phone className="size-4" /> 06 39 67 01 13</a>
          </div>
        )}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {o.mode === 'livraison' ? <><Home className="size-4" /> Livraison à {o.zone}</> : <><MapPin className="size-4" /> {o.mode === 'surplace' ? 'Sur place' : 'Retrait'} chez Loulou Barquette, Tsoundzou 2</>}
        </p>
      </div>

      <NotifyButton />
      <p className="mt-6 text-center text-xs text-muted-foreground">Garde ce lien : il est personnel et permet de suivre ta commande.</p>
    </Frame>
  )
}

function NotifyButton() {
  const [state, setState] = useState<string>('')
  useEffect(() => { if ('Notification' in window) setState(Notification.permission) }, [])
  if (!state || state === 'granted') return null
  return (
    <button type="button" onClick={async () => setState(await Notification.requestPermission())} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold">
      <Bell className="size-4" /> Être prévenu à chaque étape
    </button>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 pt-4">
        <Link to="/" aria-label="Retour à l'accueil" className="rounded-full p-2 text-sm font-semibold hover:bg-secondary">← Accueil</Link>
        <img src="/logo192.png" alt="Loulou Barquette" className="size-14" />
        <span className="w-16" />
      </header>
      <main className="mx-auto max-w-xl px-4 pb-10 pt-2">{children}</main>
    </div>
  )
}
