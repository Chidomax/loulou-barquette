import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalQuery, type ActionCtx } from "./_generated/server"
import { callMacalyJson } from "./macaly"

const APP_FILES_PROTOCOL = "bindings_v1" as const
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_BYTES = 8 * 1024 * 1024
const dbEnv = () => (process.env.MACALY_DATABASE_ENVIRONMENT === "development" ? "development" : "production")

/** Seul le gérant peut envoyer ou supprimer des images. */
export const requireAdminId = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"users"> | null> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const u = await ctx.db.get(userId)
    return u?.role === "admin" ? userId : null
  },
})

async function adminId(ctx: Pick<ActionCtx, "runQuery">) {
  const id = await ctx.runQuery(internal.appFiles.requireAdminId, {})
  if (!id) throw new Error("Réservé au gérant.")
  return id
}

export const createImageUpload = action({
  args: { filename: v.string(), contentType: v.string(), fileSize: v.number() },
  handler: async (ctx, args) => {
    const uid = await adminId(ctx)
    if (!ALLOWED_TYPES.includes(args.contentType)) throw new Error("Formats acceptés : JPEG, PNG ou WebP.")
    if (!(args.fileSize > 0 && args.fileSize <= MAX_BYTES)) throw new Error("Image trop lourde (8 Mo maximum).")
    const response = await callMacalyJson("/api/client-app/app-files/create-upload", {
      filename: args.filename.replace(/[^\w.\-]/g, "_").slice(0, 80),
      contentType: args.contentType,
      fileSize: args.fileSize,
      visibility: "public",
      protocolVersion: APP_FILES_PROTOCOL,
      databaseEnvironment: dbEnv(),
      appSubjectId: uid,
    })
    return response.upload as { fileId: string; uploadUrl: string; method: "PUT"; headers: Record<string, string>; expiresAt: string; maxBytes: number }
  },
})

async function complete(ctx: Pick<ActionCtx, "runQuery">, fileId: string) {
  const uid = await adminId(ctx)
  const r = await callMacalyJson("/api/client-app/app-files/complete-upload", { fileId, protocolVersion: APP_FILES_PROTOCOL, databaseEnvironment: dbEnv(), appSubjectId: uid })
  const file = r.file as { fileId: string; contentType: string; url: string | null }
  if (!ALLOWED_TYPES.includes(file.contentType) || !file.url) {
    await remove(ctx, file.fileId).catch(() => undefined)
    throw new Error("Fichier refusé : seules les images sont acceptées.")
  }
  return file as { fileId: string; contentType: string; url: string }
}

async function remove(ctx: Pick<ActionCtx, "runQuery">, fileId: string) {
  const uid = await adminId(ctx)
  await callMacalyJson("/api/client-app/app-files/delete", { fileId, protocolVersion: APP_FILES_PROTOCOL, databaseEnvironment: dbEnv(), appSubjectId: uid })
}

export const finalizeDishImage = action({
  args: { itemId: v.id("menuItems"), fileId: v.string() },
  handler: async (ctx, args) => {
    const file = await complete(ctx, args.fileId)
    try {
      const old = await ctx.runMutation(internal.menu.setItemImage, { itemId: args.itemId, imageUrl: file.url, imageFileId: file.fileId })
      if (old) { await remove(ctx, old).catch(() => undefined); await ctx.runMutation(internal.menu.clearItemCleanup, { itemId: args.itemId }) }
    } catch (e) {
      await remove(ctx, file.fileId).catch(() => undefined)
      throw e
    }
    return { ok: true }
  },
})

export const removeDishImage = action({
  args: { itemId: v.id("menuItems") },
  handler: async (ctx, args) => {
    await adminId(ctx)
    const old = await ctx.runMutation(internal.menu.setItemImage, { itemId: args.itemId, imageUrl: undefined, imageFileId: undefined })
    if (old) { await remove(ctx, old).catch(() => undefined); await ctx.runMutation(internal.menu.clearItemCleanup, { itemId: args.itemId }) }
    return { ok: true }
  },
})

export const finalizePromoImage = action({
  args: { kind: v.union(v.literal("hero"), v.literal("une"), v.literal("bandeau"), v.literal("livreur"), v.literal("galerie")), fileId: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const file = await complete(ctx, args.fileId)
    const old = await ctx.runMutation(internal.menu.addPromo, { kind: args.kind, imageUrl: file.url, imageFileId: file.fileId, title: args.title })
    if (old) await remove(ctx, old).catch(() => undefined)
    return { ok: true }
  },
})

export const deletePromo = action({
  args: { promoId: v.id("promos") },
  handler: async (ctx, args) => {
    await adminId(ctx)
    const old = await ctx.runMutation(internal.menu.deletePromoInternal, { promoId: args.promoId })
    if (old) await remove(ctx, old).catch(() => undefined)
    return { ok: true }
  },
})

export const deleteDish = action({
  args: { itemId: v.id("menuItems") },
  handler: async (ctx, args) => {
    await adminId(ctx)
    const old = await ctx.runMutation(internal.menu.deleteItemInternal, { itemId: args.itemId })
    if (old) await remove(ctx, old).catch(() => undefined)
    return { ok: true }
  },
})
