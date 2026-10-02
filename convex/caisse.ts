import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { gate, rateLimit } from "./lib"

/*
 * Connexion avec n'importe quel logiciel de caisse, par deux moyens standards :
 * 1. Envoi automatique (webhook) : à chaque étape d'une commande, le site envoie la commande en JSON
 *    à l'adresse indiquée par le gérant, signée (HMAC-SHA256) avec un secret que seule la caisse connaît.
 * 2. Lecture (API) : la caisse lit les commandes sur /caisse/commandes avec une clé secrète (JSON ou CSV).
 */

const STATUS_FR: Record<Doc<"orders">["status"], string> = {
  attente_paiement: "En attente de paiement",
  recue: "Reçue",
  preparation: "En préparation",
  prete: "Prête",
  en_livraison: "En livraison",
  livree: "Livrée",
  recuperee: "Récupérée",
  annulee: "Annulée",
}

/** Format commun envoyé à la caisse (version 1). Montants en euros, TTC. */
export function toPos(o: Doc<"orders">) {
  const reglee = o.payMethod === "place" ? false : o.paidCb + o.paidTr >= o.total - 0.001
  return {
    version: 1,
    id: o._id,
    numero: o.num,
    creeLe: new Date(o._creationTime).toISOString(),
    statut: o.status,
    statutLibelle: STATUS_FR[o.status],
    mode: o.mode === "livraison" ? "livraison" : o.mode === "emporter" ? "a_emporter" : "sur_place",
    quartier: o.zone ?? null,
    adresse: o.adresse ?? null,
    client: { nom: o.nom, telephone: o.tel },
    note: o.note ?? null,
    lignes: o.lignes.map((l) => ({ article: l.article, quantite: l.qte, prixUnitaire: l.pu, total: Math.round(l.pu * l.qte * 100) / 100 })),
    sousTotal: o.sousTotal,
    fraisLivraison: o.frais,
    remise: o.remise ?? 0,
    total: o.total,
    devise: "EUR",
    paiement: {
      methode: o.payMethod === "cb" ? "carte_en_ligne" : o.payMethod === "tr" ? "titre_restaurant" : "a_la_livraison_ou_au_retrait",
      emetteurTitre: o.emetteurTr ?? null,
      montantTitre: o.montantTr,
      montantCarte: o.montantCb,
      payeTitre: o.paidTr,
      payeCarte: o.paidCb,
      reglee,
      resteAEncaisser: o.payMethod === "place" ? o.total : Math.max(0, Math.round((o.total - o.paidCb - o.paidTr) * 100) / 100),
    },
    livreur: o.driverName ?? null,
  }
}

async function getConfig(ctx: { db: MutationCtx["db"] }) {
  return await ctx.db.query("posConfig").first()
}

/** Appelé par orders.ts à chaque étape : programme l'envoi vers la caisse si un webhook est configuré. */
export async function notifyPos(ctx: MutationCtx, orderId: Id<"orders">, status: Doc<"orders">["status"]) {
  const c = await getConfig(ctx)
  if (!c?.webhookUrl) return
  await ctx.scheduler.runAfter(0, internal.caisse.send, { orderId, event: "commande." + status, attempt: 0 })
}

// ---------- Contrôle de l'adresse du webhook (https public uniquement)
function checkUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return "Adresse invalide." }
  if (u.protocol !== "https:") return "L'adresse doit commencer par https://"
  const h = u.hostname.toLowerCase()
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return "Utilisez le nom de domaine public de votre caisse (pas d'adresse IP ni de réseau local)."
  if (raw.length > 500) return "Adresse trop longue."
  return null
}

const randomToken = (bytes: number) => {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
}
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("")
}
async function hmac(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, "0")).join("")
}

// ---------- Espace gérant
export const config = query({
  args: {},
  handler: async (ctx) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const c = await ctx.db.query("posConfig").first()
    return {
      ok: true as const,
      webhookUrl: c?.webhookUrl ?? "",
      webhookSecret: c?.webhookSecret ?? "",
      apiKeyHint: c?.apiKeyHint ?? null,
      lastEvent: c?.lastEvent ?? null,
      lastAt: c?.lastAt ?? null,
      lastOk: c?.lastOk ?? null,
      lastError: c?.lastError ?? null,
      apiUrl: (process.env.CONVEX_SITE_URL ?? "") + "/caisse/commandes",
    }
  },
})

export const saveWebhook = mutation({
  args: { url: v.string(), secret: v.optional(v.string()) },
  handler: async (ctx, { url, secret }) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const clean = url.trim()
    const c = await ctx.db.query("posConfig").first()
    if (!clean) {
      if (c) await ctx.db.patch(c._id, { webhookUrl: undefined })
      return { ok: true as const, message: "Envoi automatique désactivé." }
    }
    const err = checkUrl(clean)
    if (err) return { ok: false as const, code: "INVALID", message: err }
    const s = c?.webhookSecret ?? secret
    if (!s || !/^[0-9a-f]{64}$/.test(s)) return { ok: false as const, code: "INVALID", message: "Secret manquant, réessayez." }
    if (c) await ctx.db.patch(c._id, { webhookUrl: clean, webhookSecret: s })
    else await ctx.db.insert("posConfig", { webhookUrl: clean, webhookSecret: s })
    return { ok: true as const, message: "Envoi automatique activé." }
  },
})

/** Génère un secret de signature (aléatoire cryptographique) avant l'enregistrement du webhook. */
export const newSecret = action({
  args: {},
  handler: async () => ({ secret: randomToken(32) }),
})

export const isAdmin = internalQuery({
  args: {},
  handler: async (ctx) => (await gate(ctx, ["admin"])).ok,
})

