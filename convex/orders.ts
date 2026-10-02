import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  FREE_DELIVERY_FROM, MIN_DELIVERY_ORDER, RESTAURANT, REWARD_POINTS, REWARD_VALUE, TR_DAILY_CAP,
  clean, gate, haversineKm, normalizePhone, rateLimit, round2,
} from "./lib"
import { notifyPos } from "./caisse"
import { type Actor, actor, audit } from "./access"
import { getShop } from "./shop"
import { type Group, hhmmFr, priceSelection, shopState, startOfLocalDay } from "./shared"

type Status = Doc<"orders">["status"]
type Who = Extract<Actor, { ok: true }>

const selV = v.object({ g: v.string(), c: v.string(), q: v.number(), s: v.optional(v.string()) })
const lineInput = v.object({ itemId: v.id("menuItems"), qte: v.number(), sel: v.optional(v.array(selV)), remarque: v.optional(v.string()) })
const orderInput = {
  nom: v.string(),
  tel: v.string(),
  mode: v.union(v.literal("livraison"), v.literal("emporter"), v.literal("surplace")),
  zone: v.optional(v.string()),
  adresse: v.optional(v.string()),
  note: v.optional(v.string()),
  destLat: v.optional(v.number()),
  destLng: v.optional(v.number()),
  payMethod: v.union(v.literal("cb"), v.literal("tr"), v.literal("place")),
  emetteurTr: v.optional(v.string()),
  lignes: v.array(lineInput),
  useReward: v.optional(v.boolean()),
}

type PlaceResult = { ok: true; token: string; num: string; needsPayment: boolean } | { ok: false; message: string }

/** Point d'entrée public : génère un jeton de suivi imprévisible puis crée la commande. */
export const place = action({
  args: orderInput,
  handler: async (ctx, args): Promise<PlaceResult> => {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const customerId = await getAuthUserId(ctx)
    if (!customerId) return { ok: false, message: "Connectez-vous ou créez votre compte pour commander." }
    return await ctx.runMutation(internal.orders.create, { ...args, token, customerId })
  },
})

