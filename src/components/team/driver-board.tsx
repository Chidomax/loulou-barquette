import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Navigation, Phone, Radio } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { STATUS_LABEL, eur } from '@/lib/shop'

export function DriverBoard() {
  const res = useQuery(api.orders.driverBoard, {})
  const claim = useMutation(api.orders.claim)
  const start = useMutation(api.orders.startDelivery)
  const delivered = useMutation(api.orders.delivered)
  const sendLoc = useMutation(api.orders.updateLocation)
  const [sharing, setSharing] = useState<Id<'orders'> | null>(null)
  const [lastSent, setLastSent] = useState<number | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const lastPush = useRef(0)
  const autoResumed = useRef(false)

  function stopSharing() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    wakeLock.current?.release().catch(() => undefined); wakeLock.current = null
    setSharing(null)
  }

  async function startSharing(orderId: Id<'orders'>) {
    if (!('geolocation' in navigator)) { setGeoError("La localisation n'est pas disponible sur ce téléphone."); return }
    stopSharing()
    setSharing(orderId); setGeoError(null)
    try { wakeLock.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* écran : facultatif */ }
    watchId.current = navigator.geolocation.watchPosition(
      async (p) => {
        if (Date.now() - lastPush.current < 4000) return // au plus une position toutes les 4 s
        lastPush.current = Date.now()
        const r = await sendLoc({ orderId, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading ?? undefined, speed: p.coords.speed ?? undefined }).catch(() => null)
        if (r && r.ok) setLastSent(Date.now())
        else if (r && !r.ok) { setGeoError(r.message); if (r.code === 'INVALID') stopSharing() }
      },
      (err) => {
        if (err.code === 1) { stopSharing(); setGeoError('Localisation refusée : autorisez-la dans les réglages du navigateur, puis touchez « Reprendre le partage ».') }
        else setGeoError('Position GPS indisponible pour le moment, nouvel essai automatique…')
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }

  // Reprend automatiquement le partage si une livraison est déjà en cours (ex. après rechargement)
  useEffect(() => {
    if (!res || !res.ok || sharing || autoResumed.current) return
    const ongoing = res.mine.find((o) => o.status === 'en_livraison')
    if (ongoing) { autoResumed.current = true; void startSharing(ongoing._id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res])
  useEffect(() => () => stopSharing(), [])

  if (res === undefined) return <p className="text-muted-foreground">Chargement…</p>
  if (!res.ok) return <p className="text-destructive">{res.message}</p>

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {sharing && (
        <div className="flex items-center gap-3 rounded-2xl bg-success-soft p-3 text-sm">
          <Radio className="size-5 animate-pulse text-success" />
          <div className="flex-1"><b>Position partagée avec le client</b><br />{lastSent ? `Dernier envoi : ${new Date(lastSent).toLocaleTimeString('fr-FR')}` : 'Recherche du GPS…'} · gardez cette page ouverte.</div>
        </div>
      )}
      {geoError && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning-foreground">{geoError}</p>}

      <h2 className="text-xl font-extrabold">Mes livraisons</h2>
      {res.mine.length === 0 && <p className="rounded-2xl border bg-card p-4 text-muted-foreground">Aucune livraison qui vous est affectée.</p>}
      {res.mine.map((o) => (
        <article key={o._id} className="space-y-2 rounded-2xl border bg-card p-4">
          <div className="flex justify-between"><b className="font-display text-lg">{o.num}</b><span className="rounded-full bg-secondary px-2 py-1 text-xs font-bold">{STATUS_LABEL[o.status]}</span></div>
          <p><b>{o.nom}</b> · {o.zone}</p>
          <p className="text-sm text-muted-foreground">📍 {o.adresse}</p>
          {o.note && <p className="text-sm italic">« {o.note} »</p>}
          <ul className="text-sm">{o.lignes.map((l, i) => <li key={i}>{l.qte}× {l.article}</li>)}</ul>
          {o.toCollect > 0 && <p className="rounded-lg bg-warning-soft p-2 text-sm font-bold text-warning-foreground">À encaisser : {eur(o.toCollect)}</p>}
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${o.tel}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold"><Phone className="size-4" /> Appeler</a>
            {o.destLat !== undefined && <a href={`https://www.google.com/maps/dir/?api=1&destination=${o.destLat},${o.destLng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold"><Navigation className="size-4" /> Itinéraire</a>}
            {o.status === 'prete' && res.role !== 'admin' && (
              <button onClick={async () => { const r = await start({ orderId: o._id }); if (r.ok) { toast.success('Livraison démarrée : le client vous voit sur la carte.'); void startSharing(o._id) } else toast.error(r.message) }} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Démarrer la livraison</button>
            )}
            {o.status === 'preparation' && <span className="px-2 py-2 text-sm text-muted-foreground">En préparation en cuisine…</span>}
            {o.status === 'en_livraison' && (
              <>
                {sharing !== o._id && <button onClick={() => startSharing(o._id)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Reprendre le partage</button>}
                <button onClick={async () => { const r = await delivered({ orderId: o._id }); if (r.ok) { stopSharing(); toast.success('Livraison terminée. Position effacée.') } else toast.error(r.message) }} className="rounded-lg bg-success px-4 py-2 text-sm font-bold text-primary-foreground">Commande livrée</button>
              </>
            )}
          </div>
        </article>
      ))}

      {res.open.length > 0 && (
        <>
          <h2 className="pt-2 text-xl font-extrabold">À prendre</h2>
          {res.open.map((o) => (
            <div key={o._id} className="flex items-center justify-between rounded-2xl border bg-card p-3">
              <span><b>{o.num}</b> · {o.zone}</span>
              {res.role === 'driver' && <button onClick={async () => { const r = await claim({ orderId: o._id }); if (r.ok) toast.success('Livraison prise en charge'); else toast.error(r.message) }} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">Je la prends</button>}
            </div>
          ))}
        </>
      )}
      <p className="text-xs text-muted-foreground">Votre position n'est envoyée que pendant une livraison démarrée, et elle est effacée dès que la commande est livrée.</p>
    </div>
  )
}
