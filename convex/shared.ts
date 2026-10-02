/*
 * Règles partagées entre le serveur (qui fait foi) et les écrans (aperçu identique).
 * Aucun accès à la base ici : fonctions pures.
 */

// ---------- Heures de Mayotte (UTC+3, sans changement d'heure)
const TZ_OFFSET = 3 * 3600_000
export type Hours = ({ open: string; close: string } | null)[]
export const DEFAULT_HOURS: Hours = [null, ...Array.from({ length: 6 }, () => ({ open: "09:00", close: "16:00" }))]
export const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0) }
const fmt = (hhmm: string) => { const [h, m] = hhmm.split(":"); return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}` }
export const local = (t: number) => new Date(t + TZ_OFFSET)
export const hhmm = (t: number) => { const d = local(t); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` }
export const hhmmFr = (t: number) => hhmm(t).replace(":", "h")
/** Horodatage (ms) d'une heure « HH:MM » du jour local de t. */
export function atLocal(t: number, time: string) {
  const d = local(t)
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TZ_OFFSET
  return midnight + toMin(time) * 60_000
}
export const startOfLocalDay = (t: number) => atLocal(t, "00:00")

export function hoursText(h: Hours) {
  const open = h.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
  const same = open.every((i) => h[i]!.open === h[open[0]]!.open && h[i]!.close === h[open[0]]!.close)
  if (!open.length) return "Fermé pour le moment"
  if (same && open.join(",") === "1,2,3,4,5,6") return `de ${fmt(h[1]!.open)} à ${fmt(h[1]!.close)}, du lundi au samedi`
  if (same && open.length === 7) return `de ${fmt(h[0]!.open)} à ${fmt(h[0]!.close)}, tous les jours`
  return open.map((i) => `${DAY_NAMES[i]} ${fmt(h[i]!.open)}–${fmt(h[i]!.close)}`).join(", ")
}

export type ShopSettings = { open: boolean; pausedUntil?: number; pauseReason?: string; autoAccept: boolean; prepMinutes: number; hours: Hours }
export const DEFAULT_SHOP: ShopSettings = { open: true, autoAccept: false, prepMinutes: 20, hours: DEFAULT_HOURS }

/** Le restaurant accepte-t-il des commandes à l'instant t ? */
export function shopState(s: ShopSettings, t: number): { accepting: boolean; reason: string; kind: "open" | "closed" | "paused" | "hours" } {
  if (!s.open) return { accepting: false, kind: "closed", reason: "Le restaurant ne prend pas de commandes pour le moment." }
  if (s.pausedUntil && s.pausedUntil > t) return { accepting: false, kind: "paused", reason: `Commandes en pause jusqu'à ${hhmmFr(s.pausedUntil)}${s.pauseReason ? ` (${s.pauseReason})` : ""}.` }
  const d = local(t)
  const today = s.hours[d.getUTCDay()]
  const now = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (!today || now < toMin(today.open) || now >= toMin(today.close)) return { accepting: false, kind: "hours", reason: `Nous prenons les commandes ${hoursText(s.hours)}.` }
  return { accepting: true, kind: "open", reason: "" }
}

/** Heure de fin du service du jour (pour « rupture jusqu'à la fin du service »). */
export function endOfService(s: ShopSettings, t: number) {
  const today = s.hours[local(t).getUTCDay()]
  const end = today ? atLocal(t, today.close) : atLocal(t, "23:59")
  return end > t ? end : atLocal(t, "23:59")
}

// ---------- Options des plats
export type Choice = { id: string; label: string; price: number; ingredientId?: string; off?: boolean; exclusive?: boolean; count?: number; sub?: { label: string; choices: { id: string; label: string }[] } }
export type Group = { id: string; label: string; min: number; max: number; repeat?: boolean; countFrom?: string; showIf?: { group: string; choice: string }; choices: Choice[] }
export type Sel = { g: string; c: string; q: number; s?: string }