export const create = internalMutation({
  args: { ...orderInput, token: v.string(), customerId: v.optional(v.id("users")) },
  handler: async (ctx, a): Promise<PlaceResult> => {
    const customerId = a.customerId
    if (!customerId) return { ok: false, message: "Connectez-vous ou créez votre compte pour commander." }
    // --- Le restaurant accepte-t-il des commandes ? (ouverture, pause, horaires : contrôlé ici, pas seulement à l'écran)
    const shop = await getShop(ctx)
    const state = shopState(shop, Date.now())
    if (!state.accepting) return { ok: false, message: state.reason }
    // --- Anti-abus
    const tel = normalizePhone(a.tel)
    if (!(await rateLimit(ctx, "order:global", 40, 60_000))) return { ok: false, message: "Beaucoup de commandes en ce moment, réessayez dans une minute." }
    if (!/^\+?\d{9,15}$/.test(tel)) return { ok: false, message: "Numéro de téléphone invalide." }
    if (!(await rateLimit(ctx, "order:tel:" + tel, 5, 15 * 60_000))) return { ok: false, message: "Trop de commandes avec ce numéro. Réessayez dans quelques minutes." }
    const nom = clean(a.nom, 60)
    if (nom.length < 2) return { ok: false, message: "Merci d'indiquer votre nom." }
    if (a.lignes.length === 0 || a.lignes.length > 30) return { ok: false, message: "Panier invalide." }

    // --- Prix et compositions recalculés depuis la carte (jamais depuis le navigateur)
    const ingredients = new Map((await ctx.db.query("ingredients").collect()).map((g) => [g._id as string, g]))
    const lignes: Doc<"orders">["lignes"] = []
    let st = 0
    for (const l of a.lignes) {
      if (!Number.isInteger(l.qte) || l.qte < 1 || l.qte > 30) return { ok: false, message: "Quantité invalide." }
      const item = await ctx.db.get(l.itemId)
      if (!item || !item.active) return { ok: false, message: "Un article n'est plus disponible. Actualisez la page." }
      if (item.outOfStock) return { ok: false, message: `${item.name} est en rupture pour le moment. Retirez-le du panier.` }
      let pu = item.price
      let details: string[] | undefined
      if (item.optionGroups?.length) {
        const r = priceSelection(item.optionGroups as Group[], l.sel ?? [], (c) => !!c.off || (!!c.ingredientId && !!ingredients.get(c.ingredientId)?.outOfStock))
        if (!r.ok) return { ok: false, message: `${item.name} : ${r.message}` }
        pu = round2(item.price + r.extra)
        details = r.details
      } else if (l.sel?.length) return { ok: false, message: "Composition invalide. Actualisez la page." }
      const remarque = clean(l.remarque, 120)
      if (remarque) details = [...(details ?? []), `Remarque : ${remarque}`]
      lignes.push({ article: item.name, qte: l.qte, pu, ...(details ? { details } : {}) })
      st += pu * l.qte
    }
    st = round2(st)

    let frais = 0
    let zone: string | undefined
    let destLat: number | undefined
    let destLng: number | undefined
    if (a.mode === "livraison") {
      const inMayotte = (lat?: number, lng?: number) => lat !== undefined && lng !== undefined && lat > -13.1 && lat < -12.6 && lng > 44.9 && lng < 45.35
      let z = a.zone ? await ctx.db.query("zones").withIndex("by_name", (q) => q.eq("name", a.zone!)).first() : null
      if (inMayotte(a.destLat, a.destLng)) {
        const all = await ctx.db.query("zones").collect()
        let best: (typeof all)[number] | null = null
        let bestKm = Infinity
        for (const c of all) { const d = haversineKm(a.destLat!, a.destLng!, c.lat, c.lng); if (d < bestKm) { bestKm = d; best = c } }
        if (!best || bestKm > 3) return { ok: false, message: "Votre position semble hors de nos quartiers de livraison. Appelez le restaurant au 06 39 67 01 13." }
        z = best
      }
      if (!z) return { ok: false, message: "Choisissez votre quartier de livraison." }
      if (st < MIN_DELIVERY_ORDER) return { ok: false, message: `Minimum de ${MIN_DELIVERY_ORDER} € pour la livraison.` }
      if (clean(a.adresse, 200).length < 3) return { ok: false, message: "Indiquez une adresse ou un repère pour le livreur." }
      zone = z.name
      frais = st >= FREE_DELIVERY_FROM ? 0 : z.fee
      if (inMayotte(a.destLat, a.destLng)) { destLat = round6(a.destLat!); destLng = round6(a.destLng!) }
      else { destLat = z.lat; destLng = z.lng }
    }
    let remise = 0
    let pointsUsed = 0
    if (a.useReward) {
      const u = await ctx.db.get(customerId)
      if (!u || (u.loyaltyPoints ?? 0) < REWARD_POINTS) return { ok: false, message: `Il faut ${REWARD_POINTS} points pour utiliser la réduction.` }
      if (st < MIN_DELIVERY_ORDER) return { ok: false, message: `La réduction fidélité s'utilise dès ${MIN_DELIVERY_ORDER} € de commande.` }
      remise = REWARD_VALUE
      pointsUsed = REWARD_POINTS
    }
    const total = round2(st + frais - remise)
    let montantTr = 0
    let montantCb = 0
    if (a.payMethod === "tr") { montantTr = round2(Math.min(st - remise, TR_DAILY_CAP)); montantCb = round2(total - montantTr) }
    else if (a.payMethod === "cb") montantCb = total

    const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "order")).first()
    const n = (counter?.value ?? 1041) + 1
    if (counter) await ctx.db.patch(counter._id, { value: n })
    else await ctx.db.insert("counters", { name: "order", value: n })
    const num = "LB-" + n

    const orderId = await ctx.db.insert("orders", {
      num, trackingToken: a.token, nom, tel, mode: a.mode, zone,
      adresse: a.mode === "livraison" ? clean(a.adresse, 200) : undefined,
      note: clean(a.note, 300) || undefined, destLat, destLng, lignes,
      sousTotal: st, frais, total, payMethod: a.payMethod,
      emetteurTr: a.payMethod === "tr" ? clean(a.emetteurTr, 40) : undefined,
      montantTr, montantCb, paidTr: 0, paidCb: 0,
      status: a.payMethod === "place" ? "recue" : "attente_paiement",
      customerId,
      remise: remise || undefined,
      pointsUsed: pointsUsed || undefined,
    })
    {
      const u = await ctx.db.get(customerId)
      if (u) await ctx.db.patch(customerId, {
        ...(pointsUsed ? { loyaltyPoints: (u.loyaltyPoints ?? 0) - pointsUsed } : {}),
        customerName: u.customerName ?? nom,
        customerPhone: u.customerPhone ?? tel,
        defaultZone: u.defaultZone ?? zone,
        defaultAddress: u.defaultAddress ?? (a.mode === "livraison" ? clean(a.adresse, 200) : undefined),
      })
    }
    const order = (await ctx.db.get(orderId))!
    await audit(ctx, "systeme", "Commande reçue", { order, detail: `${lignes.reduce((s, l) => s + l.qte, 0)} article(s), ${a.payMethod === "place" ? "à encaisser" : "paiement en ligne en attente"}` })
    if (a.payMethod === "place") await onConfirmed(ctx, order)
    else await ctx.scheduler.runAfter(30 * 60_000, internal.orders.expireUnpaid, { orderId })
    return { ok: true, token: a.token, num, needsPayment: a.payMethod !== "place" }
  },
})
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Commande confirmée (payée ou à encaisser) : envoi à la caisse et acceptation automatique si activée. */
async function onConfirmed(ctx: MutationCtx, o: Doc<"orders">) {
  const shop = await getShop(ctx)
  if (shop.autoAccept) {
    const now = Date.now()
    await ctx.db.patch(o._id, { status: "preparation", acceptedAt: now, promisedAt: now + shop.prepMinutes * 60_000 })
    await audit(ctx, "systeme", "Acceptée automatiquement", { order: o, detail: `prête vers ${hhmmFr(now + shop.prepMinutes * 60_000)}` })
    await notifyPos(ctx, o._id, "recue")
    await notifyPos(ctx, o._id, "preparation")
  } else await notifyPos(ctx, o._id, "recue")
}

