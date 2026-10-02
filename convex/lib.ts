import { getAuthUserId } from "@convex-dev/auth/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"

export type Role = "admin" | "staff" | "driver"

// Règles métier (les montants affichés au client sont toujours recalculés ici, côté serveur)
export const FREE_DELIVERY_FROM = 50
export const MIN_DELIVERY_ORDER = 10
export const REWARD_POINTS = 2000 // points nécessaires pour une réduction
export const REWARD_VALUE = 5 // réduction en euros
export const TR_DAILY_CAP = 25 // plafond légal d'utilisation des titres-restaurant (25 €/jour)
export const RESTAURANT = { name: "Loulou Barquette", lat: -12.815606, lng: 45.200209 } // 13 Impasse Longchamps, Tsoundzou 2
export const PERSONAL_DATA_RETENTION_DAYS = 30

export type Gate = { ok: true; user: Doc<"users">; role: Role } | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN"; message: string }

/** Vérifie le rôle de l'utilisateur connecté. Ne lève jamais d'exception : renvoie un résultat. */
export async function gate(ctx: QueryCtx | MutationCtx, allowed: Role[]): Promise<Gate> {
  const userId = await getAuthUserId(ctx)
  if (!userId) return { ok: false, code: "UNAUTHENTICATED", message: "Connexion requise." }
  const user = await ctx.db.get(userId)
  if (!user || !user.role) return { ok: false, code: "FORBIDDEN", message: "Votre compte n'a pas encore d'accès. Demandez au gérant de vous inviter." }
  if (!allowed.includes(user.role)) return { ok: false, code: "FORBIDDEN", message: "Cette action n'est pas autorisée pour votre rôle." }
  return { ok: true, user, role: user.role }
}

/**
 * Limitation de débit par fenêtre fixe. Renvoie false si la limite est atteinte.
 * key : ex. "order:global", "order:tel:0639...", "loc:<driverId>"
 */
export async function rateLimit(ctx: MutationCtx, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now()
  const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).first()
  if (!row || now - row.windowStart >= windowMs) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 })
    else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 })
    return true
  }
  if (row.count >= max) return false
  await ctx.db.patch(row._id, { count: row.count + 1 })
  return true
}

export const clean = (s: string | undefined, max: number) =>
  (s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)

export const round2 = (n: number) => Math.round(n * 100) / 100

export function normalizePhone(tel: string) {
  return tel.replace(/[^\d+]/g, "")
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