/** Groupes visibles compte tenu des choix déjà faits (ex. boisson seulement pour la formule menu). */
export function visibleGroups(groups: Group[], sel: Sel[]) {
  return groups.filter((g) => !g.showIf || sel.some((x) => x.g === g.showIf!.group && x.c === g.showIf!.choice))
}

/** Nombre de choix demandé pour un groupe (min, max), éventuellement donné par un autre groupe (taille → viandes). */
export function bounds(g: Group, groups: Group[], sel: Sel[]) {
  if (!g.countFrom) return { min: g.min, max: g.max }
  const src = groups.find((x) => x.id === g.countFrom)
  const picked = sel.find((x) => x.g === g.countFrom)
  const n = picked ? src?.choices.find((c) => c.id === picked.c)?.count ?? 0 : 0
  return { min: n, max: n }
}

export type PriceResult = { ok: true; extra: number; details: string[] } | { ok: false; message: string }

/**
 * Vérifie une composition et calcule le supplément.
 * isOut(choice) : indisponibilité (ingrédient en rupture ou choix désactivé).
 */
export function priceSelection(groups: Group[], sel: Sel[], isOut: (c: Choice) => boolean): PriceResult {
  if (sel.length > 40) return { ok: false, message: "Composition invalide." }
  const vis = visibleGroups(groups, sel)
  for (const x of sel) {
    const g = groups.find((y) => y.id === x.g)
    if (!g) return { ok: false, message: "Composition invalide. Actualisez la page." }
    if (!vis.includes(g)) return { ok: false, message: `Le choix « ${g.label} » ne s'applique pas à cette formule.` }
    const c = g.choices.find((y) => y.id === x.c)
    if (!c) return { ok: false, message: "Un choix n'existe plus. Actualisez la page." }
    if (!Number.isInteger(x.q) || x.q < 1 || x.q > 10) return { ok: false, message: "Quantité invalide." }
    if (!g.repeat && x.q !== 1) return { ok: false, message: `« ${c.label} » ne peut être choisi qu'une fois.` }
    if (sel.filter((y) => y.g === x.g && y.c === x.c).length > 1) return { ok: false, message: "Composition invalide." }
    if (isOut(c)) return { ok: false, message: `${c.label} n'est plus disponible. Choisissez une autre option.` }
    if (c.sub) {
      if (!x.s || !c.sub.choices.some((s) => s.id === x.s)) return { ok: false, message: `Précisez « ${c.sub.label} » pour ${c.label}.` }
    } else if (x.s) return { ok: false, message: "Composition invalide." }
  }
  let extra = 0
  const details: string[] = []
  for (const g of vis) {
    const mine = sel.filter((x) => x.g === g.id)
    const total = mine.reduce((s, x) => s + x.q, 0)
    const { min, max } = bounds(g, groups, sel)
    const excl = mine.find((x) => g.choices.find((c) => c.id === x.c)?.exclusive)
    if (excl && mine.length > 1) return { ok: false, message: `« ${g.choices.find((c) => c.id === excl.c)!.label} » ne se combine pas avec un autre choix.` }
    if (!excl && total < min) return { ok: false, message: `${g.label} : choisissez ${min === max ? min : `au moins ${min}`} (${total}/${min}).` }
    if (total > max && !excl) return { ok: false, message: `${g.label} : ${max} maximum.` }
    if (!mine.length) continue
    const parts = mine.map((x) => {
      const c = g.choices.find((y) => y.id === x.c)!
      extra += c.price * x.q
      const sub = c.sub && x.s ? c.sub.choices.find((s) => s.id === x.s)?.label : null
      return `${c.label}${x.q > 1 ? ` ×${x.q}` : ""}${sub ? ` (${sub.toLowerCase()})` : ""}`
    })
    details.push(`${g.label} : ${parts.join(", ")}`)
  }
  return { ok: true, extra: Math.round(extra * 100) / 100, details }
}