// ---------- Suivi client (accès par jeton secret ; aucune donnée personnelle renvoyée)
export const track = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (token.length < 20 || token.length > 64) return null
    const o = await ctx.db.query("orders").withIndex("by_token", (q) => q.eq("trackingToken", token)).first()
    if (!o) return null
    let driver: { lat: number; lng: number; updatedAt: number; heading: number | null } | null = null
    if (o.status === "en_livraison") {
      const loc = await ctx.db.query("driverLocations").withIndex("by_order", (q) => q.eq("orderId", o._id)).first()
      if (loc && Date.now() - loc.updatedAt < 10 * 60_000) driver = { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt, heading: loc.heading ?? null }
    }
    const shop = await getShop(ctx)
    return {
      num: o.num, createdAt: o._creationTime, mode: o.mode, zone: o.zone ?? null, status: o.status,
      lignes: o.lignes, sousTotal: o.sousTotal, frais: o.frais, remise: o.remise ?? 0, total: o.total,
      payMethod: o.payMethod, montantTr: o.montantTr, montantCb: o.montantCb, paidTr: o.paidTr, paidCb: o.paidCb,
      driverFirstName: o.driverName ? o.driverName.split(" ")[0] : null,
      restaurant: { lat: RESTAURANT.lat, lng: RESTAURANT.lng },
      dest: o.destLat !== undefined && o.destLng !== undefined ? { lat: Math.round(o.destLat * 1000) / 1000, lng: Math.round(o.destLng * 1000) / 1000 } : null,
      driver,
      acceptedAt: o.acceptedAt ?? null,
      promisedAt: o.promisedAt ?? null,
      readyAt: o.readyAt ?? null,
      handedAt: o.handedAt ?? null,
      prepMinutes: shop.prepMinutes,
      refusReason: o.status === "annulee" ? o.refusReason ?? null : null,
    }
  },
})

export const getByTokenInternal = internalQuery({
  args: { token: v.string() },
  handler: (ctx, { token }) => ctx.db.query("orders").withIndex("by_token", (q) => q.eq("trackingToken", token)).first(),
})

// ---------- Restaurant (responsable, équipe, accès cuisine)
const ACTIVE: Status[] = ["attente_paiement", "recue", "preparation", "prete", "en_livraison"]
const view = (o: Doc<"orders">) => ({ ...o, trackingToken: undefined, customerId: undefined })

export const staffList = query({
  args: { kt: v.optional(v.string()) },
  handler: async (ctx, { kt }) => {
    const a = await actor(ctx, kt, ["admin", "staff", "kitchen"])
    if (!a.ok) return a
    const active: Doc<"orders">[] = []
    for (const s of ACTIVE) active.push(...(await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", s)).collect()))
    const since = startOfLocalDay(Date.now())
    const done = (await ctx.db.query("orders").withIndex("by_creation_time", (q) => q.gt("_creationTime", since)).order("desc").take(200)).filter((o) => !ACTIVE.includes(o.status))
    const drivers = (await ctx.db.query("users").collect()).filter((u) => u.role === "driver").map((u) => ({ _id: u._id, name: u.name || "Livreur sans nom" }))
    const finished = done.filter((o) => o.readyAt && o.acceptedAt)
    const avgPrep = finished.length ? Math.round(finished.reduce((s, o) => s + (o.readyAt! - o.acceptedAt!), 0) / finished.length / 60_000) : null
    return {
      ok: true as const,
      role: a.kind,
      who: a.label,
      needEmployee: a.kind === "kitchen" && !a.employeeId,
      active: active.sort((x, y) => x._creationTime - y._creationTime).map(view),
      done: done.map(view),
      drivers,
      avgPrep,
    }
  },
})

/** Historique d'une commande (qui a fait quoi). */
export const timeline = query({
  args: { kt: v.optional(v.string()), orderId: v.id("orders") },
  handler: async (ctx, { kt, orderId }) => {
    const a = await actor(ctx, kt, ["admin", "staff", "kitchen"])
    if (!a.ok) return a
    const rows = await ctx.db.query("auditLog").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect()
    return { ok: true as const, rows: rows.map((r) => ({ at: r._creationTime, action: r.action, actor: r.actor, detail: r.detail ?? "", motif: r.motif ?? "" })) }
  },
})

/** Recherche dans les commandes : 48 h pour l'équipe, 30 jours pour le responsable. */
export const history = query({
  args: { kt: v.optional(v.string()), q: v.optional(v.string()) },
  handler: async (ctx, { kt, q }) => {
    const a = await actor(ctx, kt, ["admin", "staff", "kitchen"])
    if (!a.ok) return a
    const days = a.kind === "admin" ? 30 : 2
    const rows = await ctx.db.query("orders").withIndex("by_creation_time", (x) => x.gt("_creationTime", Date.now() - days * 24 * 3600_000)).order("desc").take(400)
    const term = clean(q, 40).toLowerCase()
    const hit = term ? rows.filter((o) => o.num.toLowerCase().includes(term) || o.nom.toLowerCase().includes(term) || o.tel.includes(term.replace(/\s/g, ""))) : rows
    return { ok: true as const, days, rows: hit.slice(0, 100).map(view) }
  },
})

/** Chiffres du jour : responsable uniquement (finances confidentielles). */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const since = startOfLocalDay(Date.now())
    const rows = (await ctx.db.query("orders").withIndex("by_creation_time", (q) => q.gt("_creationTime", since)).collect()).filter((o) => o.status !== "attente_paiement")
    const valid = rows.filter((o) => o.status !== "annulee")
    const sum = (f: (o: Doc<"orders">) => number) => round2(valid.reduce((s, o) => s + f(o), 0))
    const prep = valid.filter((o) => o.readyAt && o.acceptedAt)
    return {
      ok: true as const,
      count: valid.length,
      cancelled: rows.length - valid.length,
      revenue: sum((o) => o.total),
      online: sum((o) => o.paidCb + o.paidTr),
      toCollect: sum((o) => (o.payMethod === "place" ? o.total : 0)),
      tr: sum((o) => o.paidTr),
      delivery: sum((o) => o.frais),
      avgPrep: prep.length ? Math.round(prep.reduce((s, o) => s + (o.readyAt! - o.acceptedAt!), 0) / prep.length / 60_000) : null,
      byMode: { livraison: valid.filter((o) => o.mode === "livraison").length, emporter: valid.filter((o) => o.mode === "emporter").length, surplace: valid.filter((o) => o.mode === "surplace").length },
      orders: valid.map((o) => ({ _id: o._id, num: o.num, at: o._creationTime, total: o.total, payMethod: o.payMethod, paidCb: o.paidCb, paidTr: o.paidTr, emetteurTr: o.emetteurTr ?? null, status: o.status })),
    }
  },
})

