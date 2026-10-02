"use node"

import Stripe from "stripe"
import { v } from "convex/values"
import { action, internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"

const stripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!)
const toUnitAmount = (eur: number) => Math.round(eur * 100)
const stripeMode = () => ((process.env.VITE_STRIPE_MODE ?? "test") === "live" ? "live" : "test") as "test" | "live"

type CheckoutResult =
  | { ok: true; clientSecret: string; part: "tr" | "cb"; amount: number }
  | { ok: false; message: string }

/** Crée une session de paiement intégrée pour la prochaine partie due de la commande (identifiée par son jeton secret). */
export const createCheckoutSession = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<CheckoutResult> => {
    const order = await ctx.runQuery(internal.orders.getByTokenInternal, { token })
    if (!order) return { ok: false, message: "Commande introuvable." }
    const next = await ctx.runQuery(internal.payments.nextPart, { orderId: order._id })
    if (!next) return { ok: false, message: "Cette commande est déjà réglée." }
    if (!(await ctx.runMutation(internal.payments.allowCheckout, { orderId: order._id }))) return { ok: false, message: "Trop de tentatives de paiement. Réessayez dans quelques minutes." }
    const label = next.part === "tr" ? "part titre-restaurant" : order.montantTr > 0 ? "complément carte bancaire" : "paiement"
    const session = await stripe().checkout.sessions.create({
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      mode: "payment",
      locale: "fr",
      client_reference_id: order.num,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: toUnitAmount(next.amount),
          product_data: {
            name: `Commande ${order.num} – ${label}`,
            description: next.lignes.map((l) => `${l.qte}× ${l.article}`).join(", ").slice(0, 400),
          },
        },
      }],
      metadata: { orderId: order._id, part: next.part },
      payment_intent_data: { description: `Loulou Barquette ${order.num} (${label})`, metadata: { orderId: order._id, part: next.part } },
    })
    if (!session.client_secret) return { ok: false, message: "Le paiement n'a pas pu démarrer." }
    await ctx.runMutation(internal.payments.recordSession, { orderId: order._id, sessionId: session.id, part: next.part, amount: next.amount })
    return { ok: true, clientSecret: session.client_secret, part: next.part, amount: next.amount }
  },
})

/** Vérifie auprès de Stripe, juste après le paiement, que la session est bien payée (le webhook fait de même en parallèle). */
export const confirmLatest = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ paid: boolean; remaining: boolean }> => {
    const order = await ctx.runQuery(internal.orders.getByTokenInternal, { token })
    if (!order) return { paid: false, remaining: false }
    if (!(await ctx.runMutation(internal.payments.allowConfirm, { orderId: order._id }))) return { paid: false, remaining: true }
    const sessions = await stripe().checkout.sessions.list({ limit: 10, created: { gte: Math.floor(order._creationTime / 1000) - 60 } })
    let paid = false
    for (const s of sessions.data) {
      if (s.metadata?.orderId !== order._id || s.payment_status !== "paid") continue
      await ctx.runMutation(internal.payments.settle, { sessionId: s.id, orderId: order._id as Id<"orders">, part: s.metadata.part === "tr" ? "tr" : "cb", amount: (s.amount_total ?? 0) / 100, mode: stripeMode() })
      paid = true
    }
    const next = await ctx.runQuery(internal.payments.nextPart, { orderId: order._id })
    return { paid, remaining: !!next }
  },
})

export const handleWebhook = internalAction({
  args: { payload: v.string(), signature: v.string(), mode: v.union(v.literal("test"), v.literal("live")) },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    let event: Stripe.Event
    try {
      event = stripe().webhooks.constructEvent(args.payload, args.signature, process.env.STRIPE_WEBHOOK_SECRET!)
    } catch {
      return { success: false }
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object as Stripe.Checkout.Session
      const orderId = s.metadata?.orderId
      if (s.payment_status === "paid" && orderId) {
        await ctx.runMutation(internal.payments.settle, { sessionId: s.id, orderId: orderId as Id<"orders">, part: s.metadata?.part === "tr" ? "tr" : "cb", amount: (s.amount_total ?? 0) / 100, mode: args.mode })
      }
    }
    return { success: true }
  },
})
