import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { actor, audit } from "./access"
import { clean } from "./lib"
import { DEFAULT_SHOP, type Hours, type ShopSettings, hhmmFr, hoursText, shopState } from "./shared"

export async function getShop(ctx: QueryCtx | MutationCtx): Promise<ShopSettings & { _id?: any }> {
  const s = await ctx.db.query("shopSettings").first()
  return s ?? { ...DEFAULT_SHOP }
}

async function patchShop(ctx: MutationCtx, patch: Partial<ShopSettings>) {
  const s = await ctx.db.query("shopSettings").first()
  if (s) await ctx.db.patch(s._id, patch)
  else await ctx.db.insert("shopSettings", { ...DEFAULT_SHOP, ...patch })
}

/** Réglages visibles par l'équipe et le responsable. */
export const settings = query({
  args: { kt: v.optional(v.string()) },
  handler: async (ctx, { kt }) => {
    const a = await actor(ctx, kt, ["admin", "staff", "kitchen"])
    if (!a.ok) return a
    const s = await getShop(ctx)
    return { ok: true as const, role: a.kind, settings: { open: s.open, pausedUntil: s.pausedUntil ?? null, pauseReason: s.pauseReason ?? "", autoAccept: s.autoAccept, prepMinutes: s.prepMinutes, hours: s.hours }, hoursText: hoursText(s.hours) }
  },
})

/** Pause des commandes (équipe) : 15 ou 30 minutes, renouvelable, avec motif. Les commandes acceptées restent visibles. */
export const pause = mutation({
  args: { kt: v.optional(v.string()), minutes: v.number(), motif: v.string() },
  handler: async (ctx, a) => {
    const who = await actor(ctx, a.kt, ["admin", "staff", "kitchen"], true)
    if (!who.ok) return who
    const allowed = who.kind === "admin" ? [15, 30, 60, 120] : [15, 30]
    if (!allowed.includes(a.minutes)) return { ok: false as const, code: "INVALID", message: "Durée de pause non autorisée." }
    const motif = clean(a.motif, 120)
    if (motif.length < 3) return { ok: false as const, code: "INVALID", message: "Indiquez le motif de la pause." }
    const s = await getShop(ctx)
    const from = s.pausedUntil && s.pausedUntil > Date.now() ? s.pausedUntil : Date.now()
    const until = from + a.minutes * 60_000
    if (until - Date.now() > 3 * 3600_000) return { ok: false as const, code: "LIMIT", message: "Pause trop longue : le responsable doit fermer le restaurant." }
    await patchShop(ctx, { pausedUntil: until, pauseReason: motif })
    await audit(ctx, who, "Commandes en pause", { detail: `jusqu'à ${hhmmFr(until)}`, motif })
    await ctx.scheduler.runAt(until, internal.shop.pauseEnded, { until })
    return { ok: true as const, until }
  },
})

export const resume = mutation({
  args: { kt: v.optional(v.string()) },
  handler: async (ctx, { kt }) => {
    const who = await actor(ctx, kt, ["admin", "staff", "kitchen"], true)
    if (!who.ok) return who
    await patchShop(ctx, { pausedUntil: undefined, pauseReason: undefined })
    await audit(ctx, who, "Reprise des commandes")
    return { ok: true as const }
  },
})

export const pauseEnded = internalMutation({
  args: { until: v.number() },
  handler: async (ctx, { until }) => {
    const s = await getShop(ctx)
    if (s.pausedUntil === until) { await patchShop(ctx, { pausedUntil: undefined, pauseReason: undefined }); await audit(ctx, "systeme", "Fin de la pause des commandes") }
  },
})

/** Ouverture / fermeture durable, horaires, acceptation automatique et délai : responsable uniquement. */
export const update = mutation({
  args: {
    open: v.optional(v.boolean()),
    autoAccept: v.optional(v.boolean()),
    prepMinutes: v.optional(v.number()),
    hours: v.optional(v.array(v.union(v.null(), v.object({ open: v.string(), close: v.string() })))),
  },
  handler: async (ctx, a) => {
    const who = await actor(ctx, undefined, ["admin"])
    if (!who.ok) return who
    const patch: Partial<ShopSettings> = {}
    const changes: string[] = []
    if (a.open !== undefined) { patch.open = a.open; changes.push(a.open ? "restaurant ouvert" : "restaurant fermé") }
    if (a.autoAccept !== undefined) { patch.autoAccept = a.autoAccept; changes.push(`acceptation automatique ${a.autoAccept ? "activée" : "désactivée"}`) }
    if (a.prepMinutes !== undefined) {
      if (!Number.isInteger(a.prepMinutes) || a.prepMinutes < 5 || a.prepMinutes > 120) return { ok: false as const, code: "INVALID", message: "Délai de préparation : entre 5 et 120 minutes." }
      patch.prepMinutes = a.prepMinutes; changes.push(`délai ${a.prepMinutes} min`)
    }
    if (a.hours !== undefined) {
      if (a.hours.length !== 7) return { ok: false as const, code: "INVALID", message: "Horaires invalides." }
      for (const h of a.hours) if (h && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.close) || h.open >= h.close)) return { ok: false as const, code: "INVALID", message: "Chaque jour ouvert doit avoir une heure d'ouverture avant l'heure de fermeture." }
      patch.hours = a.hours as Hours; changes.push(`horaires : ${hoursText(a.hours as Hours)}`)
    }
    await patchShop(ctx, patch)
    if (changes.length) await audit(ctx, who, "Réglages du service", { detail: changes.join(" ; ") })
    return { ok: true as const }
  },
})

/** Contrôle serveur avant toute nouvelle commande. */
export async function assertAccepting(ctx: MutationCtx) {
  return shopState(await getShop(ctx), Date.now())
}
