import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import { rateLimit, round2 } from "./lib"

const stripeMode = () => ((process.env.VITE_STRIPE_MODE ?? "test") === "live" ? "live" : "test") as "test" | "live"

/** Prochaine partie à régler : d'abord le titre-restaurant, puis le complément par carte. */
export const nextPart = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const o = await ctx.db.get(orderId)
    if (!o || o.status !== "attente_paiement") return null
    if (o.montantTr > 0 && o.paidTr < o.montantTr - 0.001) return { part: "tr" as const, amount: round2(o.montantTr - o.paidTr), num: o.num, lignes: o.lignes }
    const due = round2(o.total - o.paidTr - o.paidCb)
    return due > 0.001 ? { part: "cb" as const, amount: due, num: o.num, lignes: o.lignes } : null
  },
})

export const allowCheckout = internalMutation({
  args: { orderId: v.id("orders") },
  handler: (ctx, { orderId }) => rateLimit(ctx, "checkout:" + orderId, 8, 10 * 60_000),
})

export const allowConfirm = internalMutation({
  args: { orderId: v.id("orders") },
  handler: (ctx, { orderId }) => rateLimit(ctx, "confirm:" + orderId, 20, 10 * 60_000),
})

export const recordSession = internalMutation({
  args: { orderId: v.id("orders"), sessionId: v.string(), part: v.union(v.literal("tr"), v.literal("cb")), amount: v.number() },
  handler: async (ctx, a) => {
    await ctx.db.insert("payments", { ...a, status: "open", mode: stripeMode() })
  },
})

/** Enregistre un paiement confirmé. Idempotent : un même paiement n'est jamais compté deux fois. */
export const settle = internalMutation({
  args: { sessionId: v.string(), orderId: v.id("orders"), part: v.union(v.literal("tr"), v.literal("cb")), amount: v.number(), mode: v.union(v.literal("test"), v.literal("live")) },
  handler: async (ctx, a) => {
    const existing = await ctx.db.query("payments").withIndex("by_session", (q) => q.eq("sessionId", a.sessionId)).first()
    if (existing?.status === "paid") return false
    if (existing) await ctx.db.patch(existing._id, { status: "paid", amount: a.amount })
    else await ctx.db.insert("payments", { orderId: a.orderId, sessionId: a.sessionId, part: a.part, amount: a.amount, status: "paid", mode: a.mode })
    await ctx.runMutation(internal.orders.markPaid, { orderId: a.orderId, part: a.part, amount: a.amount })
    return true
  },
})