// ---------- Actions sur une commande. `expect` = statut vu à l'écran : si un autre appareil a déjà agi, rien n'est fait.
type Res = { ok: true; status?: Status } | { ok: false; code: string; message: string }

async function load(ctx: MutationCtx, kt: string | undefined, orderId: Id<"orders">, expect: Status[] | undefined, roles: ("admin" | "staff" | "kitchen" | "driver")[] = ["admin", "staff", "kitchen"]): Promise<{ err: Res } | { who: Who; o: Doc<"orders"> }> {
  const who = await actor(ctx, kt, roles, true)
  if (!who.ok) return { err: { ok: false, code: who.code, message: who.message } }
  const o = await ctx.db.get(orderId)
  if (!o) return { err: { ok: false, code: "NOT_FOUND", message: "Commande introuvable." } }
  if (expect && !expect.includes(o.status)) return { err: { ok: false, code: "CONFLICT", message: `Déjà traitée sur un autre appareil (statut actuel : ${STATUS_FR[o.status]}).` } }
  return { who, o }
}
const STATUS_FR: Record<Status, string> = { attente_paiement: "en attente de paiement", recue: "nouvelle", preparation: "en préparation", prete: "prête", en_livraison: "remise au livreur", livree: "livrée", recuperee: "remise au client", annulee: "annulée" }

export const accept = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders"), minutes: v.optional(v.number()) },
  handler: async (ctx, a): Promise<Res> => {
    const r = await load(ctx, a.kt, a.orderId, ["recue"])
    if ("err" in r) return r.err
    const shop = await getShop(ctx)
    const mins = a.minutes ?? shop.prepMinutes
    if (!Number.isInteger(mins) || mins < 5 || mins > 90) return { ok: false, code: "INVALID", message: "Délai entre 5 et 90 minutes." }
    const now = Date.now()
    await ctx.db.patch(r.o._id, { status: "preparation", acceptedAt: now, promisedAt: now + mins * 60_000 })
    await audit(ctx, r.who, "Acceptée", { order: r.o, detail: `prête vers ${hhmmFr(now + mins * 60_000)}` })
    await notifyPos(ctx, r.o._id, "preparation")
    return { ok: true, status: "preparation" }
  },
})

const REFUS_MOTIFS = ["Article en rupture", "Restaurant complet", "Fermeture imminente", "Adresse hors zone", "Commande suspecte", "Autre"]

/** Refus (avant préparation) avec motif obligatoire ; les points utilisés sont rendus. */
export const refuse = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders"), motif: v.string(), precision: v.optional(v.string()) },
  handler: async (ctx, a): Promise<Res & { refundNeeded?: boolean }> => {
    const r = await load(ctx, a.kt, a.orderId, ["recue"])
    if ("err" in r) return r.err
    if (!REFUS_MOTIFS.includes(a.motif)) return { ok: false, code: "INVALID", message: "Choisissez un motif de refus." }
    const motif = a.motif === "Autre" ? clean(a.precision, 120) : a.motif
    if (!motif || motif.length < 3) return { ok: false, code: "INVALID", message: "Précisez le motif." }
    await ctx.db.patch(r.o._id, { status: "annulee", finishedAt: Date.now(), refusReason: motif })
    await refundPoints(ctx, r.o._id)
    await audit(ctx, r.who, "Refusée", { order: r.o, motif })
    await notifyPos(ctx, r.o._id, "annulee")
    return { ok: true, status: "annulee", refundNeeded: r.o.paidCb + r.o.paidTr > 0 }
  },
})

