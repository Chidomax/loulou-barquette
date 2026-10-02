import { v } from "convex/values"
import { internalMutation } from "./_generated/server"

/**
 * Outil interne (inaccessible depuis le site) : supprime uniquement les données créées pendant les tests
 * (commandes au nom « QA Testeur » / « Rafale QA » et comptes e2e+…@e2e.macaly.dev).
 * @deprecated Conservé car Macaly n'autorise pas le retrait d'une fonction déjà déployée en une seule étape.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, number> = { orders: 0, payments: 0, users: 0, auth: 0, invites: 0, rate: 0, locations: 0 }
    for (const o of await ctx.db.query("orders").collect()) {
      if (!["QA Testeur", "Rafale QA"].includes(o.nom)) continue
      for (const a of await ctx.db.query("auditLog").withIndex("by_order", (q) => q.eq("orderId", o._id)).collect()) await ctx.db.delete(a._id)
      for (const p of await ctx.db.query("payments").withIndex("by_order_and_mode", (q) => q.eq("orderId", o._id)).collect()) { await ctx.db.delete(p._id); out.payments++ }
      for (const l of await ctx.db.query("driverLocations").withIndex("by_order", (q) => q.eq("orderId", o._id)).collect()) { await ctx.db.delete(l._id); out.locations++ }
      await ctx.db.delete(o._id); out.orders++
    }
    for (const u of await ctx.db.query("users").collect()) {
      if (!u.email?.startsWith("e2e+") || !u.email.endsWith("@e2e.macaly.dev")) continue
      for (const a of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", u._id)).collect()) {
        for (const c of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", a._id)).collect()) { await ctx.db.delete(c._id); out.auth++ }
        await ctx.db.delete(a._id); out.auth++
      }
      for (const s of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", u._id)).collect()) {
        for (const t of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect()) { await ctx.db.delete(t._id); out.auth++ }
        await ctx.db.delete(s._id); out.auth++
      }
      await ctx.db.delete(u._id); out.users++
    }
    for (const i of await ctx.db.query("invites").collect()) if (i.email.startsWith("e2e+")) { await ctx.db.delete(i._id); out.invites++ }
    for (const r of await ctx.db.query("rateLimits").collect()) { await ctx.db.delete(r._id); out.rate++ }
    // Annonce de test laissée sur l'accueil
    for (const st of await ctx.db.query("siteSettings").collect()) if (st.annonce?.startsWith("Test QA")) await ctx.db.patch(st._id, { annonce: "" })
    if (!(await ctx.db.query("orders").first())) {
      const c = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "order")).first()
      if (c) await ctx.db.delete(c._id)
    }
    return out
  },
})

/** Outil de test interne : crédite des points à un compte de test e2e uniquement (jamais à un vrai client). */
export const setTestPoints = internalMutation({
  args: { email: v.string(), points: v.number() },
  handler: async (ctx, { email, points }) => {
    if (!email.startsWith("e2e+") || !email.endsWith("@e2e.macaly.dev")) return { ok: false }
    const u = (await ctx.db.query("users").collect()).find((x) => x.email === email)
    if (!u) return { ok: false }
    await ctx.db.patch(u._id, { loyaltyPoints: points })
    return { ok: true }
  },
})

/** Outil de test interne : ouvre les commandes 24 h/24 pendant un test, puis remet les horaires habituels. */
export const testHours = internalMutation({
  args: { allDay: v.boolean() },
  handler: async (ctx, { allDay }) => {
    const hours = allDay ? Array.from({ length: 7 }, () => ({ open: "00:00", close: "23:59" })) : [null, ...Array.from({ length: 6 }, () => ({ open: "09:00", close: "16:00" }))]
    const s = await ctx.db.query("shopSettings").first()
    if (s) await ctx.db.patch(s._id, { hours, open: true, pausedUntil: undefined, pauseReason: undefined })
    else await ctx.db.insert("shopSettings", { open: true, autoAccept: false, prepMinutes: 20, hours })
    return allDay ? "ouvert 24 h/24 (test)" : "horaires habituels rétablis"
  },
})

/**
 * Outil interne, avant la mise en service uniquement : efface l'accès cuisine, les employés et l'historique créés pendant les tests.
 * Refuse de s'exécuter dès qu'une vraie commande existe (l'historique réel n'est jamais effacé).
 */
export const resetTestTraces = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("orders").first()) return "refusé : des commandes existent"
    let n = 0
    for (const t of ["kitchenAccess", "kitchenSessions", "employees", "auditLog"] as const) for (const r of await ctx.db.query(t).collect()) { await ctx.db.delete(r._id); n++ }
    return `${n} élément(s) de test effacé(s)`
  },
})
