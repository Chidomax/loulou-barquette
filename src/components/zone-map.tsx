import { useEffect, useRef, useState } from 'react'
import type * as L from 'leaflet'
import { LocateFixed } from 'lucide-react'
import { eur, haversineKm } from '@/lib/shop'

export type Zone = { name: string; fee: number; delai: string; lat: number; lng: number }
type Pt = { lat: number; lng: number }

export const RESTAURANT_POS: Pt = { lat: -12.815606, lng: 45.200209 }
const MAX_KM = 3

/** Quartier le plus proche d'une position (même règle que le serveur). */
export function nearestZone(zones: Zone[], p: Pt): Zone | null {
  let best: Zone | null = null, bestKm = Infinity
  for (const z of zones) { const d = haversineKm(p, z); if (d < bestKm) { bestKm = d; best = z } }
  return bestKm <= MAX_KM ? best : null
}

// Couleur du quartier selon le tarif (vert = proche, rouge = plus loin)
const feeColor = (fee: number) => (fee <= 1.5 ? '#1f7a4a' : fee <= 3 ? '#5b8c2a' : fee <= 3.5 ? '#c99a06' : fee <= 4 ? '#e07b12' : fee <= 4.5 ? '#d2471b' : '#b90404')

/**
 * Carte des quartiers : le client choisit son quartier en le touchant, ou se localise.
 * L'épingle peut être déplacée jusqu'à la porte ; sa position sert au livreur pendant la commande.
 */
export function ZoneMap({ zones, selected, pos, onSelect, onPos }: {
  zones: Zone[]
  selected: string
  pos: Pt | null
  onSelect: (zone: string) => void
  onPos: (p: Pt | null, zone: Zone | null) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const lib = useRef<typeof L | null>(null)
  const circles = useRef<Map<string, L.Circle>>(new Map())
  const pin = useRef<L.Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [locating, setLocating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const cb = useRef({ onSelect, onPos, zones })
  cb.current = { onSelect, onPos, zones }

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((mod) => {
      const Lf = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L)
      if (cancelled || !el.current || map.current) return
      lib.current = Lf
      const m = Lf.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView([-12.79, 45.212], 12)
      Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
      Lf.marker([RESTAURANT_POS.lat, RESTAURANT_POS.lng], {
        icon: Lf.divIcon({ className: '', html: '<img src="/logo192.png" alt="" style="width:40px;height:40px;border-radius:9999px;box-shadow:0 3px 10px rgba(0,0,0,.35);background:#fff">', iconSize: [40, 40], iconAnchor: [20, 20] }),
        title: 'Loulou Barquette',
      }).addTo(m).bindTooltip('Loulou Barquette', { direction: 'top', offset: [0, -18] })
      map.current = m
      m.fitBounds(cb.current.zones.map((z) => [z.lat, z.lng] as [number, number]), { padding: [18, 18], maxZoom: 14 })
      setReady(true)
    })
    return () => { cancelled = true; map.current?.remove(); map.current = null; circles.current.clear(); pin.current = null }
  }, [])

  // (Re)dessine les quartiers, y compris si le gérant modifie un tarif pendant que la page est ouverte
  useEffect(() => {
    const Lf = lib.current, m = map.current
    if (!ready || !Lf || !m) return
    for (const c of circles.current.values()) c.remove()
    circles.current.clear()
    for (const z of zones) {
      const c = Lf.circle([z.lat, z.lng], { radius: 650, color: feeColor(z.fee), weight: z.name === selected ? 4 : 2, fillColor: feeColor(z.fee), fillOpacity: z.name === selected ? 0.45 : 0.22 })
        .addTo(m)
        .bindTooltip(`<b>${z.name}</b> · ${eur(z.fee)}`, { direction: 'top', className: 'kb-zone-label' })
      c.on('click', () => { cb.current.onSelect(z.name); setMsg(`Quartier choisi : ${z.name} (${eur(z.fee)})`) })
      circles.current.set(z.name, c)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zones])

  // Mise en avant du quartier choisi
  useEffect(() => {
    for (const [name, c] of circles.current) c.setStyle({ weight: name === selected ? 4 : 2, fillOpacity: name === selected ? 0.45 : 0.22 })
  }, [selected])

  // Épingle du client (déplaçable)
  useEffect(() => {
    const Lf = lib.current, m = map.current
    if (!ready || !Lf || !m) return
    if (!pos) { pin.current?.remove(); pin.current = null; return }
    if (!pin.current) {
      pin.current = Lf.marker([pos.lat, pos.lng], {
        draggable: true,
        icon: Lf.divIcon({ className: '', html: '<div class="kb-marker kb-marker-home" style="width:36px;height:36px">🏠</div>', iconSize: [36, 36], iconAnchor: [18, 18] }),
        title: 'Votre position',
      }).addTo(m)
      pin.current.on('dragend', () => {
        const ll = pin.current!.getLatLng()
        const p = { lat: ll.lat, lng: ll.lng }, z = nearestZone(cb.current.zones, p)
        cb.current.onPos(p, z)
        setMsg(z ? `Position ajustée · quartier ${z.name} (${eur(z.fee)})` : 'Cette position est hors de nos quartiers de livraison.')
      })
    } else pin.current.setLatLng([pos.lat, pos.lng])
  }, [ready, pos])

  function locate() {
    if (!('geolocation' in navigator)) { setMsg("La localisation n'est pas disponible sur cet appareil."); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        const pt = { lat: p.coords.latitude, lng: p.coords.longitude }
        const z = nearestZone(cb.current.zones, pt)
        cb.current.onPos(pt, z)
        map.current?.setView([pt.lat, pt.lng], 14)
        setMsg(z ? `Vous êtes localisé à ${z.name} (${eur(z.fee)}). Déplacez la maison si besoin.` : 'Vous semblez hors de nos quartiers de livraison. Appelez-nous au 06 39 67 01 13.')
      },
      () => { setLocating(false); setMsg('Localisation refusée : touchez simplement votre quartier sur la carte.') },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border">
        <div ref={el} className="h-80 w-full" role="region" aria-label="Carte des quartiers de livraison" />
        <button type="button" onClick={locate} disabled={locating} className="absolute right-2 top-2 z-[500] inline-flex items-center gap-1 rounded-lg bg-card px-3 py-2 text-xs font-bold text-primary shadow-md">
          <LocateFixed className="size-4" /> {locating ? 'Localisation…' : 'Me localiser'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {zones.map((z) => (
          <button key={z.name} type="button" onClick={() => { onSelect(z.name); map.current?.flyTo([z.lat, z.lng], 14, { duration: 0.6 }); circles.current.get(z.name)?.openTooltip(); setMsg(`Quartier choisi : ${z.name} (${eur(z.fee)})`) }}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${selected === z.name ? 'border-primary bg-primary/5 font-bold' : ''}`}>
            <span className="size-3 shrink-0 rounded-full" style={{ background: feeColor(z.fee) }} />
            <span className="flex-1 leading-tight">{z.name}</span><span className="font-semibold">{eur(z.fee)}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{msg ?? 'Touchez votre quartier sur la carte ou utilisez « Me localiser ». Votre position sert uniquement au livreur pendant cette commande.'}</p>
      {pos && <button type="button" onClick={() => { cb.current.onPos(null, null); setMsg(null) }} className="text-xs text-muted-foreground underline">Ne pas partager ma position</button>}
    </div>
  )
}