/** Annoncer ou ajuster le délai (5 à 60 min de plus) : le client voit la nouvelle heure. */
export const setDelay = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders"), addMinutes: v.number(), motif: v.optional(v.string()) },
  handler: async (ctx, a): Promise<Res> => {
    const r = await load(ctx, a.kt, a.orderId, ["preparation"])
    if ("err" in r) return r.err
    const limit = r.who.kind === "admin" ? 120 : 30
    if (!Number.isInteger(a.addMinutes) || a.addMinutes < 5 || a.addMinutes > limit) return { ok: false, code: "LIMIT", message: `Retard annoncé : de 5 à ${limit} minutes. Au-delà, prévenez le responsable.` }
    const base = Math.max(r.o.promisedAt ?? Date.now(), Date.now())
    const promisedAt = base + a.addMinutes * 60_000
    await ctx.db.patch(r.o._id, { promisedAt })
    await audit(ctx, r.who, "Délai modifié", { order: r.o, detail: `+${a.addMinutes} min, prête vers ${hhmmFr(promisedAt)}`, motif: a.motif })
    return { ok: true }
  },
})

export const toggleCheck = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders"), index: v.number() },
  handler: async (ctx, a): Promise<Res> => {
    const r = await load(ctx, a.kt, a.orderId, ["recue", "preparation", "prete"])
    if ("err" in r) return r.err
    if (!Number.isInteger(a.index) || a.index < 0 || a.index >= r.o.lignes.length) return { ok: false, code: "INVALID", message: "Article inconnu." }
    const cur = new Set(r.o.checked ?? [])
    if (cur.has(a.index)) cur.delete(a.index); else cur.add(a.index)
    await ctx.db.patch(r.o._id, { checked: [...cur].sort((x, y) => x - y) })
    return { ok: true }
  },
})

export const markReady = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders") },
  handler: async (ctx, a): Promise<Res> => {
    const r = await load(ctx, a.kt, a.orderId, ["preparation"])
    if ("err" in r) return r.err
    await ctx.db.patch(r.o._id, { status: "prete", readyAt: Date.now() })
    await audit(ctx, r.who, "Marquée prête", { order: r.o })
    await notifyPos(ctx, r.o._id, "prete")
    return { ok: true, status: "prete" }
  },
})

/** Correction « prête » → « en préparation », seulement avant la remise. */
export const backToPrep = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders"), motif: v.string() },
  handler: async (ctx, a): Promise<Res> => {
    const r = await load(ctx, a.kt, a.orderId, ["prete"])
    if ("err" in r) return r.err
    const motif = clean(a.motif, 120)
    if (motif.length < 3) return { ok: false, code: "INVALID", message: "Indiquez pourquoi la commande repasse en préparation." }
    await ctx.db.patch(r.o._id, { status: "preparation", readyAt: undefined })
    await audit(ctx, r.who, "Repassée en préparation", { order: r.o, motif })
    return { ok: true, status: "preparation" }
  },
})

/** Remise : au client (à emporter / sur place) ou au livreur (livraison). Distinct de « livrée au client ». */
export const handOver = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders"), numCheck: v.string() },
  handler: async (ctx, a): Promise<Res> => {
    const r = await load(ctx, a.kt, a.orderId, ["prete"])
    if ("err" in r) return r.err
    if (a.numCheck.trim().toUpperCase().replace(/^LB-?/, "") !== r.o.num.replace("LB-", "")) return { ok: false, code: "NUM", message: "Le numéro ne correspond pas à cette commande. Vérifiez avant de remettre." }
    const now = Date.now()
    if (r.o.mode === "livraison") {
      await ctx.db.patch(r.o._id, { status: "en_livraison", handedAt: now, handedTo: "livreur", deliveryStartedAt: r.o.deliveryStartedAt ?? now })
      await audit(ctx, r.who, "Remise au livreur", { order: r.o, detail: r.o.driverName ?? "livreur" })
      await notifyPos(ctx, r.o._id, "en_livraison")
      return { ok: true, status: "en_livraison" }
    }
    await ctx.db.patch(r.o._id, { status: "recuperee", handedAt: now, handedTo: "client", finishedAt: now })
    await awardPoints(ctx, r.o._id)
    await audit(ctx, r.who, "Remise au client", { order: r.o })
    await notifyPos(ctx, r.o._id, "recuperee")
    return { ok: true, status: "recuperee" }
  },
})

export const setNote = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders"), note: v.string() },
  handler: async (ctx, a): Promise<Res> => {
    const r = await load(ctx, a.kt, a.orderId, undefined)
    if ("err" in r) return r.err
    const note = clean(a.note, 300)
    await ctx.db.patch(r.o._id, { noteInterne: note || undefined })
    await audit(ctx, r.who, "Note interne", { order: r.o, detail: note || "(effacée)" })
    return { ok: true }
  },
})

const PROBLEM_TYPES = ["Rupture d'un article", "Retard en cuisine", "Client injoignable", "Problème de coursier", "Erreur ou oubli", "Doute sur un allergène", "Autre"]

