import { useEffect, useRef } from 'react'
import type * as L from 'leaflet'

type Pt = { lat: number; lng: number }

/**
 * Carte OpenStreetMap chargée uniquement dans le navigateur.
 * Le marqueur du livreur glisse en douceur vers chaque nouvelle position.
 */
export function LiveMap({ restaurant, dest, driver, className }: { restaurant: Pt; dest: Pt | null; driver: Pt | null; className?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const lib = useRef<typeof L | null>(null)
  const driverMarker = useRef<L.Marker | null>(null)
  const destMarker = useRef<L.Marker | null>(null)
  const fitted = useRef(false)

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((mod) => {
      const Lf = (mod as unknown as { default?: typeof L }).default ?? (mod as unknown as typeof L)
      if (cancelled || !el.current || map.current) return
      lib.current = Lf
      const m = Lf.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([restaurant.lat, restaurant.lng], 14)
      Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; contributeurs OpenStreetMap',
      }).addTo(m)
      Lf.marker([restaurant.lat, restaurant.lng], { icon: Lf.divIcon({ className: '', html: '<img src="/logo192.png" alt="" style="width:40px;height:40px;border-radius:9999px;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.35)">', iconSize: [40, 40], iconAnchor: [20, 20] }), title: 'Loulou Barquette' }).addTo(m)
      map.current = m
      update()
    })
    return () => { cancelled = true; map.current?.remove(); map.current = null; driverMarker.current = null; destMarker.current = null; fitted.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { update() })

  function update() {
    const Lf = lib.current, m = map.current
    if (!Lf || !m) return
    if (dest) {
      if (!destMarker.current) destMarker.current = Lf.marker([dest.lat, dest.lng], { icon: icon(Lf, 'kb-marker-home', '🏠', 34), title: 'Livraison' }).addTo(m)
      else destMarker.current.setLatLng([dest.lat, dest.lng])
    }
    if (driver) {
      if (!driverMarker.current) driverMarker.current = Lf.marker([driver.lat, driver.lng], { icon: icon(Lf, 'kb-marker-driver', '🛵', 42), title: 'Livreur', zIndexOffset: 1000 }).addTo(m)
      else slide(driverMarker.current, driver)
    } else if (driverMarker.current) {
      driverMarker.current.remove(); driverMarker.current = null
    }
    if (!fitted.current) {
      const pts: [number, number][] = [[restaurant.lat, restaurant.lng]]
      if (dest) pts.push([dest.lat, dest.lng])
      if (driver) pts.push([driver.lat, driver.lng])
      if (pts.length > 1) { m.fitBounds(pts, { paddingTopLeft: [40, 40], paddingBottomRight: [40, 120], maxZoom: 16 }); fitted.current = true }
    }
  }

  return <div ref={el} className={className} role="region" aria-label="Carte du suivi de livraison" />
}

function icon(Lf: typeof L, cls: string, emoji: string, size: number) {
  return Lf.divIcon({ className: '', html: `<div class="kb-marker ${cls}" style="width:${size}px;height:${size}px">${emoji}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

function slide(marker: L.Marker, to: Pt) {
  const from = marker.getLatLng()
  const start = performance.now(), dur = 1200
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / dur)
    marker.setLatLng([from.lat + (to.lat - from.lat) * k, from.lng + (to.lng - from.lng) * k])
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
