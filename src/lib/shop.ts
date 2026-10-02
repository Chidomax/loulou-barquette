import { useCallback, useEffect, useRef, useState } from 'react'

export const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €'
export const FREE_DELIVERY_FROM = 50
export const MIN_DELIVERY_ORDER = 10
export const TR_DAILY_CAP = 25
export const REWARD_POINTS = 2000
export const REWARD_VALUE = 5

export type CartSel = { g: string; c: string; q: number; s?: string }
/** Ligne du panier. Deux compositions différentes du même plat restent deux lignes distinctes (clé unique). */
export type CartLine = { key: string; itemId: string; name: string; price: number; qte: number; sel?: CartSel[]; details?: string[]; remarque?: string }
export const lineKey = (itemId: string, sel?: CartSel[], remarque?: string) =>
  sel?.length || remarque ? `${itemId}|${JSON.stringify([...(sel ?? [])].sort((a, b) => (a.g + a.c).localeCompare(b.g + b.c)))}|${remarque ?? ''}` : itemId

function safeGet(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* stockage indisponible : le panier reste en mémoire */ }
}

/** Panier conservé dans le navigateur (aucune donnée personnelle). */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([])
  const loaded = useRef(false)
  useEffect(() => {
    try { const raw = safeGet('kb_cart'); if (raw) setLines((JSON.parse(raw) as CartLine[]).map((l) => ({ ...l, key: l.key ?? l.itemId }))) } catch { /* ignore */ }
    loaded.current = true
  }, [])
  useEffect(() => { if (loaded.current) safeSet('kb_cart', JSON.stringify(lines)) }, [lines])

  // Mises à jour fonctionnelles : chaque ajout part toujours du panier le plus récent
  const add = useCallback((l: Omit<CartLine, 'qte' | 'key'>, qte = 1) => {
    const key = lineKey(l.itemId, l.sel, l.remarque)
    setLines((prev) => {
      const ex = prev.find((x) => x.key === key)
      return ex ? prev.map((x) => (x.key === key ? { ...x, qte: Math.min(30, x.qte + qte) } : x)) : [...prev, { ...l, key, qte }]
    })
  }, [])
  const change = useCallback((key: string, d: number) => {
    setLines((prev) => prev.map((x) => (x.key === key ? { ...x, qte: Math.min(30, x.qte + d) } : x)).filter((x) => x.qte > 0))
  }, [])
  const clear = useCallback(() => setLines([]), [])
  const count = lines.reduce((s, l) => s + l.qte, 0)
  const subtotal = Math.round(lines.reduce((s, l) => s + l.price * l.qte, 0) * 100) / 100
  return { lines, add, change, clear, count, subtotal }
}

/** Liens de suivi des commandes passées depuis cet appareil. */
export function rememberOrder(token: string, num: string) {
  try {
    const list: { token: string; num: string; at: number }[] = JSON.parse(safeGet('kb_orders') || '[]')
    safeSet('kb_orders', JSON.stringify([{ token, num, at: Date.now() }, ...list.filter((o) => o.token !== token)].slice(0, 5)))
  } catch { /* ignore */ }
}
export function myOrders(): { token: string; num: string; at: number }[] {
  try { return JSON.parse(safeGet('kb_orders') || '[]').filter((o: { at: number }) => Date.now() - o.at < 3 * 24 * 3600_000) } catch { return [] }
}

export const STATUS_LABEL: Record<string, string> = {
  attente_paiement: 'En attente de paiement',
  recue: 'Commande reçue',
  preparation: 'En préparation',
  prete: 'Prête',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  recuperee: 'Récupérée',
  annulee: 'Annulée',
}

export function stepsFor(mode: string) {
  return mode === 'livraison'
    ? ['recue', 'preparation', 'prete', 'en_livraison', 'livree']
    : ['recue', 'preparation', 'prete', 'recuperee']
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** Estimation simple : distance à vol d'oiseau × 1,4 (routes), 22 km/h en ville, +2 min pour se garer. */
export function etaMinutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const km = haversineKm(from, to) * 1.4
  return { km, min: Math.max(1, Math.round((km / 22) * 60 + 2)) }
}