/** Signaler un problème : visible du responsable et tracé. */
export const reportProblem = mutation({
  args: { kt: v.optional(v.string()), orderId: v.id("orders"), type: v.string(), message: v.string() },
  handler: async (ctx, a): Promise<Res> => {
    const r = await load(ctx, a.kt, a.orderId, undefined)
    if ("err" in r) return r.err
    if (!PROBLEM_TYPES.includes(a.type)) return { ok: false, code: "INVALID", message: "Choisissez le type de problème." }
    const message = clean(a.message, 300)
    if (message.length < 3) return { ok: false, code: "INVALID", message: "Décrivez le problème en quelques mots." }
    if ((r.o.problems?.length ?? 0) >= 20) return { ok: false, code: "LIMIT", message: "Trop de signalements sur cette commande : appelez le responsable." }
    await ctx.db.patch(r.o._id, { problems: [...(r.o.problems ?? []), { type: a.type, message, at: Date.now(), by: r.who.label }] })
    await audit(ctx, r.who, "Problème signalé", { order: r.o, detail: a.type, motif: message })
    return { ok: true }
  },
})

/** Impression du ticket : la 2e impression et les suivantes sont marquées « DUPLICATA ». */
export const printed = mutation({
  args: { kt: v.optional(v.string()), orderIds: v.array(v.id("orders")) },
  handler: async (ctx, a) => {
    const who = await actor(ctx, a.kt, ["admin", "staff", "kitchen"], true)
    if (!who.ok) return who
    if (a.orderIds.length > 30) return { ok: false as const, code: "LIMIT", message: "30 tickets maximum à la fois." }
    const out: { orderId: Id<"orders">; copy: number }[] = []
    for (const id of a.orderIds) {
      const o = await ctx.db.get(id)
      if (!o) continue
      const copy = (o.printCount ?? 0) + 1
      await ctx.db.patch(id, { printCount: copy })
      await audit(ctx, who, copy > 1 ? "Ticket réimprimé (duplicata)" : "Ticket imprimé", { order: o })
      out.push({ orderId: id, copy })
    }
    return { ok: true as const, copies: out }
  },
})

/** Ancienne action « étape suivante », conservée pour compatibilité. */
export const advance = mutation({
  args: { orderId: v.id("orders"), kt: v.optional(v.string()) },
  handler: async (ctx, { orderId, kt }): Promise<Res> => {
    const r = await load(ctx, kt, orderId, ["recue", "preparation"])
    if ("err" in r) return r.err
    const now = Date.now()
    if (r.o.status === "recue") {
      const shop = await getShop(ctx)
      await ctx.db.patch(orderId, { status: "preparation", acceptedAt: now, promisedAt: now + shop.prepMinutes * 60_000 })
      await audit(ctx, r.who, "Acceptée", { order: r.o })
      await notifyPos(ctx, orderId, "preparation")
      return { ok: true, status: "preparation" }
    }
    await ctx.db.patch(orderId, { status: "prete", readyAt: now })
    await audit(ctx, r.who, "Marquée prête", { order: r.o })
    await notifyPos(ctx, orderId, "prete")
    return { ok: true, status: "prete" }
  },
})

export const assignDriver = mutation({
  args: { orderId: v.id("orders"), driverId: v.optional(v.id("users")), kt: v.optional(v.string()) },
  handler: async (ctx, { orderId, driverId, kt }): Promise<Res> => {
    const r = await load(ctx, kt, orderId, ["recue", "preparation", "prete"])
    if ("err" in r) return r.err
    if (r.o.mode !== "livraison") return { ok: false, code: "INVALID", message: "Cette commande n'est pas une livraison." }
    if (!driverId) {
      await ctx.db.patch(orderId, { driverId: undefined, driverName: undefined })
      await audit(ctx, r.who, "Livreur retiré", { order: r.o })
      return { ok: true }
    }
    const d = await ctx.db.get(driverId)
    if (!d || d.role !== "driver") return { ok: false, code: "INVALID", message: "Livreur introuvable." }
    await ctx.db.patch(orderId, { driverId, driverName: d.name || "Votre livreur" })
    await audit(ctx, r.who, "Livreur affecté", { order: r.o, detail: d.name || d.email || "" })
    return { ok: true }
  },
})