/** Crée une nouvelle clé de lecture : affichée une seule fois, seule son empreinte est conservée. */
export const createApiKey = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true; key: string } | { ok: false; message: string }> => {
    if (!(await getAuthUserId(ctx)) || !(await ctx.runQuery(internal.caisse.isAdmin, {}))) return { ok: false, message: "Réservé au gérant." }
    const key = "lb_" + randomToken(24)
    await ctx.runMutation(internal.caisse.storeKey, { hash: await sha256(key), hint: key.slice(0, 7) + "…" + key.slice(-4) })
    return { ok: true, key }
  },
})

export const storeKey = internalMutation({
  args: { hash: v.string(), hint: v.string() },
  handler: async (ctx, { hash, hint }) => {
    const c = await ctx.db.query("posConfig").first()
    if (c) await ctx.db.patch(c._id, { apiKeyHash: hash, apiKeyHint: hint })
    else await ctx.db.insert("posConfig", { apiKeyHash: hash, apiKeyHint: hint })
  },
})

export const revokeApiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const c = await ctx.db.query("posConfig").first()
    if (c) await ctx.db.patch(c._id, { apiKeyHash: undefined, apiKeyHint: undefined })
    return { ok: true as const }
  },
})

/** Envoie une commande fictive pour vérifier que la caisse reçoit bien les données. */
export const sendTest = action({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; message: string }> => {
    if (!(await getAuthUserId(ctx)) || !(await ctx.runQuery(internal.caisse.isAdmin, {}))) return { ok: false, message: "Réservé au gérant." }
    const c = await ctx.runQuery(internal.caisse.internalConfig, {})
    if (!c?.webhookUrl || !c.webhookSecret) return { ok: false, message: "Enregistrez d'abord l'adresse de votre caisse." }
    const body = JSON.stringify({ evenement: "test", envoyeLe: new Date().toISOString(), commande: { version: 1, numero: "LB-TEST", statut: "recue", statutLibelle: "Reçue", mode: "a_emporter", client: { nom: "Test", telephone: "" }, lignes: [{ article: "Article de test", quantite: 1, prixUnitaire: 1, total: 1 }], sousTotal: 1, fraisLivraison: 0, remise: 0, total: 1, devise: "EUR" } })
    const r = await post(c.webhookUrl, c.webhookSecret, "test", body)
    await ctx.runMutation(internal.caisse.record, { event: "test", ok: r.ok, error: r.error })
    return { ok: r.ok, message: r.ok ? "La caisse a bien reçu la commande de test." : `Échec : ${r.error}` }
  },
})

// ---------- Envoi (interne)
export const internalConfig = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("posConfig").first(),
})

export const orderPayload = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const o = await ctx.db.get(orderId)
    return o ? toPos(o) : null
  },
})

export const record = internalMutation({
  args: { event: v.string(), ok: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const c = await ctx.db.query("posConfig").first()
    if (c) await ctx.db.patch(c._id, { lastEvent: a.event, lastAt: Date.now(), lastOk: a.ok, lastError: a.ok ? undefined : (a.error ?? "").slice(0, 200) })
  },
})

async function post(url: string, secret: string, event: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const ts = String(Math.floor(Date.now() / 1000))
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LoulouBarquette-Caisse/1",
        "X-Loulou-Event": event,
        "X-Loulou-Timestamp": ts,
        "X-Loulou-Signature": "sha256=" + (await hmac(secret, ts + "." + body)),
      },
      body,
    })
    return res.ok ? { ok: true } : { ok: false, error: `réponse ${res.status}` }
  } catch (e) {
    return { ok: false, error: (e as Error).name === "AbortError" ? "pas de réponse en 10 s" : "connexion impossible" }
  } finally { clearTimeout(timer) }
}

export const send = internalAction({
  args: { orderId: v.id("orders"), event: v.string(), attempt: v.number() },
  handler: async (ctx, { orderId, event, attempt }) => {
    const c = await ctx.runQuery(internal.caisse.internalConfig, {})
    if (!c?.webhookUrl || !c.webhookSecret) return
    const commande = await ctx.runQuery(internal.caisse.orderPayload, { orderId })
    if (!commande) return
    const body = JSON.stringify({ evenement: event, envoyeLe: new Date().toISOString(), commande })
    const r = await post(c.webhookUrl, c.webhookSecret, event, body)
    await ctx.runMutation(internal.caisse.record, { event: `${event} ${commande.numero}`, ok: r.ok, error: r.error })
    // Nouvel essai automatique : après 30 s, 2 min puis 8 min
    if (!r.ok && attempt < 3) await ctx.scheduler.runAfter(30_000 * 4 ** attempt, internal.caisse.send, { orderId, event, attempt: attempt + 1 })
  },
})

// ---------- Lecture par la caisse (API)
export const checkKey = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    if (!(await rateLimit(ctx, "pos:api", 120, 60_000))) return "limit" as const
    const c = await ctx.db.query("posConfig").first()
    return c?.apiKeyHash && c.apiKeyHash === hash ? ("ok" as const) : ("denied" as const)
  },
})

export const listForPos = internalQuery({
  args: { since: v.number(), limit: v.number() },
  handler: async (ctx, { since, limit }) => {
    const rows = await ctx.db.query("orders").withIndex("by_creation_time", (q) => q.gt("_creationTime", since)).order("asc").take(limit)
    return rows.filter((o) => o.status !== "attente_paiement" && !o.anonymized).map(toPos)
  },
})

export async function apiKeyHash(key: string) { return await sha256(key) }

/** Outil interne (jamais depuis le site) : efface entièrement la connexion caisse (adresse, secret, clé, historique). */
export const clearConfig = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const c of await ctx.db.query("posConfig").collect()) await ctx.db.delete(c._id)
  },
})
