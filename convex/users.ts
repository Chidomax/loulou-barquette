import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import { roleValidator } from "./schema"
import { clean, gate } from "./lib"

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const u = await ctx.db.get(userId)
    if (!u) return null
    return { _id: u._id, email: u.email ?? null, name: u.name ?? null, role: u.role ?? null }
  },
})

/** Attribue le rôle à la première connexion : gérant (liste ADMIN_EMAILS) ou invitation en attente. */
export const claimRole = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false as const, message: "Connexion requise." }
    const u = await ctx.db.get(userId)
    if (!u?.email || !u.emailVerificationTime) return { ok: false as const, message: "Adresse e-mail non vérifiée." }
    const email = u.email.toLowerCase()
    if (adminEmails().includes(email)) {
      if (u.role !== "admin") await ctx.db.patch(userId, { role: "admin" })
      return { ok: true as const, role: "admin" as const }
    }
    if (u.role) return { ok: true as const, role: u.role }
    const invite = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).first()
    if (!invite) return { ok: false as const, message: "Aucune invitation pour cette adresse. Demandez au gérant de vous ajouter." }
    await ctx.db.patch(userId, { role: invite.role, name: invite.displayName ?? u.name })
    await ctx.db.delete(invite._id)
    return { ok: true as const, role: invite.role }
  },
})

export const updateMyName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const g = await gate(ctx, ["admin", "staff", "driver"])
    if (!g.ok) return g
    await ctx.db.patch(g.user._id, { name: clean(args.name, 60) })
    return { ok: true as const }
  },
})

export const team = query({
  args: {},
  handler: async (ctx) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const members = (await ctx.db.query("users").collect())
      .filter((u) => u.role)
      .map((u) => ({ _id: u._id, email: u.email ?? "", name: u.name ?? "", role: u.role! }))
    const invites = (await ctx.db.query("invites").collect()).map((i) => ({ _id: i._id, email: i.email, role: i.role, displayName: i.displayName ?? "" }))
    return { ok: true as const, members, invites, me: g.user._id }
  },
})

export const invite = mutation({
  args: { email: v.string(), role: roleValidator, displayName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    const email = args.email.trim().toLowerCase()
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) return { ok: false as const, code: "INVALID", message: "Adresse e-mail invalide." }
    const existingUser = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first()
    if (existingUser) {
      await ctx.db.patch(existingUser._id, { role: args.role, name: clean(args.displayName, 60) || existingUser.name })
      return { ok: true as const }
    }
    const existing = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).first()
    if (existing) await ctx.db.patch(existing._id, { role: args.role, displayName: clean(args.displayName, 60) })
    else await ctx.db.insert("invites", { email, role: args.role, displayName: clean(args.displayName, 60), createdBy: g.user._id })
    return { ok: true as const }
  },
})

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    await ctx.db.delete(args.inviteId)
    return { ok: true as const }
  },
})

/** Retire l'accès d'un membre (le gérant ne peut pas se retirer lui-même). */
export const removeAccess = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const g = await gate(ctx, ["admin"])
    if (!g.ok) return g
    if (args.userId === g.user._id) return { ok: false as const, code: "INVALID", message: "Vous ne pouvez pas retirer votre propre accès." }
    const target = await ctx.db.get(args.userId)
    if (target?.email && adminEmails().includes(target.email.toLowerCase())) return { ok: false as const, code: "INVALID", message: "Ce gérant est défini dans la configuration du site." }
    await ctx.db.patch(args.userId, { role: undefined })
    // Ferme ses sessions ouvertes
    const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", args.userId)).collect()
    for (const s of sessions) {
      const tokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect()
      for (const t of tokens) await ctx.db.delete(t._id)
      await ctx.db.delete(s._id)
    }
    return { ok: true as const }
  },
})

/** Outil interne (non accessible depuis le site) : invitation directe, utilisée pour les tests ou la reprise d'un compte. */
export const internalInvite = internalMutation({
  args: { email: v.string(), role: roleValidator, displayName: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const admin = (await ctx.db.query("users").collect()).find((u) => u.role === "admin")
    const email = a.email.trim().toLowerCase()
    const existing = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).first()
    if (existing) await ctx.db.patch(existing._id, { role: a.role, displayName: a.displayName })
    else await ctx.db.insert("invites", { email, role: a.role, displayName: a.displayName, createdBy: admin?._id })
  },
})