/** Annulation : l'équipe seulement avant préparation (avec motif) ; le responsable à tout moment avant la remise. */
export const cancel = mutation({
  args: { orderId: v.id("orders"), kt: v.optional(v.string()), motif: v.optional(v.string()) },
  handler: async (ctx, { orderId, kt, motif }): Promise<Res & { refundNeeded?: boolean }> => {
    const who = await actor(ctx, kt, ["admin", "staff", "kitchen"], true)
    if (!who.ok) return who
    const o = await ctx.db.get(orderId)
    if (!o || ["livree", "recuperee", "annulee"].includes(o.status)) return { ok: false, code: "INVALID", message: "Annulation impossible : commande terminée ou déjà annulée." }
    if (who.kind !== "admin" && !["attente_paiement", "recue"].includes(o.status)) return { ok: false, code: "FORBIDDEN", message: "Commande déjà en préparation : seul le responsable peut l'annuler." }
    const m = clean(motif, 120)
    if (m.length < 3) return { ok: false, code: "INVALID", message: "Indiquez le motif de l'annulation." }
    await ctx.db.patch(orderId, { status: "annulee", finishedAt: Date.now(), refusReason: m })
    await refundPoints(ctx, orderId)
    await clearLocation(ctx, orderId)
    await audit(ctx, who, "Annulée", { order: o, motif: m, detail: o.paidCb + o.paidTr > 0 ? "Paiement reçu : remboursement à traiter par le responsable" : undefined })
    await notifyPos(ctx, orderId, "annulee")
    return { ok: true, status: "annulee", refundNeeded: o.paidCb + o.paidTr > 0 }
  },
})

// ---------- Livreurs
export const driverBoard = query({
  args: {},
  handler: async (ctx) => {
    const g = await gate(ctx, ["driver", "admin"])
    if (!g.ok) return g
    const mine = [
      ...(await ctx.db.query("orders").withIndex("by_driver", (q) => q.eq("driverId", g.user._id).eq("status", "prete")).collect()),
      ...(await ctx.db.query("orders").withIndex("by_driver", (q) => q.eq("driverId", g.user._id).eq("status", "preparation")).collect()),
      ...(await ctx.db.query("orders").withIndex("by_driver", (q) => q.eq("driverId", g.user._id).eq("status", "en_livraison")).collect()),
    ]
    const open = (await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "prete")).collect()).filter((o) => o.mode === "livraison" && !o.driverId)
    const dv = (o: Doc<"orders">) => ({ _id: o._id, num: o.num, status: o.status, nom: o.nom, tel: o.tel, zone: o.zone, adresse: o.adresse, note: o.note, destLat: o.destLat, destLng: o.destLng, total: o.total, lignes: o.lignes, toCollect: o.payMethod === "place" ? o.total : 0 })
    return { ok: true as const, mine: mine.map(dv), open: open.map((o) => ({ _id: o._id, num: o.num, zone: o.zone })), restaurant: RESTAURANT, role: g.role }
  },
})

export const claim = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const g = await gate(ctx, ["driver"])
    if (!g.ok) return g
    const o = await ctx.db.get(orderId)
    if (!o || o.mode !== "livraison" || o.status !== "prete" || o.driverId) return { ok: false as const, code: "TAKEN", message: "Cette livraison n'est plus disponible." }
    await ctx.db.patch(orderId, { driverId: g.user._id, driverName: g.user.name || "Votre livreur" })
    await audit(ctx, { ok: true, kind: "driver", label: g.user.name || g.user.email || "Livreur" }, "Livraison prise en charge", { order: o })
    return { ok: true as const }
  },
})

export const startDelivery = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const g = await gate(ctx, ["driver"])
    if (!g.ok) return g
    const o = await ctx.db.get(orderId)
    if (!o || o.driverId !== g.user._id || o.status !== "prete") return { ok: false as const, code: "INVALID", message: "La commande doit être prête et vous être affectée." }
    const now = Date.now()
    await ctx.db.patch(orderId, { status: "en_livraison", deliveryStartedAt: now, handedAt: o.handedAt ?? now, handedTo: "livreur" })
    await audit(ctx, { ok: true, kind: "driver", label: g.user.name || g.user.email || "Livreur" }, "Livraison démarrée", { order: o })
    await notifyPos(ctx, orderId, "en_livraison")
    return { ok: true as const }
  },
})

/** Position du livreur : acceptée uniquement de SON livreur, pendant la livraison, et au plus toutes les 3 s. */
export const updateLocation = mutation({
  args: { orderId: v.id("orders"), lat: v.number(), lng: v.number(), accuracy: v.optional(v.number()), heading: v.optional(v.number()), speed: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const g = await gate(ctx, ["driver"])
    if (!g.ok) return g
    const o = await ctx.db.get(a.orderId)
    if (!o || o.driverId !== g.user._id || o.status !== "en_livraison") return { ok: false as const, code: "INVALID", message: "Livraison non active." }
    if (!(a.lat > -13.2 && a.lat < -12.5 && a.lng > 44.8 && a.lng < 45.4)) return { ok: false as const, code: "OUT", message: "Position hors de Mayotte ignorée." }
    if (!(await rateLimit(ctx, "loc:" + g.user._id, 1, 3000))) return { ok: true as const, throttled: true }
    const fin = (n?: number) => (n !== undefined && Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined)
    const row = { orderId: a.orderId, driverId: g.user._id, lat: round6(a.lat), lng: round6(a.lng), accuracy: fin(a.accuracy), heading: fin(a.heading), speed: fin(a.speed), updatedAt: Date.now() }
    const existing = await ctx.db.query("driverLocations").withIndex("by_order", (q) => q.eq("orderId", a.orderId)).first()
    if (existing) await ctx.db.patch(existing._id, row)
    else await ctx.db.insert("driverLocations", row)
    return { ok: true as const }
  },
})

