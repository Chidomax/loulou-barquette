import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { clean, normalizePhone } from "./lib"

/** Profil du client connecté (n'importe quel compte connecté peut commander en tant que client). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const u = await ctx.db.get(userId)
    if (!u) return null
    return {
      email: u.email ?? "",
      name: u.customerName ?? "",
      phone: u.customerPhone ?? "",
      defaultZone: u.defaultZone ?? "",
      defaultAddress: u.defaultAddress ?? "",
      points: u.loyaltyPoints ?? 0,
      isStaff: !!u.role,
      isAdmin: u.role === "admin",
    }
  },
})

export const updateProfile = mutation({
  args: { name: v.string(), phone: v.string(), defaultZone: v.optional(v.string()), defaultAddress: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false as const, message: "Connexion requise." }
    const name = clean(a.name, 60)
    const phone = normalizePhone(a.phone)
    if (name.length < 2) return { ok: false as const, message: "Indiquez votre nom." }
    if (phone && !/^\+?\d{9,15}$/.test(phone)) return { ok: false as const, message: "Numéro de téléphone invalide." }
    let zone: string | undefined
    if (a.defaultZone) {
      const z = await ctx.db.query("zones").withIndex("by_name", (q) => q.eq("name", a.defaultZone!)).first()
      if (!z) return { ok: false as const, message: "Quartier inconnu." }
      zone = z.name
    }
    await ctx.db.patch(userId, { customerName: name, customerPhone: phone || undefined, defaultZone: zone, defaultAddress: clean(a.defaultAddress, 200) || undefined })
    return { ok: true as const }
  },
})

/** Historique : uniquement les commandes du client connecté. */
export const myOrders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const list = await ctx.db.query("orders").withIndex("by_customer", (q) => q.eq("customerId", userId)).order("desc").take(30)
    return list.map((o) => ({ num: o.num, token: o.trackingToken, createdAt: o._creationTime, total: o.total, status: o.status, mode: o.mode, items: o.lignes.reduce((s, l) => s + l.qte, 0), points: o.pointsAwarded ?? 0 }))
  },
})

/** Suppression du compte client (droit à l'effacement). Les commandes passées restent pour la comptabilité, sans lien avec le compte. */
export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false as const, message: "Connexion requise." }
    const u = await ctx.db.get(userId)
    if (!u) return { ok: false as const, message: "Compte introuvable." }
    if (u.role) return { ok: false as const, message: "Ce compte fait partie de l'équipe : demandez au gérant de retirer l'accès." }
    for (const o of await ctx.db.query("orders").withIndex("by_customer", (q) => q.eq("customerId", userId)).collect()) await ctx.db.patch(o._id, { customerId: undefined })
    for (const a of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect()) {
      for (const c of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", a._id)).collect()) await ctx.db.delete(c._id)
      await ctx.db.delete(a._id)
    }
    for (const s of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect()) {
      for (const t of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect()) await ctx.db.delete(t._id)
      await ctx.db.delete(s._id)
    }
    await ctx.db.delete(userId)
    return { ok: true as const }
  },
})