/** Livrée au client : confirmée par le livreur affecté ou par le responsable. */
export const delivered = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const g = await gate(ctx, ["driver", "admin"])
    if (!g.ok) return g
    const o = await ctx.db.get(orderId)
    if (!o || o.status !== "en_livraison" || (g.role === "driver" && o.driverId !== g.user._id)) return { ok: false as const, code: "INVALID", message: "Action impossible." }
    await ctx.db.patch(orderId, { status: "livree", finishedAt: Date.now() })
    await awardPoints(ctx, orderId)
    await clearLocation(ctx, orderId)
    await audit(ctx, { ok: true, kind: g.role, label: g.user.name || g.user.email || "Compte" }, "Livrée au client", { order: o })
    await notifyPos(ctx, orderId, "livree")
    return { ok: true as const }
  },
})

/** Points de fidélité : 1 point par euro, crédités une seule fois quand la commande est livrée ou récupérée. */
async function awardPoints(ctx: { db: MutationCtx["db"] }, orderId: Id<"orders">) {
  const o = await ctx.db.get(orderId)
  if (!o || !o.customerId || o.pointsAwarded) return
  const pts = Math.floor(o.total)
  const u = await ctx.db.get(o.customerId)
  if (u) await ctx.db.patch(o.customerId, { loyaltyPoints: (u.loyaltyPoints ?? 0) + pts })
  await ctx.db.patch(orderId, { pointsAwarded: pts })
}

/** Commande annulée : les points utilisés pour la réduction sont rendus au client (une seule fois). */
async function refundPoints(ctx: { db: MutationCtx["db"] }, orderId: Id<"orders">) {
  const o = await ctx.db.get(orderId)
  if (!o || !o.customerId || !o.pointsUsed || o.pointsRefunded) return
  const u = await ctx.db.get(o.customerId)
  if (u) await ctx.db.patch(o.customerId, { loyaltyPoints: (u.loyaltyPoints ?? 0) + o.pointsUsed })
  await ctx.db.patch(orderId, { pointsRefunded: true })
}

async function clearLocation(ctx: { db: MutationCtx["db"] }, orderId: Id<"orders">) {
  const locs = await ctx.db.query("driverLocations").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect()
  for (const l of locs) await ctx.db.delete(l._id)
}

export const expireUnpaid = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const o = await ctx.db.get(orderId)
    if (o && o.status === "attente_paiement" && o.paidTr + o.paidCb === 0) {
      await ctx.db.patch(orderId, { status: "annulee", finishedAt: Date.now(), refusReason: "Paiement non reçu sous 30 minutes" })
      await refundPoints(ctx, orderId)
      await audit(ctx, "systeme", "Annulée automatiquement", { order: o, motif: "Paiement non reçu sous 30 minutes" })
    }
  },
})

// ---------- Paiement (appelé par stripe.ts)
export const markPaid = internalMutation({
  args: { orderId: v.id("orders"), part: v.union(v.literal("tr"), v.literal("cb")), amount: v.number() },
  handler: async (ctx, a) => {
    const o = await ctx.db.get(a.orderId)
    if (!o) return
    const paidTr = round2(o.paidTr + (a.part === "tr" ? a.amount : 0))
    const paidCb = round2(o.paidCb + (a.part === "cb" ? a.amount : 0))
    const full = paidTr + paidCb >= o.total - 0.001
    await ctx.db.patch(a.orderId, { paidTr, paidCb, ...(full && o.status === "attente_paiement" ? { status: "recue" as const } : {}) })
    await audit(ctx, "systeme", a.part === "tr" ? "Paiement titre-restaurant reçu" : "Paiement carte reçu", { order: o, detail: `${a.amount.toFixed(2)} €` })
    if (full && o.status === "attente_paiement") await onConfirmed(ctx, (await ctx.db.get(a.orderId))!)
  },
})

// ---------- Confidentialité : anonymisation des commandes anciennes (tâche planifiée)
export const anonymizeOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const limit = Date.now() - 30 * 24 * 3600_000
    const old = await ctx.db.query("orders").order("asc").take(200)
    let n = 0
    for (const o of old) {
      if (o._creationTime > limit) break
      if (o.anonymized) continue
      await ctx.db.patch(o._id, { nom: "—", tel: "—", adresse: undefined, note: undefined, noteInterne: undefined, destLat: undefined, destLng: undefined, problems: undefined, anonymized: true })
      n++
    }
    for (const l of await ctx.db.query("driverLocations").collect()) if (Date.now() - l.updatedAt > 2 * 3600_000) await ctx.db.delete(l._id)
    for (const r of await ctx.db.query("rateLimits").take(500)) if (Date.now() - r.windowStart > 3600_000) await ctx.db.delete(r._id)
    // Sessions cuisine expirées ou fermées depuis plus de 7 jours
    for (const s of await ctx.db.query("kitchenSessions").collect()) if ((s.revokedAt ?? s.expiresAt) < Date.now() - 7 * 24 * 3600_000) await ctx.db.delete(s._id)
    return n
  },
})

// Libellés partagés avec les écrans
export const labels = query({ args: {}, handler: async () => ({ refus: REFUS_MOTIFS, problemes: PROBLEM_TYPES }) })
